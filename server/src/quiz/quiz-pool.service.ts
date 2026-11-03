import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { haversineKm } from '../challenges/score';
import { DatabaseService } from '../database/database.service';
import { QUIZ_CHOICES, QUIZ_QUESTIONS } from '../rooms/quiz';
import type { QuizPoolAddResponse, QuizPoolItem, QuizPoolStats } from './quiz-api.types';
import { KAKAO_TIMEOUT_MS, KakaoGeocoderService, QuizRegion } from './kakao-geocoder.service';
import { QuizServerQuestion, shuffle, withShuffledChoices } from './quiz-question';

// 퀴즈를 내려면 풀에 이만큼은 모여 있어야 한다.
// QUIZ_POOL_MINIMUM 으로 바꿀 수 있지만 테스트용이고, 한 판 문제 수(QUIZ_QUESTIONS)보다 작게는 못 한다
export const QUIZ_POOL_MINIMUM = 40;
// 쉬움 문제의 보기(시·도 4개)를 만들려면 서로 다른 시·도가 이만큼 있어야 한다
const MIN_DISTINCT_R1 = QUIZ_CHOICES;
// 보고된 좌표가 저장된 좌표와 이 거리(km)보다 멀면 그 문제를 풀에서 뺀다
const REPORT_MISMATCH_KM = 0.1;
// 지역 확인은 동시에 몇 개씩, 요청 하나에서 전체로 쓸 수 있는 시간 (프론트 프록시 제한 8초 안에 끝나도록)
const GEOCODE_CONCURRENCY = 4;
const GEOCODE_BUDGET_MS = 6000;
// 문제를 고를 때 무작위로 뽑아 볼 후보 수 (한 판 문제 수의 배수)
const PICK_CANDIDATES_FACTOR = 6;

export const QUIZ_POOL_NOT_READY_MESSAGE = '문제를 모으는 중이에요. 잠시 후 다시 시도해주세요';
const NO_KAKAO_KEY_MESSAGE = '서버에 카카오 REST API 키(KAKAO_REST_API_KEY)가 설정되지 않아 문제를 모을 수 없어요';

interface PoolRow {
  pano_id: number;
  lat: number;
  lng: number;
  r1: string;
  r2: string;
}

// 4지선다 퀴즈 문제 풀 (SQLite quiz_pool 테이블).
// 브라우저는 로드뷰의 정확한 좌표만 보태고, 정답 지역 확인과 문제 선택은 모두 서버가 한다.
@Injectable()
export class QuizPoolService {
  private readonly minimum: number;

  constructor(
    private readonly database: DatabaseService,
    private readonly geocoder: KakaoGeocoderService,
    config: ConfigService,
  ) {
    const raw = Number(config.get<string>('QUIZ_POOL_MINIMUM'));
    this.minimum = Number.isInteger(raw) && raw > 0 ? Math.max(QUIZ_QUESTIONS, raw) : QUIZ_POOL_MINIMUM;
  }

  private get db() {
    return this.database.db;
  }

  // 사용 가능한(빠지지 않은) 문제 수와 퀴즈를 낼 수 있는지
  stats(): QuizPoolStats {
    const row = this.db
      .prepare('SELECT COUNT(*) AS total, COUNT(DISTINCT r1) AS regions FROM quiz_pool WHERE bad = 0')
      .get() as { total: number; regions: number };
    return {
      total: row.total,
      ready: row.total >= this.minimum && row.regions >= MIN_DISTINCT_R1,
      minimum: this.minimum,
    };
  }

  // 로드뷰 좌표를 풀에 보탠다. 이미 있는 panoId(풀에서 빠진 것 포함)와 지역 확인에 실패한 것은 건너뛴다
  async add(items: QuizPoolItem[]): Promise<QuizPoolAddResponse> {
    if (!this.geocoder.enabled) throw new ServiceUnavailableException(NO_KAKAO_KEY_MESSAGE);

    const unique = new Map<number, QuizPoolItem>();
    for (const { panoId, lat, lng } of items) if (!unique.has(panoId)) unique.set(panoId, { panoId, lat, lng });
    const ids = [...unique.keys()];
    const existing = new Set(
      (
        this.db
          .prepare(`SELECT pano_id FROM quiz_pool WHERE pano_id IN (${ids.map(() => '?').join(', ')})`)
          .all(...ids) as { pano_id: number }[]
      ).map((r) => r.pano_id),
    );
    const fresh = [...unique.values()].filter((item) => !existing.has(item.panoId));

    const regions = await this.geocodeAll(fresh);

    // 지역 확인을 기다리는 사이 다른 요청이 같은 panoId 를 넣었을 수 있어 OR IGNORE
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO quiz_pool (pano_id, lat, lng, r1, r2, bad, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)`,
    );
    const createdAt = new Date().toISOString();
    let added = 0;
    this.db.transaction(() => {
      fresh.forEach((item, i) => {
        const region = regions[i];
        if (region) added += insert.run(item.panoId, item.lat, item.lng, region.r1, region.r2, createdAt).changes;
      });
    })();

    const { total, ready } = this.stats();
    return { added, total, ready };
  }

  // 로드뷰를 띄운 뒤 실제 좌표 보고. 저장된 좌표와 100m 넘게 다르면 그 문제는 앞으로 내지 않는다
  report(item: QuizPoolItem): void {
    const row = this.db.prepare('SELECT lat, lng FROM quiz_pool WHERE pano_id = ? AND bad = 0').get(item.panoId) as
      | { lat: number; lng: number }
      | undefined;
    if (!row || haversineKm(row.lat, row.lng, item.lat, item.lng) <= REPORT_MISMATCH_KM) return;
    this.db.prepare('UPDATE quiz_pool SET bad = 1 WHERE pano_id = ?').run(item.panoId);
  }

  // 한 판 문제 만들기 (혼자 하기 / 대결 방 공용). 정답·좌표가 들어 있으니 그대로 내보내지 말 것 (toPublicQuestion)
  buildQuiz(count = QUIZ_QUESTIONS): QuizServerQuestion[] {
    if (!this.stats().ready) throw new ServiceUnavailableException(QUIZ_POOL_NOT_READY_MESSAGE);
    const picks = this.pickRows(count);
    if (picks.length < count) throw new ServiceUnavailableException(QUIZ_POOL_NOT_READY_MESSAGE);

    const regions = this.db.prepare('SELECT DISTINCT r1, r2 FROM quiz_pool WHERE bad = 0').all() as QuizRegion[];
    const r1s = [...new Set(regions.map((r) => r.r1))];
    return picks.map((row) => this.buildQuestion(row, regions, r1s));
  }

  // ───────────── 내부 ─────────────

  // 동시에 GEOCODE_CONCURRENCY 개씩. 시간(GEOCODE_BUDGET_MS)이 다 되면 남은 것은 건너뛴다 (다음에 다시 들어온다)
  private async geocodeAll(items: QuizPoolItem[]): Promise<(QuizRegion | null)[]> {
    const results: (QuizRegion | null)[] = items.map(() => null);
    const deadline = Date.now() + GEOCODE_BUDGET_MS;
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const i = next++;
        const left = deadline - Date.now();
        if (left <= 0) return;
        results[i] = await this.geocoder.regionOf(items[i].lat, items[i].lng, Math.min(KAKAO_TIMEOUT_MS, left));
      }
    };
    await Promise.all(Array.from({ length: Math.min(GEOCODE_CONCURRENCY, items.length) }, worker));
    return results;
  }

  // 무작위로 count 개. 같은 시·군·구가 겹치지 않게 먼저 고르고, 모자라면 나머지 후보로 채운다
  private pickRows(count: number): PoolRow[] {
    const candidates = this.db
      .prepare('SELECT pano_id, lat, lng, r1, r2 FROM quiz_pool WHERE bad = 0 ORDER BY RANDOM() LIMIT ?')
      .all(count * PICK_CANDIDATES_FACTOR) as PoolRow[];
    const picked: PoolRow[] = [];
    const rest: PoolRow[] = [];
    const usedRegions = new Set<string>();
    for (const row of candidates) {
      const key = regionLabel(row);
      if (usedRegions.has(key)) {
        rest.push(row);
        continue;
      }
      usedRegions.add(key);
      picked.push(row);
      if (picked.length === count) break;
    }
    for (const row of rest) {
      if (picked.length === count) break;
      picked.push(row);
    }
    return shuffle(picked);
  }

  private buildQuestion(row: PoolRow, regions: QuizRegion[], r1s: string[]): QuizServerQuestion {
    const location = { lat: row.lat, lng: row.lng, panoId: row.pano_id };
    // 시·군·구를 아는 문제는 절반 확률로 어려움. 어려움 보기를 못 만들면 쉬움으로
    const hard = row.r2 !== '' && randomInt(2) === 0 ? this.hardChoices(row, regions) : null;
    if (hard) return withShuffledChoices(location, hard, 'hard');
    // ready 조건(서로 다른 시·도 4곳 이상) 덕분에 다른 시·도 3개는 항상 있다
    const others = shuffle(r1s.filter((r1) => r1 !== row.r1)).slice(0, QUIZ_CHOICES - 1);
    return withShuffledChoices(location, [row.r1, ...others], 'easy');
  }

  // [정답, 오답 3개]. 오답: 같은 시·도에서 가장 가까운 다른 시·군·구 1개 + 다른 시·도의 시·군·구 2개. 못 만들면 null
  private hardChoices(row: PoolRow, regions: QuizRegion[]): string[] | null {
    // 거리 비교용 근사 (경도 1도의 길이 보정). 순서만 맞으면 되므로 제곱 거리
    const cosLat = Math.cos((row.lat * Math.PI) / 180);
    const near = this.db
      .prepare(
        `SELECT r2 FROM quiz_pool
         WHERE bad = 0 AND r1 = @r1 AND r2 <> '' AND r2 <> @r2
         ORDER BY (lat - @lat) * (lat - @lat) + (lng - @lng) * (lng - @lng) * @k
         LIMIT 1`,
      )
      .get({ r1: row.r1, r2: row.r2, lat: row.lat, lng: row.lng, k: cosLat * cosLat }) as { r2: string } | undefined;
    if (!near) return null;

    const farCount = QUIZ_CHOICES - 2;
    const far = shuffle(regions.filter((r) => r.r1 !== row.r1 && r.r2 !== ''))
      .slice(0, farCount)
      .map(regionLabel);
    if (far.length < farCount) return null;
    // (시·도, 시·군·구) 조합이 모두 달라서 이름도 겹치지 않는다
    return [regionLabel(row), regionLabel({ r1: row.r1, r2: near.r2 }), ...far];
  }
}

// 보기 이름. 어려움은 "경기도 성남시", 시·군·구가 없으면 시·도만
function regionLabel(r: QuizRegion): string {
  return r.r2 ? `${r.r1} ${r.r2}` : r.r1;
}

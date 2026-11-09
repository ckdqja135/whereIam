import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { haversineKm } from '../challenges/score';
import { DatabaseService } from '../database/database.service';
import { QUIZ_CHOICES, QUIZ_QUESTIONS } from '../rooms/quiz';
import { KakaoGeocoderService } from './kakao-geocoder.service';
import type { QuizPoolItem, StationPoolAddResponse, StationPoolItem, StationPoolStats, StationTodoItem } from './quiz-api.types';
import { QuizServerQuestion, shuffle, withShuffledChoices } from './quiz-question';
import { StationCatalogService } from './station-catalog.service';
import { StationPhotoCheckService } from './station-photo-check.service';
import { moveToNextExit, shuffledExits } from './station-exits';
import { awayFromExit, STATION_VIEW_RANGE } from './station-view';

// 지하철역 퀴즈를 내려면 문제로 낼 수 있는 역(로드뷰 + 사진 확인)이 이만큼 있어야 한다.
// 사진 확인(OCR)이 역당 몇 초 걸려서 처음 배포 직후 기다리는 시간을 줄이려고 작게 둔다 (STATION_POOL_MINIMUM 으로 변경 가능)
export const STATION_POOL_MINIMUM = 20;
// 출입구에서 이보다 먼 로드뷰는 받지 않는다 (브라우저는 50m, 없으면 100m 안에서 가장 가까운 로드뷰를 찾는다)
const PANO_MAX_KM = 0.12;
// 출입구 검색: 한 번에 동시에, 요청 하나에서 쓸 수 있는 시간 (프론트 프록시 제한 8초 안에)
const EXIT_CONCURRENCY = 4;
const EXIT_BUDGET_MS = 5000;
// 보고된 좌표가 저장된 좌표와 이 거리(km)보다 멀면 그 역은 문제에서 뺀다
const REPORT_MISMATCH_KM = 0.1;
// 어느 출입구에서도 쓸 로드뷰가 없던 역은 이 기간이 지나야 다시 찾게 한다
const RECHECK_MS = 14 * 24 * 60 * 60_000;
export const STATION_TODO_MAX = 20;
// 어려움: 가장 가까운 다른 역 이만큼 중에서 3개 / 쉬움: 이 거리(km) 넘게 떨어진 같은 도시의 역에서 3개
const HARD_NEAREST = 6;
const EASY_MIN_KM = 3;
const PICK_CANDIDATES_FACTOR = 6;

export const STATION_POOL_NOT_READY_MESSAGE = '지하철역 문제를 모으는 중이에요. 잠시 후 다시 시도해주세요';

interface StationRow {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
}

interface PooledRow extends StationRow {
  pano_id: number;
  pano_lat: number;
  pano_lng: number;
  exit_lat: number;
  exit_lng: number;
  view_pan: number | null;
  view_range: number | null;
}

// 지하철역 퀴즈 문제 풀 (SQLite stations 테이블의 pano_*, exit_*, view_* 칸).
// 역 목록과 이름은 서버만 갖고 있고, 브라우저는 역 출입구 바로 앞의 로드뷰만 찾아서 보탠다.
// 보탠 로드뷰는 StationPhotoCheckService 가 검사해서(출입구들을 등지는 방향, 다리 밑·터널, 역 이름 글자)
// 통과한 것만 문제로 나간다. 떨어지면 그 역의 다음 출입구에서 다시 찾는다 (station-exits.ts).
@Injectable()
export class StationPoolService {
  private readonly logger = new Logger(StationPoolService.name);
  private readonly minimum: number;

  constructor(
    private readonly database: DatabaseService,
    private readonly catalog: StationCatalogService,
    private readonly photoCheck: StationPhotoCheckService,
    private readonly kakao: KakaoGeocoderService,
    config: ConfigService,
  ) {
    const raw = Number(config.get<string>('STATION_POOL_MINIMUM'));
    this.minimum = Number.isInteger(raw) && raw > 0 ? Math.max(QUIZ_QUESTIONS, raw) : STATION_POOL_MINIMUM;
  }

  private get db() {
    return this.database.db;
  }

  stats(): StationPoolStats {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS stations,
                COALESCE(SUM(CASE WHEN pano_id IS NOT NULL AND bad = 0 AND checked = 1 THEN 1 ELSE 0 END), 0) AS total,
                COALESCE(SUM(CASE WHEN pano_id IS NOT NULL AND bad = 0 AND checked = 0 THEN 1 ELSE 0 END), 0) AS pending
         FROM stations`,
      )
      .get() as { stations: number; total: number; pending: number };
    return {
      total: row.total,
      pending: row.pending,
      stations: row.stations,
      ready: row.stations >= QUIZ_CHOICES && row.total >= this.minimum,
      minimum: this.minimum,
    };
  }

  // 아직 로드뷰를 못 찾은 역의 지금 출입구 좌표 (무작위). 출입구를 아직 안 찾아본 역은 지금 찾는다 (카카오 장소 검색).
  // 출입구가 없는 역은 문제로 내지 않는다 (역 중심 근처는 뚝방길·다리 밑인 경우가 있어서)
  async todo(n: number): Promise<StationTodoItem[]> {
    const count = Math.max(1, Math.min(STATION_TODO_MAX, Math.floor(n) || STATION_TODO_MAX));
    const before = new Date(Date.now() - RECHECK_MS).toISOString();
    const rows = this.db
      .prepare(
        `SELECT id, name, lat, lng, exit_lat, exit_lng, exit_checked_at FROM stations
         WHERE pano_id IS NULL AND bad = 0 AND (pano_checked_at IS NULL OR pano_checked_at < ?)
           AND (exit_checked_at IS NULL OR exit_lat IS NOT NULL)
         ORDER BY RANDOM() LIMIT ?`,
      )
      .all(before, count * 2) as {
      id: string;
      name: string;
      lat: number;
      lng: number;
      exit_lat: number | null;
      exit_lng: number | null;
      exit_checked_at: string | null;
    }[];

    await this.resolveExits(rows.filter((r) => r.exit_checked_at === null));
    return rows
      .filter((r) => r.exit_lat !== null && r.exit_lng !== null)
      .slice(0, count)
      .map((r) => ({ stationId: r.id, lat: r.exit_lat!, lng: r.exit_lng! }));
  }

  // 출입구 바로 앞 로드뷰를 보탠다. 이미 로드뷰가 있는 역, 출입구에서 너무 먼 로드뷰, 다른 역이 이미 쓰는 로드뷰는 건너뛴다.
  // 근처에 로드뷰가 없거나 예전에 검사에서 떨어진 로드뷰면 다음 출입구로 넘어간다.
  // 보탠 로드뷰는 사진 검사를 마칠 때까지 문제로 나가지 않는다
  add(items: StationPoolItem[]): StationPoolAddResponse {
    const find = this.db.prepare('SELECT exit_lat, exit_lng, pano_id FROM stations WHERE id = ?');
    const used = this.db.prepare('SELECT 1 FROM stations WHERE pano_id = ?');
    const rejected = this.db.prepare('SELECT 1 FROM station_rejected_panos WHERE station_id = ? AND pano_id = ?');
    const setPano = this.db.prepare(
      `UPDATE stations SET pano_id = ?, pano_lat = ?, pano_lng = ?, pano_cube = ?, pano_heading = ?, view_pan = NULL, view_range = NULL, checked = 0
       WHERE id = ? AND pano_id IS NULL`,
    );
    // 마지막 출입구까지 없으면 한동안 쉬었다가 첫 출입구부터 다시
    const markNone = this.db.prepare(
      `UPDATE stations SET pano_checked_at = ?, exit_try = 0,
              exit_lat = json_extract(exits, '$[0][0]'), exit_lng = json_extract(exits, '$[0][1]')
       WHERE id = ? AND pano_id IS NULL`,
    );
    const now = new Date().toISOString();
    let added = 0;
    this.db.transaction(() => {
      for (const item of items) {
        const station = find.get(item.stationId) as
          | { exit_lat: number | null; exit_lng: number | null; pano_id: number | null }
          | undefined;
        if (!station || station.pano_id !== null || station.exit_lat === null || station.exit_lng === null) continue;
        if (
          item.panoId === null ||
          item.lat === undefined ||
          item.lng === undefined ||
          !item.cube ||
          item.heading === undefined ||
          rejected.get(item.stationId, item.panoId)
        ) {
          if (!moveToNextExit(this.db, item.stationId)) markNone.run(now, item.stationId);
          continue;
        }
        if (haversineKm(station.exit_lat, station.exit_lng, item.lat, item.lng) > PANO_MAX_KM) continue;
        if (used.get(item.panoId)) continue;
        added += setPano.run(item.panoId, item.lat, item.lng, item.cube, item.heading, item.stationId).changes;
      }
    })();
    if (added > 0) this.photoCheck.kick();
    const { total, pending, ready } = this.stats();
    return { added, total, pending, ready };
  }

  // 플레이어가 정답 공개 뒤나 결과 화면에서 "역이 보였어요" 를 누르면 그 역은 바로 문제에서 뺀다
  flag(panoId: number): void {
    const row = this.db.prepare('SELECT name FROM stations WHERE pano_id = ? AND bad = 0').get(panoId) as { name: string } | undefined;
    if (!row) return;
    this.db.prepare('UPDATE stations SET bad = 3 WHERE pano_id = ? AND bad = 0').run(panoId);
    this.logger.log(`플레이어 신고로 문제에서 뺐습니다: ${row.name} (로드뷰 ${panoId})`);
  }

  // 로드뷰를 띄운 뒤 실제 좌표 보고 (지역 퀴즈와 같은 API). 지하철역 문제의 로드뷰가 아니면 아무것도 안 한다
  report(item: QuizPoolItem): void {
    const row = this.db.prepare('SELECT pano_lat, pano_lng FROM stations WHERE pano_id = ? AND bad = 0').get(item.panoId) as
      | { pano_lat: number; pano_lng: number }
      | undefined;
    if (!row || haversineKm(row.pano_lat, row.pano_lng, item.lat, item.lng) <= REPORT_MISMATCH_KM) return;
    this.db.prepare('UPDATE stations SET bad = 1 WHERE pano_id = ?').run(item.panoId);
  }

  // 한 판 문제 만들기 (혼자 하기 / 대결 방 공용). 정답·좌표가 들어 있으니 그대로 내보내지 말 것 (toPublicQuestion).
  // exclude: 플레이어가 최근에 본 문제. 되도록 빼고, 풀이 모자랄 때만 섞는다
  buildQuiz(count = QUIZ_QUESTIONS, exclude: ReadonlySet<number> = new Set()): QuizServerQuestion[] {
    if (!this.stats().ready) {
      // 역 목록이 비어 있으면 지금 모으기 시작한다 (키가 있을 때). 이번 요청은 503
      void this.catalog.refreshIfStale();
      throw new ServiceUnavailableException(STATION_POOL_NOT_READY_MESSAGE);
    }
    const select = this.db.prepare(
      `SELECT id, name, city, lat, lng, pano_id, pano_lat, pano_lng, exit_lat, exit_lng, view_pan, view_range FROM stations
       WHERE pano_id IS NOT NULL AND bad = 0 AND checked = 1 AND exit_lat IS NOT NULL
         AND pano_id NOT IN (SELECT value FROM json_each(?))
       ORDER BY RANDOM() LIMIT ?`,
    );
    const limit = count * PICK_CANDIDATES_FACTOR;
    const fresh = select.all(JSON.stringify([...exclude]), limit) as PooledRow[];
    // 안 본 문제만으로 모자라면 본 문제도 뒤에 붙인다
    const freshIds = new Set(fresh.map((r) => r.pano_id));
    const candidates =
      fresh.length >= count
        ? fresh
        : [...fresh, ...(select.all('[]', limit) as PooledRow[]).filter((r) => !freshIds.has(r.pano_id))];
    const all = this.db.prepare('SELECT id, name, city, lat, lng FROM stations').all() as StationRow[];

    // 같은 이름의 역은 한 판에 한 번만
    const questions: QuizServerQuestion[] = [];
    const usedNames = new Set<string>();
    for (const row of candidates) {
      if (questions.length === count) break;
      if (usedNames.has(row.name)) continue;
      const question = this.buildQuestion(row, all);
      if (!question) continue;
      usedNames.add(row.name);
      questions.push(question);
    }
    if (questions.length < count) throw new ServiceUnavailableException(STATION_POOL_NOT_READY_MESSAGE);
    return questions;
  }

  // ───────────── 내부 ─────────────

  // 출입구 찾기 (동시에 몇 개씩, 시간이 다 되면 남은 것은 다음에). 찾았으면 rows 의 exit_* 도 채운다 (첫 출입구부터)
  private async resolveExits(rows: { id: string; name: string; lat: number; lng: number; exit_lat: number | null; exit_lng: number | null }[]) {
    if (rows.length === 0 || !this.kakao.enabled) return;
    const save = this.db.prepare(
      'UPDATE stations SET exits = ?, exit_try = 0, exit_lat = ?, exit_lng = ?, exit_checked_at = ? WHERE id = ?',
    );
    const deadline = Date.now() + EXIT_BUDGET_MS;
    let next = 0;
    const worker = async () => {
      while (next < rows.length && Date.now() < deadline) {
        const row = rows[next++];
        const found = await this.kakao.searchStationExits(row.name, row.lat, row.lng);
        if (found === undefined) continue; // 요청 오류: 다음에 다시
        const exits = shuffledExits(found);
        const first = exits[0] ?? null;
        save.run(exits.length ? JSON.stringify(exits) : null, first?.[0] ?? null, first?.[1] ?? null, new Date().toISOString(), row.id);
        row.exit_lat = first?.[0] ?? null;
        row.exit_lng = first?.[1] ?? null;
      }
    };
    await Promise.all(Array.from({ length: Math.min(EXIT_CONCURRENCY, rows.length) }, worker));
  }

  private buildQuestion(row: PooledRow, all: StationRow[]): QuizServerQuestion | null {
    const question = this.buildChoices(row, all);
    // 사진 검사에서 정한 방향(출입구들을 등진 쪽)에서 시작, 좌우로 view_range 도까지
    if (question) {
      question.view =
        row.view_pan !== null && row.view_range !== null
          ? { pan: row.view_pan, range: row.view_range }
          : { pan: awayFromExit(row.pano_lat, row.pano_lng, row.exit_lat, row.exit_lng), range: STATION_VIEW_RANGE };
    }
    return question;
  }

  private buildChoices(row: PooledRow, all: StationRow[]): QuizServerQuestion | null {
    const location = { lat: row.pano_lat, lng: row.pano_lng, panoId: row.pano_id };
    // 다른 이름의 역을 가까운 순으로 (이름이 같은 다른 역, 예: 서울 양평역 / 경기 양평역은 보기에 넣지 않는다)
    const byDistance = (list: StationRow[]) =>
      uniqueNames(
        list
          .filter((s) => s.name !== row.name)
          .map((s) => ({ name: s.name, km: haversineKm(row.lat, row.lng, s.lat, s.lng) }))
          .sort((a, b) => a.km - b.km),
      );
    const sameCity = byDistance(all.filter((s) => s.city === row.city));
    const others = QUIZ_CHOICES - 1;

    // 절반은 어려움(이웃 역). 같은 도시에서 못 만들면 쉬움, 그것도 안 되면 전국에서 가까운 역으로
    const near = sameCity.slice(0, HARD_NEAREST);
    if (randomInt(2) === 0 && near.length >= others) {
      return withShuffledChoices(location, [row.name, ...pickRandom(near, others).map((s) => s.name)], 'hard');
    }
    const far = sameCity.filter((s) => s.km >= EASY_MIN_KM);
    if (far.length >= others) {
      return withShuffledChoices(location, [row.name, ...pickRandom(far, others).map((s) => s.name)], 'easy');
    }
    if (near.length >= others) {
      return withShuffledChoices(location, [row.name, ...pickRandom(near, others).map((s) => s.name)], 'hard');
    }
    const anywhere = byDistance(all).slice(0, HARD_NEAREST);
    if (anywhere.length < others) return null;
    return withShuffledChoices(location, [row.name, ...pickRandom(anywhere, others).map((s) => s.name)], 'hard');
  }
}

// 이름이 겹치면 앞의 것(가까운 것)만
function uniqueNames<T extends { name: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((s) => !seen.has(s.name) && seen.add(s.name));
}

function pickRandom<T>(items: T[], n: number): T[] {
  return shuffle(items).slice(0, n);
}

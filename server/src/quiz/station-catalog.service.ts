import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { KakaoGeocoderService, KakaoStationPlace, LngLatRect } from './kakao-geocoder.service';
import { KOREA_RECT, mergeStations, splitRect } from './station-catalog';

// 카카오 장소 검색은 한 사각형에서 최대 45개(15개 × 3쪽)까지만 준다. 그보다 많으면 4등분해서 다시 찾는다
const MAX_PAGES = 3;
const MAX_RESULTS = 45;
const MAX_DEPTH = 14;
// 역 목록을 다시 모으는 주기, 그 시기가 됐는지 확인하는 주기
const REFRESH_MS = 30 * 24 * 60 * 60_000;
const CHECK_MS = 24 * 60 * 60_000;
const SWEPT_AT_KEY = 'stations_swept_at';

// 전국 지하철역 목록 (SQLite stations 테이블). 서버가 시작할 때와 하루마다 확인해서, 30일이 지났으면 다시 모은다.
// 역 바로 앞 로드뷰(pano_*) 는 StationPoolService 가 관리하고, 여기서는 건드리지 않는다
@Injectable()
export class StationCatalogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StationCatalogService.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;

  constructor(
    private readonly database: DatabaseService,
    private readonly kakao: KakaoGeocoderService,
  ) {}

  onModuleInit() {
    // 서버 시작을 막지 않도록 뒤에서
    setTimeout(() => void this.refreshIfStale(), 0).unref();
    this.timer = setInterval(() => void this.refreshIfStale(), CHECK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // 지금 역 목록을 모으는 중인지
  get loading(): boolean {
    return this.running !== null;
  }

  // 오래됐으면(또는 한 번도 안 모았으면) 다시 모은다. 이미 모으는 중이면 그걸 기다린다
  refreshIfStale(): Promise<void> {
    if (this.running) return this.running;
    if (!this.kakao.enabled) return Promise.resolve();
    const row = this.database.db.prepare('SELECT value FROM app_meta WHERE key = ?').get(SWEPT_AT_KEY) as
      | { value: string }
      | undefined;
    const sweptAt = row ? Date.parse(row.value) : NaN;
    if (Number.isFinite(sweptAt) && Date.now() - sweptAt < REFRESH_MS) return Promise.resolve();

    this.running = this.refresh()
      .catch((err) => this.logger.warn(`지하철역 목록을 모으지 못했습니다: ${String(err)}`))
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  private async refresh(): Promise<void> {
    const started = Date.now();
    const places = await this.sweep();
    const stations = mergeStations(places);
    if (stations.length === 0) throw new Error('검색 결과가 없습니다');

    const now = new Date().toISOString();
    const db = this.database.db;
    const upsert = db.prepare(
      `INSERT INTO stations (id, name, lines, city, lat, lng, updated_at)
       VALUES (@id, @name, @lines, @city, @lat, @lng, @now)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, lines = excluded.lines, city = excluded.city,
         lat = excluded.lat, lng = excluded.lng, updated_at = excluded.updated_at`,
    );
    db.transaction(() => {
      for (const s of stations) upsert.run({ ...s, lines: s.lines.join(','), now });
      // 이번에 안 보인 역(폐역·이름 변경)은 뺀다. 검색이 전부 성공했을 때만 여기까지 온다
      db.prepare('DELETE FROM stations WHERE updated_at < ?').run(now);
      db.prepare(
        'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ).run(SWEPT_AT_KEY, now);
    })();
    this.logger.log(
      `지하철역 ${stations.length}곳 저장 (검색 결과 ${places.length}건, ${Math.round((Date.now() - started) / 1000)}초)`,
    );
  }

  // 전국을 사각형으로 나눠 가며 지하철역을 모두 찾는다. 요청이 하나라도 실패하면 throw (다음 확인 때 다시)
  private async sweep(): Promise<KakaoStationPlace[]> {
    const found = new Map<string, KakaoStationPlace>();
    const queue: { rect: LngLatRect; depth: number }[] = [{ rect: KOREA_RECT, depth: 0 }];
    while (queue.length > 0) {
      const { rect, depth } = queue.shift()!;
      const first = await this.search(rect, 1);
      if (first.totalCount > MAX_RESULTS && depth < MAX_DEPTH) {
        queue.push(...splitRect(rect).map((r) => ({ rect: r, depth: depth + 1 })));
        continue;
      }
      for (const p of first.places) found.set(p.id, p);
      for (let page = 2, end = first.isEnd; !end && page <= MAX_PAGES; page++) {
        const next = await this.search(rect, page);
        for (const p of next.places) found.set(p.id, p);
        end = next.isEnd;
      }
    }
    return [...found.values()];
  }

  // 한 번 실패하면 한 번 더 시도
  private async search(rect: LngLatRect, page: number) {
    const res = (await this.kakao.searchStations(rect, page)) ?? (await this.kakao.searchStations(rect, page));
    if (!res) throw new Error('카카오 지하철역 검색 실패');
    return res;
  }
}

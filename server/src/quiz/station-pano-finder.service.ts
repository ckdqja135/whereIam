import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { haversineKm } from '../challenges/score';
import { DatabaseService } from '../database/database.service';
import { ROADVIEW_CUBE_PATTERN } from './dto/quiz.dto';
import type { StationPoolItem, StationTodoItem } from './quiz-api.types';
import { STATION_TODO_MAX, StationPoolService } from './station-pool.service';
import { normalizeDeg } from './station-view';

// 카카오맵 로드뷰 검색 (카카오맵 웹이 쓰는 주소, 키 없음). 가까운 순으로 최대 PAGE_SIZE 개, 같은 자리는 가장 최근 사진만 온다
const ROADVIEW_SEARCH_URL = 'https://rv.map.kakao.com/roadview-search/v2/nodes';
// 출입구에서 이 거리(m) 안의 가장 가까운 로드뷰 (브라우저와 같게)
const SEARCH_RADIUS_M = 100;
const SEARCH_TIMEOUT_MS = 5000;
// 요청 사이 간격 (카카오에 부담을 주지 않게)
const REQUEST_GAP_MS = 500;
// 찾을 역이 있는지 보는 주기 / 검색이 안 되면 이 시간 뒤에 다시
const POLL_MS = 30_000;
const RETRY_MS = 10 * 60_000;
// 사진 검사를 기다리는 역이 이만큼 있으면 더 찾지 않는다 (검사에서 떨어진 역은 다음 출입구를 다시 찾아야 해서 앞서가지 않는다)
const PENDING_MAX = 20;

// 검색 결과 한 건. angle 은 사진 앞면(front)의 반대 방향 (브라우저가 잰 앞면 방향과 비교해 확인)
interface RoadviewNode {
  id?: number;
  angle?: string;
  img_path?: string;
  wgsx?: number;
  wgsy?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 아직 로드뷰가 없는 역의 출입구 앞 로드뷰를 서버가 직접 찾는다. 브라우저가 게임하는 동안 찾는 것(quiz-pool.ts)보다 훨씬 빨리
// 모든 역에 사진이 생긴다. 찾은 로드뷰는 브라우저가 보탠 것과 똑같이 StationPoolService.add 로 넣고, 사진 검사를 마쳐야 문제로 나간다.
// STATION_PANO_SEARCH=off 면 하지 않는다 (브라우저만 찾는다)
@Injectable()
export class StationPanoFinderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StationPanoFinderService.name);
  private readonly enabled: boolean;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private pausedUntil = 0;

  constructor(
    private readonly database: DatabaseService,
    private readonly pool: StationPoolService,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('STATION_PANO_SEARCH')?.trim().toLowerCase() !== 'off';
  }

  onModuleInit() {
    if (!this.enabled) return;
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // 한 번에 한 묶음 (최대 STATION_TODO_MAX 역)
  private async tick(): Promise<void> {
    if (this.busy || Date.now() < this.pausedUntil || this.pool.stats().pending >= PENDING_MAX) return;
    this.busy = true;
    try {
      const todo = await this.pool.todo(STATION_TODO_MAX);
      const items: StationPoolItem[] = [];
      for (const station of todo) {
        const item = await this.find(station);
        if (!item) {
          this.pausedUntil = Date.now() + RETRY_MS;
          break;
        }
        items.push(item);
        await sleep(REQUEST_GAP_MS);
      }
      if (items.length === 0) return;
      const { added } = this.pool.add(items);
      const none = items.filter((i) => i.panoId === null).length;
      this.logger.log(`역 출입구 앞 로드뷰를 찾았습니다: ${added}곳 (근처에 없어 다음 출입구로 ${none}곳)`);
    } catch (err) {
      this.logger.warn(`역 출입구 앞 로드뷰 찾기를 잠시 멈춥니다: ${String(err)}`);
      this.pausedUntil = Date.now() + RETRY_MS;
    } finally {
      this.busy = false;
    }
  }

  // 출입구에서 가장 가까운 로드뷰 (신고·검사로 뺀 것, 다른 역이 쓰는 것은 건너뛴다). 없으면 panoId: null, 검색이 안 되면 undefined
  private async find(station: StationTodoItem): Promise<StationPoolItem | undefined> {
    const params = new URLSearchParams({
      PX: String(station.lng),
      PY: String(station.lat),
      RAD: String(SEARCH_RADIUS_M),
      PAGE_SIZE: '100',
      INPUT: 'wgs',
      TYPE: 'w',
      SERVICE: 'glpano',
    });
    let nodes: RoadviewNode[];
    try {
      const res = await fetch(`${ROADVIEW_SEARCH_URL}?${params}`, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
      if (!res.ok) {
        this.logger.warn(`카카오 로드뷰 검색 실패: HTTP ${res.status}`);
        return undefined;
      }
      const body = (await res.json()) as { street_view?: { streetList?: RoadviewNode[] | null } };
      if (!body?.street_view) {
        this.logger.warn('카카오 로드뷰 검색 결과 형식이 바뀌었습니다');
        return undefined;
      }
      nodes = Array.isArray(body.street_view.streetList) ? body.street_view.streetList : [];
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      this.logger.warn(`카카오 로드뷰 검색 요청 오류: ${name === 'TimeoutError' ? '시간 초과' : String(err)}`);
      return undefined;
    }

    const exclude = new Set(station.exclude ?? []);
    const used = this.database.db.prepare('SELECT 1 FROM stations WHERE pano_id = ?');
    const candidates = nodes
      .map((n) => ({
        panoId: Number(n.id),
        lat: Number(n.wgsy),
        lng: Number(n.wgsx),
        cube: typeof n.img_path === 'string' ? n.img_path.replace(/^\//, '') : '',
        angle: Number(n.angle),
      }))
      .filter(
        (n) =>
          Number.isSafeInteger(n.panoId) &&
          n.panoId > 0 &&
          Number.isFinite(n.lat) &&
          Number.isFinite(n.lng) &&
          Number.isFinite(n.angle) &&
          ROADVIEW_CUBE_PATTERN.test(n.cube),
      )
      .map((n) => ({ ...n, km: haversineKm(station.lat, station.lng, n.lat, n.lng) }))
      .filter((n) => n.km * 1000 <= SEARCH_RADIUS_M && !exclude.has(n.panoId))
      .sort((a, b) => a.km - b.km);
    const pick = candidates.find((n) => !used.get(n.panoId));
    if (!pick) return { stationId: station.stationId, panoId: null };
    return {
      stationId: station.stationId,
      panoId: pick.panoId,
      lat: pick.lat,
      lng: pick.lng,
      cube: pick.cube,
      heading: Math.round(normalizeDeg(pick.angle + 180) * 10) / 10,
    };
  }
}

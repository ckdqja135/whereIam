import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import { DatabaseService } from '../database/database.service';

// 카카오 로드뷰 사진 주소. 테스트에서만 ROADVIEW_IMAGE_BASE 로 가짜 서버 주소를 넣는다
const DEFAULT_IMAGE_BASE = 'https://map.kakaocdn.net/map_roadview';
// 둘러볼 때 보이는 옆면 4장만 본다 (위·아래 면은 하늘과 촬영 차량)
const FACES = ['front', 'right', 'back', 'left'];
const IMAGE_TIMEOUT_MS = 10_000;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
// 확인할 역이 있는지 보는 주기 / 할 일이 없으면 이 시간 뒤 OCR 엔진을 내려 메모리를 돌려준다
const POLL_MS = 5_000;
const IDLE_STOP_MS = 60_000;
// 사진을 못 받았거나 OCR 엔진을 못 띄우면 이 시간 뒤에 다시
const RETRY_MS = 10 * 60_000;

interface PendingStation {
  id: string;
  name: string;
  cube: string;
}

// 지하철역 문제 사진 검사. 역 바로 앞 로드뷰 사진(옆면 4장)에서 역 이름 글자를 찾아(OCR, tesseract)
// 보이면 그 역은 문제에서 뺀다 (bad = 2). 사진을 고치지는 않는다.
// 확인을 마친 역(checked = 1)만 문제로 나간다. 한 번에 한 역씩, 역당 몇 초 걸린다.
// STATION_SIGN_CHECK=off 면 OCR 없이 바로 확인된 것으로 친다 (역 이름이 보이는 문제가 나올 수 있음)
@Injectable()
export class StationSignCheckService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StationSignCheckService.name);
  private readonly imageBase: string;
  private readonly cachePath: string;
  private readonly enabled: boolean;
  private worker: Promise<Worker> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private lastWorkAt = 0;
  private pausedUntil = 0;
  private readonly retryAfter = new Map<string, number>();

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService,
  ) {
    this.imageBase = (config.get<string>('ROADVIEW_IMAGE_BASE')?.trim() || DEFAULT_IMAGE_BASE).replace(/\/+$/, '');
    this.enabled = config.get<string>('STATION_SIGN_CHECK')?.trim().toLowerCase() !== 'off';
    // 한국어 글자 데이터(kor.traineddata, 처음 한 번 내려받음)는 DB 파일 옆 tessdata/ 에 둔다
    this.cachePath = join(dirname(resolve(config.get<string>('DB_PATH') || './data/whereiam.db')), 'tessdata');
  }

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    this.timer.unref();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.stopWorker();
  }

  // 새 로드뷰가 들어오면 다음 주기를 기다리지 않고 바로 확인을 시작한다
  kick(): void {
    void this.tick();
  }

  private async tick(): Promise<void> {
    if (this.busy || Date.now() < this.pausedUntil) return;
    this.busy = true;
    try {
      let station = this.nextStation();
      if (!station && this.worker && Date.now() - this.lastWorkAt > IDLE_STOP_MS) await this.stopWorker();
      while (station) {
        await this.check(station);
        this.lastWorkAt = Date.now();
        station = this.nextStation();
      }
    } catch (err) {
      // OCR 엔진을 못 띄운 경우 (한국어 글자 데이터를 못 받는 등). 잠시 쉬었다가 다시
      this.logger.warn(`지하철역 사진 확인을 잠시 멈춥니다: ${String(err)}`);
      this.pausedUntil = Date.now() + RETRY_MS;
      await this.stopWorker();
    } finally {
      this.busy = false;
    }
  }

  private nextStation(): PendingStation | undefined {
    const now = Date.now();
    const rows = this.database.db
      .prepare(
        `SELECT id, name, pano_cube AS cube FROM stations
         WHERE pano_id IS NOT NULL AND pano_cube IS NOT NULL AND bad = 0 AND checked = 0
         LIMIT 50`,
      )
      .all() as PendingStation[];
    return rows.find((r) => (this.retryAfter.get(r.id) ?? 0) <= now);
  }

  private async check(station: PendingStation): Promise<void> {
    const key = signKey(station.name);
    let visible = false;
    if (this.enabled && key.length >= 2) {
      let images: Buffer[];
      try {
        images = await Promise.all(FACES.map((face) => this.download(station.cube, face)));
      } catch (err) {
        this.logger.warn(`로드뷰 사진을 받지 못했습니다 (${station.name}): ${String(err)}`);
        this.retryAfter.set(station.id, Date.now() + RETRY_MS);
        return;
      }
      const worker = await this.getWorker();
      for (const image of images) {
        const { data } = await worker.recognize(image);
        if (normalizeText(data.text).includes(key)) {
          visible = true;
          break;
        }
      }
    }
    // 확인하는 사이 다른 로드뷰로 바뀌지 않았을 때만
    this.database.db
      .prepare(`UPDATE stations SET checked = 1, bad = CASE WHEN ? THEN 2 ELSE bad END WHERE id = ? AND pano_cube = ?`)
      .run(visible ? 1 : 0, station.id, station.cube);
    this.retryAfter.delete(station.id);
    if (visible) this.logger.log(`사진에 역 이름이 보여 문제에서 뺐습니다: ${station.name}`);
  }

  private async download(cube: string, face: string): Promise<Buffer> {
    const res = await fetch(`${this.imageBase}/${cube}_cube/${face}_1200.jpg`, {
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > IMAGE_MAX_BYTES) throw new Error(`사진 크기 ${buf.length}`);
    return buf;
  }

  // 한국어, 흩어진 글자 찾기 모드 (간판처럼 사진 곳곳에 있는 글자에 맞고 빠르다)
  private getWorker(): Promise<Worker> {
    if (!this.worker) {
      mkdirSync(this.cachePath, { recursive: true });
      const created = createWorker('kor', undefined, { cachePath: this.cachePath }).then(async (w) => {
        await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        return w;
      });
      created.catch(() => {
        if (this.worker === created) this.worker = null;
      });
      this.worker = created;
    }
    return this.worker;
  }

  private async stopWorker(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    if (worker) await worker.then((w) => w.terminate()).catch(() => {});
  }
}

// 사진에서 찾을 글자: "가능역" → "가능", "동대문역사문화공원역" → "동대문역사문화공원"
export function signKey(stationName: string): string {
  return normalizeText(stationName.replace(/역$/, ''));
}

// 띄어쓰기·문장 부호·기호를 뺀다 (간판 글자 사이 공백, OCR 이 끼워 넣은 점 등)
export function normalizeText(text: string): string {
  return text.replace(/[\s\p{P}\p{S}]/gu, '');
}

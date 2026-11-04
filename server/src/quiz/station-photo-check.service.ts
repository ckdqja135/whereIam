import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import { DatabaseService } from '../database/database.service';
import { SCENE_SIDE_FACES, type SceneFace } from './roadview-scene';
import { parseExits, rejectStationPano } from './station-exits';
import { StationSceneClassifier } from './station-scene-classifier';
import { chooseStationView, isVisibleDirection, normalizeDeg, type StationView } from './station-view';

// 카카오 로드뷰 사진 주소. 테스트에서만 ROADVIEW_IMAGE_BASE 로 가짜 서버 주소를 넣는다
const DEFAULT_IMAGE_BASE = 'https://map.kakaocdn.net/map_roadview';
// 면 하나의 가로 시야 절반 / 사진 크기 (주소의 _1200)
const FACE_HALF_DEG = 45;
const FACE_SIZE = 1200;
const IMAGE_TIMEOUT_MS = 10_000;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
// 확인할 역이 있는지 보는 주기 / 할 일이 없으면 이 시간 뒤 OCR 엔진과 장면 판별 프로세스를 내려 메모리를 돌려준다
const POLL_MS = 5_000;
const IDLE_STOP_MS = 60_000;
// 사진을 못 받았거나 OCR 엔진·장면 판별 모델을 못 띄우면 이 시간 뒤에 다시
const RETRY_MS = 10 * 60_000;
// 시작 방향과 좌우 끝 방향 중 한 곳이라도 이 확률 이상이면 다리 밑·터널 같은 곳으로 본다
const COVERED_THRESHOLD = 0.8;

// stations.bad 번호 (database.service.ts)
const BAD_SIGN = 2;
const BAD_COVERED = 4;
const BAD_NO_VIEW = 5;

const REJECT_LABEL: Record<number, string> = {
  [BAD_SIGN]: '사진에 역 이름이 보임',
  [BAD_COVERED]: '다리 밑·터널 같은 곳',
  [BAD_NO_VIEW]: '출입구가 안 보이는 방향이 없음',
};

interface PendingStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  exits: string | null;
  exit_lat: number | null;
  exit_lng: number | null;
  cube: string;
  heading: number;
  pano_lat: number;
  pano_lng: number;
}

interface TextLine {
  text: string;
  bbox: { x0: number; x1: number };
}

// 지하철역 문제 사진 검사. 출입구 앞 로드뷰마다
//  1. 역의 출입구들과 역 건물을 모두 등지는 시작 방향과 돌릴 수 있는 각도를 정하고 (station-view.ts, 없으면 탈락)
//  2. 플레이어에게 보이는 쪽 사진에서 역 이름 글자를 찾고 (OCR, tesseract)
//  3. 보이는 방향들이 다리 밑·터널·고가 아래처럼 머리 위가 막힌 곳인지 본다 (CLIP, scene-worker.ts)
// 떨어지면 그 역의 다음 출입구에서 다시 찾고(station-exits.ts), 통과하면 checked = 1 로 문제에 나간다.
// 한 번에 한 역씩, 역당 몇 초 걸린다.
// STATION_SIGN_CHECK=off 면 글자 검사를, STATION_SCENE_CHECK=off 면 다리 밑·터널 검사를 건너뛴다
@Injectable()
export class StationPhotoCheckService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StationPhotoCheckService.name);
  private readonly imageBase: string;
  private readonly cachePath: string;
  private readonly signCheck: boolean;
  private readonly scene: StationSceneClassifier | null;
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
    this.signCheck = config.get<string>('STATION_SIGN_CHECK')?.trim().toLowerCase() !== 'off';
    const dataDir = dirname(resolve(config.get<string>('DB_PATH') || './data/whereiam.db'));
    // 한국어 글자 데이터(kor.traineddata, 처음 한 번 내려받음)는 DB 파일 옆 tessdata/ 에,
    // 장면 판별 모델(약 89MB, 처음 한 번 내려받음)은 models/ 에 둔다
    this.cachePath = join(dataDir, 'tessdata');
    this.scene =
      config.get<string>('STATION_SCENE_CHECK')?.trim().toLowerCase() === 'off'
        ? null
        : new StationSceneClassifier(join(dataDir, 'models', 'clip-vit-base-patch32-vision-q8.onnx'));
  }

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    this.timer.unref();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.stopEngines();
  }

  // 새 로드뷰가 들어오면 다음 주기를 기다리지 않고 바로 검사를 시작한다
  kick(): void {
    void this.tick();
  }

  private async tick(): Promise<void> {
    if (this.busy || Date.now() < this.pausedUntil) return;
    this.busy = true;
    try {
      let station = this.nextStation();
      if (!station && Date.now() - this.lastWorkAt > IDLE_STOP_MS) await this.stopEngines();
      while (station) {
        await this.check(station);
        this.lastWorkAt = Date.now();
        station = this.nextStation();
      }
    } catch (err) {
      // OCR 엔진이나 장면 판별 모델을 못 띄운 경우 (글자 데이터·모델을 못 받는 등). 잠시 쉬었다가 다시
      this.logger.warn(`지하철역 사진 검사를 잠시 멈춥니다: ${String(err)}`);
      this.pausedUntil = Date.now() + RETRY_MS;
      await this.stopEngines();
    } finally {
      this.busy = false;
    }
  }

  private nextStation(): PendingStation | undefined {
    const now = Date.now();
    const rows = this.database.db
      .prepare(
        `SELECT id, name, lat, lng, exits, exit_lat, exit_lng, pano_cube AS cube, pano_heading AS heading, pano_lat, pano_lng
         FROM stations
         WHERE pano_id IS NOT NULL AND pano_cube IS NOT NULL AND pano_heading IS NOT NULL AND bad = 0 AND checked = 0
         LIMIT 50`,
      )
      .all() as PendingStation[];
    return rows.find((r) => (this.retryAfter.get(r.id) ?? 0) <= now);
  }

  private async check(station: PendingStation): Promise<void> {
    const pano = { lat: station.pano_lat, lng: station.pano_lng };
    const exits = parseExits(station.exits).map(([lat, lng]) => ({ lat, lng }));
    if (exits.length === 0 && station.exit_lat !== null && station.exit_lng !== null) {
      exits.push({ lat: station.exit_lat, lng: station.exit_lng });
    }
    const view = chooseStationView(pano, { lat: station.lat, lng: station.lng }, exits);
    if (!view) return this.reject(station, BAD_NO_VIEW);

    const key = signKey(station.name);
    const ocr = this.signCheck && key.length >= 2;
    if (!ocr && !this.scene) return this.accept(station, view);

    // 화면에 들어올 수 있는 옆면 (면의 가장자리라도) + 다리 밑·터널 검사에는 윗면도
    const sides = SCENE_SIDE_FACES.map((face, i) => ({ face, center: normalizeDeg(station.heading + i * 90) })).filter(
      ({ center }) =>
        isVisibleDirection(center - FACE_HALF_DEG, view) ||
        isVisibleDirection(center + FACE_HALF_DEG, view) ||
        isVisibleDirection(center, view),
    );
    const wanted: SceneFace[] = [...sides.map((s) => s.face), ...(this.scene ? (['top'] as const) : [])];
    let images: Partial<Record<SceneFace, Buffer>>;
    try {
      images = Object.fromEntries(
        await Promise.all(wanted.map(async (face) => [face, await this.download(station.cube, face)] as const)),
      );
    } catch (err) {
      this.logger.warn(`로드뷰 사진을 받지 못했습니다 (${station.name}): ${String(err)}`);
      this.retryAfter.set(station.id, Date.now() + RETRY_MS);
      return;
    }

    if (ocr) {
      const worker = await this.getWorker();
      for (const { face, center } of sides) {
        const { data } = await worker.recognize(images[face]!, {}, { blocks: true });
        if (!normalizeText(data.text).includes(key)) continue;
        // 글자 줄의 가로 위치 → 방향. 줄이 나뉘어 위치를 모르면 그 면의 가운데로 본다
        const lines: TextLine[] = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
        const hits = lines.filter((l) => normalizeText(l.text).includes(key));
        const directions = hits.length
          ? hits.map((l) => {
              const x = (l.bbox.x0 + l.bbox.x1) / 2;
              return center + (Math.atan((x - FACE_SIZE / 2) / (FACE_SIZE / 2)) * 180) / Math.PI;
            })
          : [center];
        if (directions.some((d) => isVisibleDirection(d, view))) return this.reject(station, BAD_SIGN);
      }
    }

    if (this.scene) {
      const pans = [view.pan - view.range, view.pan, view.pan + view.range];
      const scores = await this.scene.coveredScores(images, station.heading, pans);
      if (Math.max(...scores) >= COVERED_THRESHOLD) return this.reject(station, BAD_COVERED);
    }
    this.accept(station, view);
  }

  private accept(station: PendingStation, view: StationView) {
    // 검사하는 사이 다른 로드뷰로 바뀌지 않았을 때만
    this.database.db
      .prepare('UPDATE stations SET checked = 1, view_pan = ?, view_range = ? WHERE id = ? AND pano_cube = ?')
      .run(view.pan, view.range, station.id, station.cube);
    this.retryAfter.delete(station.id);
  }

  private reject(station: PendingStation, reason: number) {
    const retry = rejectStationPano(this.database.db, station.id, station.cube, reason);
    this.retryAfter.delete(station.id);
    this.logger.log(
      retry
        ? `${REJECT_LABEL[reason]}, 다른 출입구에서 다시 찾습니다: ${station.name}`
        : `${REJECT_LABEL[reason]}, 남은 출입구가 없어 문제에서 뺐습니다: ${station.name}`,
    );
  }

  private async download(cube: string, face: SceneFace): Promise<Buffer> {
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
      const created = createWorker('kor', undefined, {
        cachePath: this.cachePath,
        // 엔진 내부 메시지를 숨기는 작업 스레드 (tesseract-quiet-worker.ts)
        workerPath: join(__dirname, 'tesseract-quiet-worker.js'),
      }).then(async (w) => {
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

  private async stopEngines(): Promise<void> {
    this.scene?.stop();
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

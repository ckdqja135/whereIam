import { decode } from 'jpeg-js';
import { BARE_LABELS, SCENE_LABELS } from './scene-text-embeds';

// 지하철역 문제 사진이 다리 밑·터널·고가 아래처럼 머리 위가 막힌 곳인지, 건물 없이 논밭·숲만 보이는 곳인지 가리는 데 쓰는 그림 처리.
// 로드뷰 정육면체 사진(면마다 1200px)을 줄인 뒤, 플레이어가 보게 될 방향의 화면을 CLIP 입력(224px)으로 그린다.
// 각도는 카카오 로드뷰와 같이 0 = 북쪽, 시계 방향. heading 은 사진 앞면(front)의 방향

export const SCENE_SIDE_FACES = ['front', 'right', 'back', 'left'] as const;
export type SceneFace = (typeof SCENE_SIDE_FACES)[number] | 'top';

export interface FacePixels {
  size: number;
  data: Uint8Array; // RGB
}

// 계산용으로 줄인 면 크기 (1200 → 300, 4x4 평균)
const SMALL_FACE = 300;
// CLIP 입력: 224px 정사각형, 가로 시야 90도, 살짝 위(10도)를 본다 (머리 위 구조물이 화면에 들어오게)
const INPUT_SIZE = 224;
const VIEW_FOV_DEG = 90;
const VIEW_TILT_DEG = 10;
const CLIP_MEAN = [0.48145466, 0.4578275, 0.40821073];
const CLIP_STD = [0.26862954, 0.26130258, 0.27577711];
const CLIP_LOGIT_SCALE = 100;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function decodeFace(jpeg: Uint8Array): FacePixels {
  const img = decode(jpeg, { useTArray: true, formatAsRGBA: false, maxMemoryUsageInMB: 64 });
  const factor = Math.max(1, Math.round(Math.min(img.width, img.height) / SMALL_FACE));
  const size = Math.floor(Math.min(img.width, img.height) / factor);
  const data = new Uint8Array(size * size * 3);
  const n = factor * factor;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < factor; dy++) {
        let i = ((y * factor + dy) * img.width + x * factor) * 3;
        for (let dx = 0; dx < factor; dx++, i += 3) {
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
        }
      }
      const o = (y * size + x) * 3;
      data[o] = r / n;
      data[o + 1] = g / n;
      data[o + 2] = b / n;
    }
  }
  return { size, data };
}

// 사진 앞면 기준 방위 az, 고도 el(위가 +) 방향의 색. 그 방향의 면이 없으면 null
function sampleCube(faces: Partial<Record<SceneFace, FacePixels>>, az: number, el: number, out: number[]): boolean {
  const a = toRad(az);
  const e = toRad(el);
  const fwd = Math.cos(e) * Math.cos(a);
  const right = Math.cos(e) * Math.sin(a);
  const up = Math.sin(e);
  let face: SceneFace;
  let x: number;
  let y: number;
  if (up >= Math.abs(fwd) && up >= Math.abs(right)) {
    // 윗면: 아래 변이 앞면, 오른쪽 변이 오른쪽 면에 붙어 있다
    face = 'top';
    x = right / up;
    y = fwd / up;
  } else if (Math.abs(fwd) >= Math.abs(right)) {
    face = fwd > 0 ? 'front' : 'back';
    x = right / fwd;
    y = -up / Math.abs(fwd);
  } else {
    face = right > 0 ? 'right' : 'left';
    x = -fwd / right;
    y = -up / Math.abs(right);
  }
  const img = faces[face];
  if (!img) return false;
  // 아래쪽(땅)은 옆면 가장자리에 붙인다 (밑면 사진은 받지 않는다)
  const px = Math.min(img.size - 1, Math.max(0, ((Math.max(-1, Math.min(1, x)) + 1) / 2) * img.size - 0.5));
  const py = Math.min(img.size - 1, Math.max(0, ((Math.max(-1, Math.min(1, y)) + 1) / 2) * img.size - 0.5));
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(img.size - 1, x0 + 1);
  const y1 = Math.min(img.size - 1, y0 + 1);
  const fx = px - x0;
  const fy = py - y0;
  for (let c = 0; c < 3; c++) {
    const top = img.data[(y0 * img.size + x0) * 3 + c] * (1 - fx) + img.data[(y0 * img.size + x1) * 3 + c] * fx;
    const bottom = img.data[(y1 * img.size + x0) * 3 + c] * (1 - fx) + img.data[(y1 * img.size + x1) * 3 + c] * fx;
    out[c] = top * (1 - fy) + bottom * fy;
  }
  return true;
}

// pan 방향을 보는 화면을 CLIP 입력(1×3×224×224, 정규화)으로 그린다
export function renderSceneInput(faces: Partial<Record<SceneFace, FacePixels>>, heading: number, pan: number): Float32Array {
  const n = INPUT_SIZE;
  const focal = n / 2 / Math.tan(toRad(VIEW_FOV_DEG / 2));
  const tilt = toRad(VIEW_TILT_DEG);
  const out = new Float32Array(3 * n * n);
  const rgb = [0, 0, 0];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const cx = (x + 0.5 - n / 2) / focal;
      const cy = -(y + 0.5 - n / 2) / focal;
      const fwd = Math.cos(tilt) - cy * Math.sin(tilt);
      const up = Math.sin(tilt) + cy * Math.cos(tilt);
      const az = pan + toDeg(Math.atan2(cx, fwd)) - heading;
      const el = toDeg(Math.atan2(up, Math.hypot(fwd, cx)));
      if (!sampleCube(faces, az, el, rgb)) rgb.fill(0);
      for (let c = 0; c < 3; c++) out[c * n * n + y * n + x] = (rgb[c] / 255 - CLIP_MEAN[c]) / CLIP_STD[c];
    }
  }
  return out;
}

// CLIP 이미지 임베딩 → 문장들 중 pick 에 걸린 확률 (0~1)
function labelProbability<T extends { embed: number[] }>(imageEmbed: ArrayLike<number>, labels: T[], pick: (label: T) => boolean): number {
  let norm = 0;
  for (let i = 0; i < imageEmbed.length; i++) norm += imageEmbed[i] * imageEmbed[i];
  norm = Math.sqrt(norm) || 1;
  const logits = labels.map(({ embed }) => {
    let dot = 0;
    for (let i = 0; i < embed.length; i++) dot += embed[i] * imageEmbed[i];
    return (CLIP_LOGIT_SCALE * dot) / norm;
  });
  const max = Math.max(...logits);
  const exp = logits.map((l) => Math.exp(l - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return labels.reduce((p, label, i) => (pick(label) ? p + exp[i] / sum : p), 0);
}

// "위가 막힌 곳" 문장들에 걸린 확률
export function coveredProbability(imageEmbed: ArrayLike<number>): number {
  return labelProbability(imageEmbed, SCENE_LABELS, (label) => label.covered);
}

// "건물 없이 논밭·숲뿐인 곳" 문장들에 걸린 확률
export function bareProbability(imageEmbed: ArrayLike<number>): number {
  return labelProbability(imageEmbed, BARE_LABELS, (label) => label.bare);
}

export const SCENE_INPUT_DIMS = [1, 3, INPUT_SIZE, INPUT_SIZE];

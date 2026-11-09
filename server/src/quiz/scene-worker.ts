// 지하철역 문제 사진의 장면 판별 프로세스 (StationSceneClassifier 가 띄운다).
// CLIP 이미지 모델(onnxruntime-web, WASM)을 띄우면 메모리를 400MB 넘게 쓰고, WASM 메모리는 돌려주지 않아서
// 서버와 따로 띄웠다가 할 일이 없으면 프로세스째 끝낸다.
// 모델 파일(약 89MB)은 처음 한 번 Hugging Face 에서 내려받아 modelPath 에 두고, 해시로 확인한다.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import * as ort from 'onnxruntime-web';
import {
  bareProbability,
  coveredProbability,
  decodeFace,
  renderSceneInput,
  SCENE_INPUT_DIMS,
  type FacePixels,
  type SceneFace,
} from './roadview-scene';

// CLIP ViT-B/32 이미지 쪽 8비트 모델. 텍스트 임베딩(scene-text-embeds.ts)과 같은 리비전이어야 한다
const MODEL_URL =
  'https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/6b7c523703ae26e39be4b03774966f8571c7f523/onnx/vision_model_quantized.onnx';
const MODEL_SHA256 = '583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299';
const MODEL_DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

export interface SceneRequest {
  id: number;
  modelPath: string;
  heading: number;
  pans: number[];
  faces: Partial<Record<SceneFace, Uint8Array>>;
}

// 한 방향의 확률 (0~1). covered: 머리 위가 막힌 곳, bare: 건물 없이 논밭·숲뿐인 곳
export interface SceneScore {
  covered: number;
  bare: number;
}

export type SceneResponse = { id: number; scores: SceneScore[] } | { id: number; error: string };

let session: Promise<ort.InferenceSession> | null = null;

function sha256(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

async function loadModel(modelPath: string): Promise<Uint8Array> {
  if (existsSync(modelPath)) {
    const buf = readFileSync(modelPath);
    if (sha256(buf) === MODEL_SHA256) return buf;
  }
  const res = await fetch(MODEL_URL, { signal: AbortSignal.timeout(MODEL_DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`장면 판별 모델을 받지 못했습니다: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (sha256(buf) !== MODEL_SHA256) throw new Error('장면 판별 모델 파일이 예상과 다릅니다 (해시 불일치)');
  mkdirSync(dirname(modelPath), { recursive: true });
  writeFileSync(`${modelPath}.part`, buf);
  renameSync(`${modelPath}.part`, modelPath);
  return buf;
}

function getSession(modelPath: string): Promise<ort.InferenceSession> {
  if (!session) {
    // 작업 스레드를 더 띄우지 않는다 (한 번에 한 장씩, 장당 0.3초 안팎)
    ort.env.wasm.numThreads = 1;
    session = loadModel(modelPath).then((model) => ort.InferenceSession.create(model));
    session.catch(() => (session = null));
  }
  return session;
}

async function handle(req: SceneRequest): Promise<SceneResponse> {
  try {
    const model = await getSession(req.modelPath);
    const faces: Partial<Record<SceneFace, FacePixels>> = {};
    for (const [face, jpeg] of Object.entries(req.faces)) faces[face as SceneFace] = decodeFace(jpeg);
    const scores: SceneScore[] = [];
    for (const pan of req.pans) {
      const input = new ort.Tensor('float32', renderSceneInput(faces, req.heading, pan), SCENE_INPUT_DIMS);
      const output = await model.run({ pixel_values: input });
      const embed = output.image_embeds.data as Float32Array;
      scores.push({ covered: coveredProbability(embed), bare: bareProbability(embed) });
    }
    return { id: req.id, scores };
  } catch (err) {
    return { id: req.id, error: err instanceof Error ? err.message : String(err) };
  }
}

// 요청은 하나씩 순서대로 처리한다
let queue = Promise.resolve();
process.on('message', (req: SceneRequest) => {
  queue = queue.then(async () => {
    process.send?.(await handle(req));
  });
});
// 서버가 끝나거나 연결을 끊으면 같이 끝난다
process.on('disconnect', () => process.exit(0));

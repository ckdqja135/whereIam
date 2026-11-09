import { fork, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import type { SceneFace } from './roadview-scene';
import type { SceneRequest, SceneResponse, SceneScore } from './scene-worker';

// 처음 요청은 모델 내려받기(약 89MB)까지 기다린다
const FIRST_TIMEOUT_MS = 12 * 60_000;
const TIMEOUT_MS = 60_000;

interface Pending {
  resolve: (scores: SceneScore[]) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

// 지하철역 사진 장면 판별(다리 밑·터널·고가 아래, 논밭·숲뿐인 곳) 프로세스 관리. scene-worker.ts 를 필요할 때 띄우고 stop() 으로 끝낸다
export class StationSceneClassifier {
  private child: ChildProcess | null = null;
  private ready = false;
  private seq = 0;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly modelPath: string) {}

  // pans 방향마다 "머리 위가 막힌 곳"일 확률과 "건물 없이 논밭·숲뿐인 곳"일 확률 (0~1)
  scores(faces: Partial<Record<SceneFace, Buffer>>, heading: number, pans: number[]): Promise<SceneScore[]> {
    const child = this.start();
    const id = ++this.seq;
    const request: SceneRequest = { id, modelPath: this.modelPath, heading, pans, faces };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('장면 판별 시간 초과'));
        this.stop();
      }, this.ready ? TIMEOUT_MS : FIRST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      child.send(request);
    });
  }

  stop(): void {
    const child = this.child;
    this.child = null;
    this.ready = false;
    if (child && child.exitCode === null) child.kill();
    this.failAll(new Error('장면 판별 프로세스를 끝냈습니다'));
  }

  private start(): ChildProcess {
    if (this.child) return this.child;
    const child = fork(join(__dirname, 'scene-worker.js'), [], { serialization: 'advanced', stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    child.on('message', (res: SceneResponse) => {
      const p = this.pending.get(res.id);
      if (!p) return;
      this.pending.delete(res.id);
      clearTimeout(p.timer);
      if ('error' in res) {
        p.reject(new Error(res.error));
      } else {
        this.ready = true;
        p.resolve(res.scores);
      }
    });
    child.on('exit', (code) => {
      if (this.child !== child) return;
      this.child = null;
      this.ready = false;
      this.failAll(new Error(`장면 판별 프로세스가 끝났습니다 (코드 ${code})`));
    });
    child.on('error', (err) => this.failAll(err));
    this.child = child;
    return child;
  }

  private failAll(err: Error) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }
}

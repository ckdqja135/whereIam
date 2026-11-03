"use client";

import type { QuizPoolItem, StationPoolItem, StationTodoItem } from "./quiz-api-types";
import { addToQuizPool, addToStationPool, getQuizPoolStats, getStationPoolStats, getStationTodo } from "./api";

// 퀴즈 문제 풀에 로드뷰를 보탠다.
// 무작위 점 근처의 로드뷰를 찾은 뒤, 화면 밖에서 로드뷰를 실제로 불러와 "정확한" 파노라마 좌표를 얻는다.
// (무작위 점과 로드뷰는 최대 500m 떨어져 있을 수 있어서, 정답 지역은 반드시 로드뷰의 실제 좌표로 정해야 한다)
// 정답 지역 확인과 문제 선택은 서버가 한다. 브라우저는 정답을 모른다.

const KOREA = { minLat: 33.1, maxLat: 38.6, minLng: 125.0, maxLng: 129.6 };
const SEARCH_RADIUS = 500;
// 지하철역은 역 바로 앞: 역 좌표에서 150m 안의 가장 가까운 로드뷰, 없으면 300m 까지
const STATION_RADII = [150, 300];
const RESOLVE_TIMEOUT_MS = 5000;
const BATCH = 20;

function findNearestPano(
  client: kakao.maps.RoadviewClient,
  lat: number,
  lng: number,
  radius = SEARCH_RADIUS
): Promise<number | null> {
  return new Promise((resolve) => {
    client.getNearestPanoId(new kakao.maps.LatLng(lat, lng), radius, (id) => resolve(id && id > 0 ? id : null));
  });
}

// 화면 밖에 로드뷰를 띄울 상자 (좌표를 얻는 데만 쓴다)
function offscreenBox(): HTMLDivElement {
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;left:-10000px;top:0;width:320px;height:240px;pointer-events:none;";
  document.body.appendChild(box);
  return box;
}

// 화면 밖 로드뷰로 파노라마의 실제 좌표를 얻는다
function resolvePosition(rv: kakao.maps.Roadview, panoId: number, near: kakao.maps.LatLng): Promise<QuizPoolItem | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: QuizPoolItem | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      kakao.maps.event.removeListener(rv, "position_changed", check);
      kakao.maps.event.removeListener(rv, "init", check);
      resolve(v);
    };
    const check = () => {
      if (rv.getPanoId() !== panoId) return;
      const p = rv.getPosition();
      if (p) finish({ panoId, lat: p.getLat(), lng: p.getLng() });
    };
    const timer = setTimeout(() => finish(null), RESOLVE_TIMEOUT_MS);
    kakao.maps.event.addListener(rv, "position_changed", check);
    kakao.maps.event.addListener(rv, "init", check);
    rv.setPanoId(panoId, near);
  });
}

// 로드뷰 n 개를 찾아 정확한 좌표와 함께 돌려준다 (여러 개를 동시에)
export async function collectPanoramas(n: number, onFound?: (found: number) => void): Promise<QuizPoolItem[]> {
  if (!window.kakao?.maps?.Roadview) return [];
  const client = new kakao.maps.RoadviewClient();
  const found = new Map<number, QuizPoolItem>();
  const boxes: HTMLDivElement[] = [];

  const worker = async () => {
    const box = offscreenBox();
    boxes.push(box);
    const rv = new kakao.maps.Roadview(box);
    for (let tries = 0; found.size < n && tries < n * 12; tries++) {
      const lat = KOREA.minLat + Math.random() * (KOREA.maxLat - KOREA.minLat);
      const lng = KOREA.minLng + Math.random() * (KOREA.maxLng - KOREA.minLng);
      const panoId = await findNearestPano(client, lat, lng);
      if (!panoId || found.has(panoId)) continue;
      const item = await resolvePosition(rv, panoId, new kakao.maps.LatLng(lat, lng));
      if (item && found.size < n && !found.has(panoId)) {
        found.set(panoId, item);
        onFound?.(found.size);
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: 3 }, worker));
  } finally {
    boxes.forEach((b) => b.remove());
  }
  return [...found.values()];
}

// n 개를 모아 풀에 보낸다. 서버의 최신 풀 크기를 돌려준다
export async function contributeToQuizPool(n: number, onFound?: (found: number) => void) {
  const items = await collectPanoramas(n, onFound);
  let last = null;
  for (let i = 0; i < items.length; i += BATCH) {
    last = await addToQuizPool({ items: items.slice(i, i + BATCH) });
  }
  return last;
}

// 퀴즈를 낼 수 있을 만큼 풀이 모일 때까지 보탠다 (처음 배포 직후 등). onProgress(현재, 목표)
export async function ensureQuizPoolReady(onProgress?: (total: number, minimum: number) => void): Promise<void> {
  let stats = await getQuizPoolStats();
  for (let round = 0; !stats.ready && round < 8; round++) {
    onProgress?.(stats.total, stats.minimum);
    const base = stats.total;
    const res = await contributeToQuizPool(BATCH, (found) => onProgress?.(Math.min(base + found, stats.minimum), stats.minimum));
    stats = res ? { total: res.total, ready: res.ready, minimum: stats.minimum } : await getQuizPoolStats();
  }
  if (!stats.ready) throw new Error("퀴즈 문제를 충분히 모으지 못했어요. 잠시 후 다시 시도해주세요.");
}

// ---------- 지하철역 ----------

// 로드뷰 사진 경로 ("2026/06/9152477/2_103458_..."). 서버가 사진에서 역 이름이 보이는지 확인할 때 쓴다.
// 서버의 ROADVIEW_CUBE_PATTERN 과 같은 형식만 보낸다 (하나라도 어긋나면 묶음 전체가 400)
const CUBE_PATTERN = /^\d{4}\/\d{2}\/\d{1,12}\/[0-9_]{1,60}$/;
const CUBE_WAIT_MS = 3000;

// 로드뷰 상자 안의 사진(정육면체 6면) 주소에서 경로를 읽는다. 6면이 모두 같은 경로로 뜰 때까지 기다린다
async function readCube(box: HTMLDivElement): Promise<string | null> {
  for (const until = Date.now() + CUBE_WAIT_MS; Date.now() < until; ) {
    const counts = new Map<string, number>();
    for (const img of box.querySelectorAll("img")) {
      const cube = img.src.match(/map_roadview\/(.+?)_cube\//)?.[1];
      if (cube) counts.set(cube, (counts.get(cube) ?? 0) + 1);
    }
    for (const [cube, n] of counts) if (n >= 6 && CUBE_PATTERN.test(cube)) return cube;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

// 서버가 알려준 역들의 바로 앞 로드뷰를 찾는다. 근처에 로드뷰가 없으면 panoId: null 로 알려준다
// (좌표나 사진 경로를 확인하지 못한 역은 빼고 돌려준다. 다음에 다시 시도)
export async function collectStationPanoramas(todo: StationTodoItem[], onDone?: (done: number) => void): Promise<StationPoolItem[]> {
  if (!window.kakao?.maps?.Roadview) return [];
  const client = new kakao.maps.RoadviewClient();
  const queue = [...todo];
  const items: StationPoolItem[] = [];
  let done = 0;

  const worker = async () => {
    for (let station = queue.shift(); station; station = queue.shift()) {
      let panoId: number | null = null;
      for (const radius of STATION_RADII) {
        panoId = await findNearestPano(client, station.lat, station.lng, radius);
        if (panoId) break;
      }
      if (!panoId) {
        items.push({ stationId: station.stationId, panoId: null });
      } else {
        // 역마다 새 로드뷰: 같은 로드뷰를 다시 쓰면 이전 역의 사진이 남아 있어 경로를 잘못 읽을 수 있다
        const box = offscreenBox();
        try {
          const rv = new kakao.maps.Roadview(box);
          const pos = await resolvePosition(rv, panoId, new kakao.maps.LatLng(station.lat, station.lng));
          const cube = pos ? await readCube(box) : null;
          if (pos && cube) items.push({ stationId: station.stationId, panoId, lat: pos.lat, lng: pos.lng, cube });
        } finally {
          box.remove();
        }
      }
      onDone?.(++done);
    }
  };

  await Promise.all(Array.from({ length: 3 }, worker));
  return items;
}

// 아직 로드뷰가 없는 역 n 개(최대 20)를 받아 찾아서 보낸다. 서버의 최신 풀 크기를 돌려준다 (보낼 게 없으면 null)
export async function contributeToStationPool(n: number, onDone?: (done: number) => void) {
  const { items: todo } = await getStationTodo(Math.min(BATCH, n));
  const items = await collectStationPanoramas(todo, onDone);
  return items.length > 0 ? addToStationPool({ items }) : null;
}

// 서버가 처음 역 목록을 모으는 동안(배포 직후 1분 정도) 기다리는 시간
const STATION_CATALOG_WAIT_MS = 90_000;
// 서버가 사진 확인(역당 몇 초)을 마칠 때까지 기다리는 최대 시간
const STATION_CHECK_WAIT_MS = 4 * 60_000;
const POLL_MS = 3000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 지하철역 퀴즈를 낼 수 있을 만큼 모일 때까지 보탠다. onProgress(문제로 낼 수 있는 역, 목표).
// 로드뷰를 보탠 뒤에도 서버가 사진에서 역 이름이 보이는지 확인을 마쳐야 문제로 쓸 수 있어서 그동안 기다린다
export async function ensureStationPoolReady(onProgress?: (total: number, minimum: number) => void): Promise<void> {
  let stats = await getStationPoolStats();
  for (const until = Date.now() + STATION_CATALOG_WAIT_MS; stats.stations === 0 && Date.now() < until; ) {
    onProgress?.(0, stats.minimum);
    await sleep(POLL_MS);
    stats = await getStationPoolStats();
  }
  if (stats.stations === 0) throw new Error("서버가 아직 지하철역 목록을 모으는 중이에요. 잠시 후 다시 시도해주세요.");

  // 확인 중인 역까지 합쳐 목표보다 넉넉하면(사진에 역 이름이 보여 빠지는 역 몫) 더 보태지 않고 기다린다
  const enough = () => stats.total + stats.pending >= stats.minimum * 1.3;
  let contributions = 0;
  for (const until = Date.now() + STATION_CHECK_WAIT_MS; !stats.ready && Date.now() < until; ) {
    onProgress?.(stats.total, stats.minimum);
    if (!enough() && contributions < 8) {
      contributions++;
      const res = await contributeToStationPool(BATCH);
      if (res) stats = { ...stats, total: res.total, pending: res.pending, ready: res.ready };
      continue;
    }
    await sleep(POLL_MS);
    stats = await getStationPoolStats();
  }
  if (!stats.ready) throw new Error("지하철역 문제를 충분히 모으지 못했어요. 잠시 후 다시 시도해주세요.");
}

// 메인 화면에 들어올 때마다 조금씩 보태서 풀을 키운다 (탭당 한 번, 실패는 무시)
const BACKGROUND_KEY = "whereiam:poolContributed";
export function contributeInBackground(n = 6): void {
  try {
    if (sessionStorage.getItem(BACKGROUND_KEY)) return;
    sessionStorage.setItem(BACKGROUND_KEY, "1");
  } catch {
    return;
  }
  setTimeout(async () => {
    await contributeToQuizPool(n).catch(() => {});
    await contributeToStationPool(n).catch(() => {});
  }, 4000);
}

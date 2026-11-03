"use client";

import type { QuizPoolItem } from "./quiz-api-types";
import { addToQuizPool, getQuizPoolStats } from "./api";

// 퀴즈 문제 풀에 로드뷰를 보탠다.
// 무작위 점 근처의 로드뷰를 찾은 뒤, 화면 밖에서 로드뷰를 실제로 불러와 "정확한" 파노라마 좌표를 얻는다.
// (무작위 점과 로드뷰는 최대 500m 떨어져 있을 수 있어서, 정답 지역은 반드시 로드뷰의 실제 좌표로 정해야 한다)
// 정답 지역 확인과 문제 선택은 서버가 한다. 브라우저는 정답을 모른다.

const KOREA = { minLat: 33.1, maxLat: 38.6, minLng: 125.0, maxLng: 129.6 };
const SEARCH_RADIUS = 500;
const RESOLVE_TIMEOUT_MS = 5000;
const BATCH = 20;

function findNearestPano(client: kakao.maps.RoadviewClient, lat: number, lng: number): Promise<number | null> {
  return new Promise((resolve) => {
    client.getNearestPanoId(new kakao.maps.LatLng(lat, lng), SEARCH_RADIUS, (id) => resolve(id && id > 0 ? id : null));
  });
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
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:-10000px;top:0;width:320px;height:240px;pointer-events:none;";
    document.body.appendChild(box);
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

// 메인 화면에 들어올 때마다 조금씩 보태서 풀을 키운다 (탭당 한 번, 실패는 무시)
const BACKGROUND_KEY = "whereiam:poolContributed";
export function contributeInBackground(n = 6): void {
  try {
    if (sessionStorage.getItem(BACKGROUND_KEY)) return;
    sessionStorage.setItem(BACKGROUND_KEY, "1");
  } catch {
    return;
  }
  setTimeout(() => {
    contributeToQuizPool(n).catch(() => {});
  }, 4000);
}

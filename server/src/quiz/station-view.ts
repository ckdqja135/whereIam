import { haversineKm } from '../challenges/score';

// 지하철역 문제의 시점. 로드뷰는 출입구 바로 앞에서 열고, 역의 출입구들(역 이름 기둥·간판)과 역 건물을 모두 등지는 방향으로
// 시작해서 좌우로 정해진 각도(view.range)까지만 돌릴 수 있게 한다. 각도는 카카오 로드뷰와 같이 0 = 북쪽, 시계 방향.

// 시작 방향에서 좌우로 돌릴 수 있는 최대/최소 각도. 출입구를 피할 수 있는 만큼 줄이고, 최소보다 좁아야 하면 그 로드뷰는 쓰지 않는다
export const STATION_VIEW_RANGE = 60;
export const STATION_VIEW_MIN_RANGE = 30;
// 화면 가로 시야의 절반 (넓은 화면 기준). 출입구는 돌릴 수 있는 끝에서도 이만큼 바깥에 있어야 한다
const SCREEN_HALF_FOV = 55;
// 사진 검사(OCR)에서 "보인다"고 보는 범위: 돌릴 수 있는 범위 + 넉넉한 화면 시야 절반
const OCR_HALF_FOV = 70;
// 이 거리 안의 출입구·역 좌표만 피한다 (더 멀면 간판이 작다)
const EXIT_SIGHT_KM = 0.15;
const STATION_SIGHT_KM = 0.2;
// 출입구 장소 좌표의 오차와 출입구 크기(m). 가까운 출입구일수록 넓은 각도를 피한다
const EXIT_SIZE_M = 5;

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface StationView {
  pan: number;
  range: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

// from → to 방위각 (0 = 북쪽, 시계 방향, 0~360)
export function bearingDeg(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const φ1 = toRad(fromLat);
  const φ2 = toRad(toLat);
  const Δλ = toRad(toLng - fromLng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalizeDeg((Math.atan2(y, x) * 180) / Math.PI);
}

// 출입구를 등진 방향 (로드뷰 위치 → 출입구 방위의 반대). 예전에 모은 문제(view_pan 없음)에만 쓴다
export function awayFromExit(panoLat: number, panoLng: number, exitLat: number, exitLng: number): number {
  return normalizeDeg(bearingDeg(panoLat, panoLng, exitLat, exitLng) + 180);
}

// 근처 출입구들과 역 좌표를 가장 넓게 피하는 방향과, 그 방향에서 돌릴 수 있는 각도.
// 어느 쪽을 봐도 STATION_VIEW_MIN_RANGE 만큼 돌리면 출입구가 화면에 들어오면 null
export function chooseStationView(pano: LatLngPoint, station: LatLngPoint, exits: LatLngPoint[]): StationView | null {
  const avoid: { dir: number; halfWidth: number }[] = [];
  for (const exit of exits) {
    const km = haversineKm(pano.lat, pano.lng, exit.lat, exit.lng);
    if (km > EXIT_SIGHT_KM) continue;
    const halfWidth = (Math.atan2(EXIT_SIZE_M, Math.max(km * 1000, 0.1)) * 180) / Math.PI;
    avoid.push({ dir: bearingDeg(pano.lat, pano.lng, exit.lat, exit.lng), halfWidth });
  }
  if (haversineKm(pano.lat, pano.lng, station.lat, station.lng) <= STATION_SIGHT_KM) {
    avoid.push({ dir: bearingDeg(pano.lat, pano.lng, station.lat, station.lng), halfWidth: 0 });
  }
  if (avoid.length === 0) return { pan: 0, range: STATION_VIEW_RANGE };

  let best = { pan: 0, clearance: -Infinity };
  for (let pan = 0; pan < 360; pan++) {
    const clearance = Math.min(...avoid.map((a) => angleDiff(pan, a.dir) - a.halfWidth));
    if (clearance > best.clearance) best = { pan, clearance };
  }
  const range = Math.min(STATION_VIEW_RANGE, Math.floor(best.clearance - SCREEN_HALF_FOV));
  return range >= STATION_VIEW_MIN_RANGE ? { pan: best.pan, range } : null;
}

export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

// 두 방향 사이 각도 (0~180)
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(normalizeDeg(a) - normalizeDeg(b));
  return d > 180 ? 360 - d : d;
}

// 이 방향이 플레이어 화면에 들어올 수 있는지 (사진 검사용으로 넉넉히)
export function isVisibleDirection(direction: number, view: StationView): boolean {
  return angleDiff(direction, view.pan) <= view.range + OCR_HALF_FOV;
}

// 지하철역 문제의 시점. 로드뷰는 출입구 바로 앞에서 열고, 출입구(역 이름 기둥·역 건물)를 등진 방향으로 시작해서
// 좌우로 STATION_VIEW_RANGE 도까지만 돌릴 수 있게 한다. 각도는 카카오 로드뷰와 같이 0 = 북쪽, 시계 방향.

// 시작 방향에서 좌우로 돌릴 수 있는 각도
export const STATION_VIEW_RANGE = 60;
// 화면 가로 시야의 절반 (넓은 화면 기준으로 넉넉히). 돌릴 수 있는 범위 + 이 값 안에 있는 글자만 "보인다"고 본다
const VIEW_HALF_FOV = 70;

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

// 출입구를 등진 방향 (로드뷰 위치 → 출입구 방위의 반대)
export function awayFromExit(panoLat: number, panoLng: number, exitLat: number, exitLng: number): number {
  return normalizeDeg(bearingDeg(panoLat, panoLng, exitLat, exitLng) + 180);
}

export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

// 두 방향 사이 각도 (0~180)
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(normalizeDeg(a) - normalizeDeg(b));
  return d > 180 ? 360 - d : d;
}

// 이 방향이 플레이어 화면에 들어올 수 있는지 (시작 방향 viewPan 기준)
export function isVisibleDirection(direction: number, viewPan: number): boolean {
  return angleDiff(direction, viewPan) <= STATION_VIEW_RANGE + VIEW_HALF_FOV;
}

export const MAX_SCORE = 5000;
export const ROUNDS_PER_GAME = 5;

// 대한민국 바운딩 박스 대각선 길이(km). GeoGuessr처럼 맵 크기에 비례해 점수가 감소한다.
const MAP_SIZE_KM = 735;
// 이 거리 이내면 만점
const PERFECT_RADIUS_KM = 0.05;

export function calculateScore(distanceKm: number): number {
  if (distanceKm <= PERFECT_RADIUS_KM) return MAX_SCORE;
  return Math.round(MAX_SCORE * Math.exp((-10 * distanceKm) / MAP_SIZE_KM));
}

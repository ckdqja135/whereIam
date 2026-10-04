// 점수 계산. 프론트의 src/lib/score.ts, src/lib/haversine.ts 와 반드시 동일한 공식을 유지할 것.
import type { ChallengeLocation, Guess, RoundScore } from './challenge.types';

export const MAX_SCORE = 5000;
export const ROUNDS_PER_GAME = 5;

// 대한민국 바운딩 박스 대각선 길이(km). GeoGuessr처럼 맵 크기에 비례해 점수가 감소한다.
const MAP_SIZE_KM = 735;
// 이 거리 이내면 만점
const PERFECT_RADIUS_KM = 0.05;
const EARTH_RADIUS_KM = 6371;

export function calculateScore(distanceKm: number): number {
  if (distanceKm <= PERFECT_RADIUS_KM) return MAX_SCORE;
  return Math.round(MAX_SCORE * Math.exp((-10 * distanceKm) / MAP_SIZE_KM));
}

// 두 좌표 사이 거리(km, haversine). 프론트 src/lib/haversine.ts 의 calculateDistance 와 동일한 계산식.
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

// 라운드별 점수 계산. 추측하지 않은 라운드(null)는 0점.
export function scoreGuesses(
  locations: ChallengeLocation[],
  guesses: Guess[],
): { rounds: RoundScore[]; totalScore: number } {
  const rounds = locations.map((loc, i): RoundScore => {
    const guess = guesses[i];
    if (!guess) return { distanceKm: null, score: 0 };
    // 프론트와 같은 순서(정답 → 추측)로 계산
    const distanceKm = haversineKm(loc.lat, loc.lng, guess.lat, guess.lng);
    return { distanceKm, score: calculateScore(distanceKm) };
  });
  const totalScore = rounds.reduce((sum, r) => sum + r.score, 0);
  return { rounds, totalScore };
}

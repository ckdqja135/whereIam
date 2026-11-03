const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export interface DistanceResult {
  km: number;
  m: number;
  formatted: string;
}

export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): DistanceResult {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return distanceFromKm(EARTH_RADIUS_KM * c);
}

// km → 표시용 거리 (서버가 계산한 거리를 같은 형식으로 보여줄 때도 쓴다)
export function distanceFromKm(km: number): DistanceResult {
  const m = km * 1000;
  const formatted = km >= 1 ? `${km.toFixed(1)}km` : `${Math.round(m)}m`;
  return { km, m, formatted };
}

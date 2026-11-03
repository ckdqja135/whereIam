// 지하철역 목록 정리 (카카오 장소 검색 결과 → 퀴즈용 역). 순수 함수만 둔다.
import { haversineKm } from '../challenges/score';
import type { KakaoStationPlace, LngLatRect } from './kakao-geocoder.service';

// 퀴즈용 역. 같은 이름의 가까운 역(환승역)은 하나로 합친 것
export interface CatalogStation {
  id: string; // 합친 역 중 카카오 장소 id 가 가장 작은 것
  name: string; // "강남역"
  lines: string[]; // ["수도권2호선", "신분당선"]
  city: string; // 보기를 고르는 도시 묶음
  lat: number;
  lng: number;
}

// 대한민국 전체를 덮는 사각형
export const KOREA_RECT: LngLatRect = { minLng: 124.5, minLat: 33.0, maxLng: 131.0, maxLat: 38.7 };

// 이름이 같고 이 거리(km) 안에 있으면 같은 역(환승역)으로 본다
const MERGE_KM = 1;

// 주소 첫 단어(시·도)로 나눈 도시 묶음. 보기는 같은 묶음의 역에서 고른다
// (수도권 전철은 천안·아산(충남), 춘천(강원)까지 간다. 광주는 "전남광주통합특별시"로 오기도 한다)
const CITY_PREFIXES: [string, string[]][] = [
  ['capital', ['서울', '경기', '인천', '강원', '충남', '충청남']],
  ['busan', ['부산', '울산', '경남', '경상남']],
  ['daegu', ['대구', '경북', '경상북']],
  ['gwangju', ['광주', '전남', '전라남']],
  ['daejeon', ['대전', '세종', '충북', '충청북']],
];

// "강남역 2호선" → "강남역", "총신대입구(이수)역 4호선" → "총신대입구(이수)역"
export function stationName(placeName: string): string {
  const tokens = placeName.trim().split(/\s+/);
  const named = tokens.find((t) => t.length > 1 && t.endsWith('역'));
  if (named) return named;
  const first = tokens[0] ?? '';
  return first.endsWith('역') ? first : `${first}역`;
}

// "교통,수송 > 지하철,전철 > 수도권2호선" → "수도권2호선"
export function lineName(category: string): string {
  return category.split('>').pop()?.trim() ?? '';
}

export function cityOf(address: string): string {
  const first = address.trim().split(/\s+/)[0] ?? '';
  for (const [city, prefixes] of CITY_PREFIXES) {
    if (prefixes.some((p) => first.startsWith(p))) return city;
  }
  return 'other';
}

// 노선별로 따로 온 같은 역을 합친다. 어떤 순서로 받아도 결과(대표 id·좌표)가 같도록 id 순으로 처리한다
export function mergeStations(places: KakaoStationPlace[]): CatalogStation[] {
  const sorted = [...places].sort((a, b) => compareId(a.id, b.id));
  const byName = new Map<string, CatalogStation[]>();
  const merged: CatalogStation[] = [];
  for (const p of sorted) {
    const name = stationName(p.placeName);
    if (name === '역') continue;
    const line = lineName(p.category);
    const sameName = byName.get(name) ?? [];
    const existing = sameName.find((s) => haversineKm(s.lat, s.lng, p.lat, p.lng) <= MERGE_KM);
    if (existing) {
      if (line && !existing.lines.includes(line)) existing.lines.push(line);
      continue;
    }
    const station: CatalogStation = {
      id: p.id,
      name,
      lines: line ? [line] : [],
      city: cityOf(p.address),
      lat: p.lat,
      lng: p.lng,
    };
    sameName.push(station);
    byName.set(name, sameName);
    merged.push(station);
  }
  return merged;
}

// 사각형을 4등분
export function splitRect(r: LngLatRect): LngLatRect[] {
  const midLng = (r.minLng + r.maxLng) / 2;
  const midLat = (r.minLat + r.maxLat) / 2;
  return [
    { minLng: r.minLng, minLat: r.minLat, maxLng: midLng, maxLat: midLat },
    { minLng: midLng, minLat: r.minLat, maxLng: r.maxLng, maxLat: midLat },
    { minLng: r.minLng, minLat: midLat, maxLng: midLng, maxLat: r.maxLat },
    { minLng: midLng, minLat: midLat, maxLng: r.maxLng, maxLat: r.maxLat },
  ];
}

// 카카오 장소 id 는 숫자 문자열. 길이가 짧을수록 작은 수
function compareId(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

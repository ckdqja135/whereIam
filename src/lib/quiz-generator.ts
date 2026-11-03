import type { ChallengeLocation } from "./api-types";
import type { QuizLevel, QuizQuestion } from "./room-types";
import { getRandomRoadviewLocation } from "./random-location";
import { QUIZ_CHOICES } from "./quiz";

// 4지선다 문제 만들기 (브라우저 전용: 카카오 로드뷰·주소 변환 SDK 필요)
// 정답 지역과 오답 보기를 모두 카카오 주소 변환으로 얻기 때문에, 지명 표기가 섞여 정답이 티 나는 일이 없다.

interface Region {
  r1: string; // 시·도 (예: "경상북도")
  r2: string; // 시·군·구 첫 단어 (예: "경주시", "성남시"). 세종처럼 없으면 ""
}

function getRegion(lat: number, lng: number): Promise<Region | null> {
  return new Promise((resolve) => {
    if (!window.kakao?.maps?.services) return resolve(null);
    new kakao.maps.services.Geocoder().coord2RegionCode(lng, lat, (result, status) => {
      if (status !== kakao.maps.services.Status.OK || !result?.length) return resolve(null);
      const r = result.find((x) => x.region_type === "H") ?? result[0];
      if (!r.region_1depth_name) return resolve(null);
      resolve({ r1: r.region_1depth_name.trim(), r2: (r.region_2depth_name ?? "").trim().split(/\s+/)[0] ?? "" });
    });
  });
}

const label = (r: Region, level: QuizLevel) => (level === "easy" ? r.r1 : `${r.r1} ${r.r2}`);

// 시·도마다 하나씩 대표 좌표 (시·도청 근처). 주소 변환 결과로 현재 표기의 시·도 목록을 만든다
const PROVINCE_SEEDS: [number, number][] = [
  [37.5665, 126.978], // 서울
  [35.1796, 129.0756], // 부산
  [35.8714, 128.6014], // 대구
  [37.4563, 126.7052], // 인천
  [35.1595, 126.8526], // 광주
  [36.3504, 127.3845], // 대전
  [35.5384, 129.3114], // 울산
  [36.48, 127.289], // 세종
  [37.275, 127.0094], // 경기
  [37.8813, 127.7298], // 강원
  [36.6357, 127.4917], // 충북
  [36.6588, 126.6728], // 충남
  [35.8203, 127.1088], // 전북
  [34.8161, 126.4629], // 전남
  [36.576, 128.5056], // 경북
  [35.2383, 128.6924], // 경남
  [33.4996, 126.5312], // 제주
];

interface Province {
  r1: string;
  seed: [number, number];
}

let provincesPromise: Promise<Province[]> | null = null;

// 시·도 목록 (한 번만 만들어 재사용). 통합된 시·도는 이름으로 중복 제거된다
function getProvinces(): Promise<Province[]> {
  if (!provincesPromise) {
    provincesPromise = Promise.all(PROVINCE_SEEDS.map(([lat, lng]) => getRegion(lat, lng))).then((regions) => {
      const map = new Map<string, Province>();
      regions.forEach((r, i) => {
        if (r && !map.has(r.r1)) map.set(r.r1, { r1: r.r1, seed: PROVINCE_SEEDS[i] });
      });
      return [...map.values()];
    });
    // 실패하면 다음에 다시 시도
    provincesPromise.then((list) => {
      if (list.length < QUIZ_CHOICES) provincesPromise = null;
    });
  }
  return provincesPromise;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// (lat, lng) 에서 distanceKm 만큼, 무작위 방향으로 떨어진 점
function offset(lat: number, lng: number, minKm: number, maxKm: number): [number, number] {
  const d = minKm + Math.random() * (maxKm - minKm);
  const bearing = Math.random() * Math.PI * 2;
  const dLat = (d * Math.cos(bearing)) / 111.32;
  const dLng = (d * Math.sin(bearing)) / (111.32 * Math.cos((lat * Math.PI) / 180));
  return [lat + dLat, lng + dLng];
}

// 어려움(시·군·구) 오답: 같은 시·도의 이웃 1개 + 다른 시·도에서 나머지. 못 채우면 null
async function hardDistractors(answer: Region, at: ChallengeLocation, provinces: Province[]): Promise<string[] | null> {
  const correct = label(answer, "hard");
  const picked = new Set<string>();

  for (let i = 0; i < 6 && picked.size < 1; i++) {
    const [lat, lng] = offset(at.lat, at.lng, 12, 45);
    const r = await getRegion(lat, lng);
    if (r && r.r2 && r.r1 === answer.r1 && label(r, "hard") !== correct) picked.add(label(r, "hard"));
  }

  const others = shuffle(provinces.filter((p) => p.r1 !== answer.r1));
  for (let i = 0; i < 12 && picked.size < QUIZ_CHOICES - 1; i++) {
    const p = others[i % others.length];
    if (!p) break;
    const [lat, lng] = offset(p.seed[0], p.seed[1], 0, 35);
    const r = await getRegion(lat, lng);
    if (r && r.r2 && label(r, "hard") !== correct) picked.add(label(r, "hard"));
  }

  return picked.size >= QUIZ_CHOICES - 1 ? [...picked].slice(0, QUIZ_CHOICES - 1) : null;
}

async function makeQuestion(provinces: Province[]): Promise<QuizQuestion> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const location = await getRandomRoadviewLocation();
    const region = await getRegion(location.lat, location.lng);
    if (!region) continue;

    // 문제마다 쉬움/어려움을 섞는다. 시·군·구가 없는 곳(세종 등)이나 오답을 못 채우면 쉬움으로
    let level: QuizLevel = region.r2 && Math.random() < 0.5 ? "hard" : "easy";
    let wrong: string[] | null = null;
    if (level === "hard") wrong = await hardDistractors(region, location, provinces);
    if (!wrong) {
      level = "easy";
      wrong = shuffle(provinces.map((p) => p.r1).filter((n) => n !== region.r1)).slice(0, QUIZ_CHOICES - 1);
      if (wrong.length < QUIZ_CHOICES - 1) continue;
    }

    const correct = label(region, level);
    const choices = shuffle([correct, ...wrong]);
    return { location, choices, answer: choices.indexOf(correct), level };
  }
  throw new Error("문제를 만들지 못했어요. 잠시 후 다시 시도해주세요.");
}

// count 개의 문제를 만든다. 여러 문제를 동시에 만들어 기다리는 시간을 줄인다
export async function generateQuiz(count: number, onProgress?: (done: number) => void): Promise<QuizQuestion[]> {
  const provinces = await getProvinces();
  if (provinces.length < QUIZ_CHOICES) throw new Error("지역 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");

  const out: QuizQuestion[] = new Array(count);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < count) {
      const i = next++;
      out[i] = await makeQuestion(provinces);
      onProgress?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, count) }, worker));
  return out;
}

// 4지선다 퀴즈 문제 풀 / 혼자 하기 API 계약 (프론트 ↔ server/, Nest).
// 프론트의 src/lib/quiz-api-types.ts 와 반드시 동일하게 유지할 것.
//
// 흐름
// 1) 브라우저가 무작위 로드뷰를 찾고, 화면 밖에서 로드뷰를 불러와 "정확한" 파노라마 좌표를 얻어 POST /quiz/pool 로 보낸다.
// 2) 서버가 그 좌표로 카카오 REST API(coord2regioncode)를 호출해 시·도 / 시·군·구를 저장한다.
// 3) 문제는 서버가 풀에서 고른다. 브라우저에는 panoId·보기·난이도만 가고, 좌표와 정답은 답한 뒤에만 공개한다.

import type { QuizKind } from '../rooms/quiz';
import type { QuizPublicQuestion } from '../rooms/room.types';

export interface QuizPoolItem {
  panoId: number;
  lat: number; // 로드뷰가 실제로 열린 파노라마 좌표
  lng: number;
}

// POST /quiz/pool  (1~20개)
export interface QuizPoolAddRequest {
  items: QuizPoolItem[];
}
export interface QuizPoolAddResponse {
  added: number; // 새로 저장된 개수 (중복·지역 확인 실패 제외)
  total: number; // 사용 가능한 풀 크기
  ready: boolean; // 퀴즈를 낼 수 있을 만큼 모였는지
}

// GET /quiz/pool/stats
export interface QuizPoolStats {
  total: number;
  ready: boolean;
  minimum: number; // ready 가 되기 위한 최소 개수
}

// POST /quiz/pool/report — 로드뷰를 띄운 뒤 실제 좌표 보고. 저장된 좌표와 100m 넘게 다르면 그 문제를 풀에서 뺀다 (204)
export interface QuizPoolReportRequest {
  panoId: number;
  lat: number;
  lng: number;
}

// POST /quiz/solo — 혼자 하기 한 판 (10문제). kind 가 없으면 region (지역 맞히기)
export interface QuizSoloStartRequest {
  kind?: QuizKind;
}
export interface QuizSoloStartResponse {
  sessionId: string;
  questions: QuizPublicQuestion[];
}

// POST /quiz/solo/:sessionId/answer — 문제당 한 번. choice 가 null 이면 시간 초과
export interface QuizSoloAnswerRequest {
  index: number; // 0~9
  choice: number | null; // 0~3
}
export interface QuizSoloAnswerResponse {
  correct: boolean;
  answer: number; // 정답 보기 번호
  location: { lat: number; lng: number }; // 답한 뒤에 공개되는 실제 좌표
}

// ---------- 지하철역 퀴즈 문제 풀 ----------
// 역 목록은 서버가 카카오 장소 검색으로 모은다. 브라우저는 역 바로 앞 로드뷰를 찾아 정확한 좌표·사진 경로와 함께 보탠다.
// 서버는 그 사진에서 역 이름 글자를 찾아(OCR) 보이면 문제에서 빼고, 확인을 마친 역만 문제로 낸다.
// 역 이름은 브라우저에 보내지 않는다 (문제를 낼 때도 보기 4개 중 하나로만 보인다).

// GET /quiz/stations/stats
export interface StationPoolStats {
  total: number; // 문제로 낼 수 있는 역 (로드뷰를 찾았고 사진 확인까지 마친 역)
  pending: number; // 로드뷰는 찾았고 사진 확인을 기다리는 역
  stations: number; // 전체 역 수 (서버가 아직 역 목록을 모으는 중이면 0)
  ready: boolean;
  minimum: number;
}

// GET /quiz/stations/todo?n=20 — 아직 로드뷰를 못 찾은 역 (무작위, 최대 20개)
export interface StationTodoItem {
  stationId: string;
  lat: number; // 역 좌표 (카카오 장소 검색)
  lng: number;
}
export interface StationTodoResponse {
  items: StationTodoItem[];
}

// POST /quiz/stations/pool (1~20개). panoId 가 null 이면 역 근처에 로드뷰가 없다는 뜻
export interface StationPoolItem {
  stationId: string;
  panoId: number | null;
  // panoId 가 있을 때 필수
  lat?: number; // 로드뷰가 실제로 열린 파노라마 좌표
  lng?: number;
  cube?: string; // 로드뷰 사진 경로 (map.kakaocdn.net/map_roadview/{cube}_cube/front_1200.jpg 의 {cube})
}
export interface StationPoolAddRequest {
  items: StationPoolItem[];
}
export interface StationPoolAddResponse {
  added: number;
  total: number;
  pending: number;
  ready: boolean;
}

// POST /quiz/stations/flag — 정답 공개 뒤 "역 이름이 보였어요" 신고. 그 역은 바로 문제에서 빠진다 (204)
export interface StationFlagRequest {
  panoId: number;
}

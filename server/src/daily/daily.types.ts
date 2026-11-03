// 오늘의 문제 API 계약 (프론트 ↔ server/, Nest).
// 프론트의 src/lib/daily-api-types.ts 와 반드시 동일하게 유지할 것.
//
// 하루(한국 시간 자정 기준)에 5곳을 모두가 똑같이 푼다. 지도에 찍기와 같은 점수 규칙, 아이템 없음.
// 링크(/daily)를 공유하면 받은 사람도 같은 5곳을 풀고 그날 순위에 오른다.
//
// 정답이 새지 않도록 로드뷰는 라운드를 시작할 때 하나씩(panoId 만) 내주고,
// 정답 좌표와 점수는 그 라운드에 위치를 낸 뒤에만 알려준다 (점수는 서버가 매긴다).

import type { GameSettings, Guess, LeaderboardEntry, PlayerInfo, RoundScore } from '../challenges/challenge.types';

// GET /daily — 오늘의 문제 정보
export interface DailyInfoResponse {
  date: string; // "2026-11-03" (한국 시간)
  rounds: number;
  settings: GameSettings;
  players: number; // 오늘 결과를 남긴 사람 수
}

// POST /daily/start — 오늘의 문제 한 판 시작
export interface DailyStartResponse {
  sessionId: string;
  date: string;
  rounds: number;
  settings: GameSettings;
}

// POST /daily/:sessionId/rounds/:round/start — 라운드 시작 (앞 라운드에 답해야 다음 라운드를 열 수 있다)
export interface DailyRoundStartResponse {
  panoId: number;
  deadline: number | null; // 서버 시각(ms). 제한 시간이 없으면 null
  serverNow: number;
}

// POST /daily/:sessionId/rounds/:round/guess — 라운드당 한 번. guess 가 null 이면 위치를 안 찍음 (0점)
export interface DailyGuessRequest {
  guess: Guess;
}
export interface DailyGuessResponse {
  score: number;
  distanceKm: number | null;
  answer: { lat: number; lng: number }; // 이 라운드의 정답 좌표 (답한 뒤에만 공개)
  late: boolean; // 제한 시간이 지나서 낸 경우 (0점 처리)
}

// POST /daily/:sessionId/finish — 5라운드를 모두 마친 뒤 순위에 남기기 (한 판에 한 번)
export interface DailyFinishRequest {
  player: PlayerInfo;
}
export interface DailyFinishResponse {
  resultId: string;
  totalScore: number;
  rounds: RoundScore[];
  rank: number;
  players: number;
}

// GET /daily/:date/leaderboard — 그날 순위 (상위 50명)
export interface DailyLeaderboardResponse {
  date: string;
  entries: LeaderboardEntry[];
  players: number;
}

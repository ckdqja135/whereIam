// 실시간 대결(2~4인 방) API 계약. 프론트(Vercel) ↔ 백엔드(server/, Nest).
// server/src/rooms/room.types.ts 와 반드시 동일하게 유지할 것.
//
// 통신 방식: 롱 폴링. 클라이언트는 GET /rooms/:code/state?since=<version> 을 반복 호출하고,
// 서버는 방 상태(version)가 바뀌거나 25초가 지나면 응답한다.
// 모든 방 요청은 X-Player-Token 헤더로 본인을 증명한다 (방 만들기/참가 응답으로 받은 token).

import type { ChallengeLocation, GameSettings, Guess, ItemId, PlayerInfo } from "./api-types";

export const ROOM_MAX_PLAYERS = 4;
export const ROOM_MIN_PLAYERS = 2;

// lobby: 대기실 / playing: 라운드 진행 중 / reveal: 라운드 결과 공개 / finished: 최종 순위
export type RoomStatus = "lobby" | "playing" | "reveal" | "finished";

export interface RoomPlayer {
  id: string;
  nickname: string;
  avatar: PlayerInfo["avatar"];
  isHost: boolean;
  ready: boolean; // 대기실 준비 여부 (방장은 항상 true)
  connected: boolean; // 최근 40초 안에 요청이 있었는지
  left: boolean; // 게임 도중 나간 사람 (결과에는 남는다)
  totalScore: number;
  submitted: boolean; // 현재 라운드 제출 여부 (playing 일 때만 의미)
  itemsUsed: number; // 이번 게임에서 쓴 아이템 수
}

export interface RoomRoundPlayerResult {
  playerId: string;
  guess: Guess;
  distanceKm: number | null;
  score: number; // 아이템 감점 반영
  penalty: number;
  items: ItemId[];
}

export interface RoomRoundResult {
  round: number; // 1부터
  answer: ChallengeLocation; // 보정된 정답 좌표
  results: RoomRoundPlayerResult[];
}

export interface RoomState {
  code: string;
  version: number; // 상태가 바뀔 때마다 1씩 증가
  status: RoomStatus;
  me: string; // 요청한 플레이어 id
  hostId: string;
  settings: GameSettings;
  players: RoomPlayer[]; // 들어온 순서
  round: number; // 현재(또는 마지막) 라운드, lobby 에서는 0
  totalRounds: number;
  // playing/reveal 일 때 현재 라운드 위치. lobby/finished 에서는 null
  location: ChallengeLocation | null;
  roundDeadline: number | null; // epoch ms, 제한 시간 없으면 null
  revealDeadline: number | null; // reveal 상태에서 다음 라운드로 자동 진행되는 시각 (epoch ms)
  serverNow: number; // 서버 현재 시각 (epoch ms). 클라이언트 시계 보정용
  rounds: RoomRoundResult[]; // 끝난 라운드들 (reveal/finished 에서 공개)
}

// POST /rooms
export interface CreateRoomRequest {
  player: PlayerInfo;
  settings: GameSettings;
}
// POST /rooms/:code/join
export interface JoinRoomRequest {
  player: PlayerInfo;
}
// 방 만들기/참가 응답
export interface RoomJoinResponse {
  code: string;
  playerId: string;
  token: string;
  state: RoomState;
}

// POST /rooms/:code/ready
export interface RoomReadyRequest {
  ready: boolean;
}
// POST /rooms/:code/settings (방장, lobby)
export interface RoomSettingsRequest {
  settings: GameSettings;
}
// POST /rooms/:code/start (방장, lobby). 카카오 로드뷰 위치는 브라우저에서만 뽑을 수 있어 방장이 올린다.
export interface RoomStartRequest {
  locations: ChallengeLocation[]; // 정확히 5개
}
// POST /rooms/:code/position — 로드뷰가 실제로 열린 파노라마 좌표 보고 (정답 보정용)
export interface RoomPositionRequest {
  round: number;
  lat: number;
  lng: number;
}
// POST /rooms/:code/guess
export interface RoomGuessRequest {
  round: number;
  guess: Guess;
  items: ItemId[];
}

// 프론트(Vercel) ↔ 백엔드(server/, Nest) 공용 API 계약.
// 프론트의 src/lib/api-types.ts (및 src/lib/avatar.ts 의 Avatar) 와 반드시 동일하게 유지할 것.

export interface Avatar {
  skin: number;
  hairStyle: number;
  hairColor: number;
  eyes: number;
  hat: number;
  outfitColor: number;
  pantsColor: number;
}

// 프론트 src/lib/avatar.ts 의 AVATAR_LIMITS 와 동일 (각 항목은 0 이상 limit 미만 정수)
export const AVATAR_LIMITS: Record<keyof Avatar, number> = {
  skin: 6,
  hairStyle: 6,
  hairColor: 8,
  eyes: 4,
  hat: 5,
  outfitColor: 10,
  pantsColor: 6,
};

export interface GameSettings {
  timeLimit: number; // 초, 0 = 무제한
  allowMove: boolean;
  allowPan: boolean;
  allowZoom: boolean;
  // 아이템 모드. false(노템)면 힌트 아이템을 쓸 수 없다. 모드 도입 전 챌린지는 값이 없으며 노템으로 취급한다.
  itemMode?: boolean;
}

export interface ChallengeLocation {
  lat: number;
  lng: number;
  panoId: number;
}

export interface PlayerInfo {
  nickname: string;
  avatar: Avatar;
}

export type Guess = { lat: number; lng: number } | null;

// 힌트 아이템. 한 게임에 총 3번까지, 사용하면 그 라운드 점수에서 감점.
export type ItemId = 'region' | 'radius' | 'nearby';

// POST /challenges
export interface CreateChallengeRequest {
  creator: PlayerInfo;
  settings: GameSettings;
  locations: ChallengeLocation[]; // 정확히 5개
  // 만든 사람이 이미 이 위치들로 플레이한 경우 결과도 함께 등록
  creatorGuesses?: Guess[];
  // 라운드별로 사용한 아이템 (creatorGuesses 와 같은 길이)
  creatorItems?: ItemId[][];
}
export interface CreateChallengeResponse {
  id: string;
}

// GET /challenges/:id
export interface ChallengeResponse {
  id: string;
  creator: PlayerInfo;
  settings: GameSettings;
  locations: ChallengeLocation[];
  createdAt: string;
}

// POST /challenges/:id/results  (점수는 서버가 계산)
export interface SubmitResultRequest {
  player: PlayerInfo;
  guesses: Guess[]; // 라운드 수와 동일한 길이
  items?: ItemId[][]; // 라운드별 사용 아이템, 없으면 미사용
}
export interface RoundScore {
  distanceKm: number | null;
  score: number; // 아이템 감점이 반영된 점수
  penalty: number;
}
export interface SubmitResultResponse {
  resultId: string;
  totalScore: number;
  rounds: RoundScore[];
  rank: number;
}

// GET /challenges/:id/leaderboard
export interface LeaderboardEntry {
  resultId: string;
  player: PlayerInfo;
  totalScore: number;
  createdAt: string;
}
export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
}

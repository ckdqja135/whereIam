import type {
  ChallengeResponse,
  CreateChallengeRequest,
  CreateChallengeResponse,
  LeaderboardResponse,
  SubmitResultRequest,
  SubmitResultResponse,
} from "./api-types";
import type {
  CreateRoomRequest,
  JoinRoomRequest,
  RoomAwayRequest,
  RoomChatRequest,
  RoomGuessRequest,
  RoomJoinResponse,
  RoomPositionRequest,
  RoomReadyRequest,
  RoomSettingsRequest,
  RoomStartRequest,
  RoomState,
} from "./room-types";

// 백엔드(server/, 자체 서버) 주소. Vercel 환경변수 NEXT_PUBLIC_API_URL 로 설정한다.
// - "/api/backend" (권장): 같은 도메인의 프록시 라우트를 거쳐 Vercel 서버가 BACKEND_URL 로 대신 호출한다.
// - "https://..." : 브라우저가 직접 호출. Vercel 페이지가 HTTPS이므로 http://IP 는 mixed content 로 차단된다.
const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function isApiConfigured(): boolean {
  return Boolean(API_URL);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new ApiError("서버 주소(NEXT_PUBLIC_API_URL)가 설정되지 않았습니다.", 0);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.", 0);
  }

  if (!res.ok) {
    let message = `요청에 실패했습니다. (${res.status})`;
    if (res.status === 404) message = "챌린지를 찾을 수 없습니다.";
    if (res.status === 429) message = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
    // 서버가 한국어 안내(409 "방이 가득 찼습니다" 등)를 주면 그걸 보여준다
    if (res.status === 403 || res.status === 409 || res.status === 503) {
      try {
        const body = (await res.json()) as { message?: unknown };
        if (typeof body.message === "string") message = body.message;
      } catch {
        // 본문이 JSON 이 아니면 기본 메시지
      }
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------- 실시간 대결 방 ----------

function roomRequest<T>(code: string, path: string, token: string, init?: RequestInit): Promise<T> {
  return request<T>(`/rooms/${encodeURIComponent(code)}${path}`, {
    ...init,
    headers: { "X-Player-Token": token, ...init?.headers },
  });
}

export function createRoom(body: CreateRoomRequest) {
  return request<RoomJoinResponse>("/rooms", { method: "POST", body: JSON.stringify(body) });
}

export async function joinRoom(code: string, body: JoinRoomRequest) {
  try {
    return await request<RoomJoinResponse>(`/rooms/${encodeURIComponent(code)}/join`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw new ApiError("방을 찾을 수 없어요. 코드를 확인해주세요.", 404);
    throw err;
  }
}

// 롱 폴링: since 이후 상태가 바뀌거나 25초가 지나면 응답
export function getRoomState(code: string, token: string, since: number | null, signal?: AbortSignal) {
  const q = since === null ? "" : `?since=${since}`;
  return roomRequest<RoomState>(code, `/state${q}`, token, { signal });
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body ?? {}) });

export const roomActions = {
  ready: (code: string, token: string, body: RoomReadyRequest) => roomRequest<RoomState>(code, "/ready", token, post(body)),
  settings: (code: string, token: string, body: RoomSettingsRequest) =>
    roomRequest<RoomState>(code, "/settings", token, post(body)),
  start: (code: string, token: string, body: RoomStartRequest) => roomRequest<RoomState>(code, "/start", token, post(body)),
  position: (code: string, token: string, body: RoomPositionRequest) =>
    roomRequest<void>(code, "/position", token, post(body)),
  guess: (code: string, token: string, body: RoomGuessRequest) => roomRequest<RoomState>(code, "/guess", token, post(body)),
  next: (code: string, token: string) => roomRequest<RoomState>(code, "/next", token, post({})),
  rematch: (code: string, token: string) => roomRequest<RoomState>(code, "/rematch", token, post({})),
  leave: (code: string, token: string) => roomRequest<void>(code, "/leave", token, post({})),
  away: (code: string, token: string, body: RoomAwayRequest) => roomRequest<void>(code, "/away", token, post(body)),
  chat: (code: string, token: string, body: RoomChatRequest) => roomRequest<RoomState>(code, "/chat", token, post(body)),
};

// ---------- 챌린지 ----------

export function createChallenge(body: CreateChallengeRequest) {
  return request<CreateChallengeResponse>("/challenges", { method: "POST", body: JSON.stringify(body) });
}

export function getChallenge(id: string) {
  return request<ChallengeResponse>(`/challenges/${encodeURIComponent(id)}`);
}

export function submitChallengeResult(id: string, body: SubmitResultRequest) {
  return request<SubmitResultResponse>(`/challenges/${encodeURIComponent(id)}/results`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getLeaderboard(id: string) {
  return request<LeaderboardResponse>(`/challenges/${encodeURIComponent(id)}/leaderboard`);
}

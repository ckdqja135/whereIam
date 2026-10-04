import type {
  ChallengeResponse,
  CreateChallengeRequest,
  CreateChallengeResponse,
  LeaderboardResponse,
  SubmitResultRequest,
  SubmitResultResponse,
} from "./api-types";

// 백엔드(server/, 자체 서버) 주소. Vercel 환경변수 NEXT_PUBLIC_API_URL 로 설정한다.
// Vercel 페이지가 HTTPS이므로 반드시 https:// 주소여야 한다 (http://IP 는 브라우저가 차단).
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
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

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

import type { ChallengeResponse } from "./api-types";

// 서버 사이드(프록시 라우트, 메타데이터, OG 이미지)에서 백엔드를 직접 호출할 때 쓰는 설정.
// 브라우저 번들에는 포함되지 않는다.
export const BACKEND_URL = process.env.BACKEND_URL?.replace(/\/+$/, "");
export const PROXY_SECRET = process.env.BACKEND_PROXY_SECRET;

export function backendHeaders(extra?: Record<string, string>): Headers {
  const headers = new Headers(extra);
  if (PROXY_SECRET) headers.set("x-proxy-secret", PROXY_SECRET);
  return headers;
}

// 챌린지 조회. 백엔드 미설정/404/네트워크 오류는 모두 null 로 처리해 호출 측이 기본값을 쓰게 한다.
export async function fetchChallengeFromBackend(id: string): Promise<ChallengeResponse | null> {
  if (!BACKEND_URL || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  try {
    const res = await fetch(`${BACKEND_URL}/challenges/${encodeURIComponent(id)}`, {
      headers: backendHeaders(),
      signal: AbortSignal.timeout(5000),
      // 챌린지 내용은 바뀌지 않으므로 잠깐 캐시해 공유 미리보기 스크래퍼의 반복 요청을 줄인다
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()) as ChallengeResponse;
  } catch {
    return null;
  }
}

import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL, backendHeaders } from "@/lib/backend-server";

// 백엔드(server/, 자체 서버) 프록시.
// 브라우저는 같은 도메인의 /api/backend/... 만 호출하고, 이 라우트가 Vercel 서버에서 BACKEND_URL 로 대신 요청한다.
// 서버 간 통신이라 백엔드가 HTTP(IP:포트)여도 브라우저의 mixed content 차단에 걸리지 않는다.
//
// 환경 변수 (Vercel 프로젝트 설정, 서버 전용):
//   BACKEND_URL           예: http://12.34.56.78:4001
//   BACKEND_PROXY_SECRET  server/.env 의 PROXY_SECRET 과 같은 값
// 그리고 프론트가 이 프록시를 쓰도록 NEXT_PUBLIC_API_URL=/api/backend 로 설정한다.

const TIMEOUT_MS = 8000;
// 대결 방 상태 롱 폴링(GET /rooms/:code/state)은 서버가 최대 25초까지 응답을 붙잡고 있으므로 넉넉히 기다린다
const LONG_POLL_TIMEOUT_MS = 35000;
// Vercel 함수 최대 실행 시간 (롱 폴링 대기 포함)
export const maxDuration = 60;

type Ctx = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, ctx: Ctx) {
  if (!BACKEND_URL) {
    return NextResponse.json({ error: "서버에 BACKEND_URL이 설정되지 않았습니다." }, { status: 503 });
  }

  const { path } = await ctx.params;
  const target = `${BACKEND_URL}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = backendHeaders();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  // 대결 방 플레이어 인증 토큰
  const playerToken = req.headers.get("x-player-token");
  if (playerToken) headers.set("x-player-token", playerToken);
  const isLongPoll = req.method === "GET" && path[0] === "rooms" && path[2] === "state";
  // 백엔드의 IP별 요청 수 제한이 Vercel IP가 아니라 실제 사용자 기준으로 걸리도록 전달
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip");
  if (clientIp) headers.set("x-forwarded-for", clientIp);

  try {
    const res = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.text(),
      signal: AbortSignal.any([AbortSignal.timeout(isLongPoll ? LONG_POLL_TIMEOUT_MS : TIMEOUT_MS), req.signal]),
      cache: "no-store",
    });
    // 204 등 본문 없는 응답은 그대로 전달
    if (res.status === 204) return new NextResponse(null, { status: 204 });
    return new NextResponse(res.body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    // 롱 폴링 시간 초과·브라우저가 연결을 끊은 경우는 정상 흐름이라 로그를 남기지 않는다 (클라이언트가 재시도)
    const name = err instanceof Error ? err.name : "";
    if (name !== "TimeoutError" && name !== "AbortError") console.error("백엔드 프록시 오류:", err);
    return NextResponse.json({ error: "백엔드 서버에 연결할 수 없습니다." }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;

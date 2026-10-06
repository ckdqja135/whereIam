"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getRoomState } from "./api";
import type { RoomState } from "./room-types";

// 방 참가 정보는 탭(sessionStorage)마다 따로 저장한다.
// 새로고침해도 같은 자리로 돌아오고, 같은 브라우저의 다른 탭은 다른 플레이어가 될 수 있다.
export interface RoomCredentials {
  playerId: string;
  token: string;
}

const key = (code: string) => `whereiam:room:${code.toUpperCase()}`;

export function loadRoomCredentials(code: string): RoomCredentials | null {
  try {
    const raw = sessionStorage.getItem(key(code));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<RoomCredentials>;
    return typeof v.playerId === "string" && typeof v.token === "string" ? { playerId: v.playerId, token: v.token } : null;
  } catch {
    return null;
  }
}

export function saveRoomCredentials(code: string, creds: RoomCredentials): void {
  try {
    sessionStorage.setItem(key(code), JSON.stringify(creds));
  } catch {
    // 저장 실패 시 새로고침하면 다시 참가해야 한다
  }
}

export function clearRoomCredentials(code: string): void {
  try {
    sessionStorage.removeItem(key(code));
  } catch {
    // 무시
  }
}

// 롱 폴링으로 방 상태를 계속 받아온다.
// fatal: 방이 사라졌거나(404) 토큰이 무효(403)라 더 이상 진행할 수 없는 경우
export function useRoomState(code: string, token: string | null, initial: RoomState | null) {
  const [state, setState] = useState<RoomState | null>(initial);
  const [fatal, setFatal] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  // 서버 시계 - 내 시계 (타이머 표시 보정용)
  const [clockOffset, setClockOffset] = useState(0);
  const versionRef = useRef<number | null>(initial?.version ?? null);

  // 액션 응답 등으로 받은 상태를 반영 (더 오래된 버전은 무시)
  const applyState = useCallback((next: RoomState) => {
    if (versionRef.current !== null && next.version < versionRef.current) return;
    versionRef.current = next.version;
    setClockOffset(next.serverNow - Date.now());
    setState(next);
  }, []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    let stopped = false;

    const loop = async () => {
      while (!stopped) {
        try {
          const next = await getRoomState(code, token, versionRef.current, controller.signal);
          if (stopped) return;
          setOffline(false);
          applyState(next);
        } catch (err) {
          if (stopped) return;
          if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
            // 403 은 서버 안내를 그대로 보여준다 ("방장이 방에서 내보냈어요" 등)
            setFatal(err.status === 404 ? "방이 사라졌어요. 모두 나갔거나 오래 비어 있었어요." : err.message);
            return;
          }
          // 일시적인 네트워크 오류: 잠시 후 재시도
          setOffline(true);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    };
    loop();

    return () => {
      stopped = true;
      controller.abort();
    };
  }, [code, token, applyState]);

  return { state, applyState, fatal, offline, clockOffset };
}

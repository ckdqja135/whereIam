"use client";

import { useEffect, useRef } from "react";

// 부정행위 억제/감지.
// 웹페이지는 개발자 도구를 열지 못하게 하거나 다른 탭으로 못 가게 "막는" 것이 불가능하다 (브라우저가 허용하지 않음).
// 그래서 (1) 흔한 단축키·우클릭을 막아 억제하고, (2) 다른 탭/창으로 나가면 onAway 로 알려 다른 참가자에게 보여준다.
export function useAntiCheat(active: boolean, onAway?: () => void) {
  const onAwayRef = useRef(onAway);
  useEffect(() => {
    onAwayRef.current = onAway;
  });

  useEffect(() => {
    if (!active) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase();
      const mod = e.ctrlKey || e.metaKey;
      const blocked =
        key === "F12" ||
        (mod && e.shiftKey && ["I", "J", "C"].includes(key)) || // 개발자 도구 / 콘솔 / 요소 검사
        (e.metaKey && e.altKey && ["I", "J", "C"].includes(key)) || // macOS Cmd+Option+I 등
        (mod && key === "U"); // 페이지 소스 보기
      if (blocked) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    // 한 번 나갔다 돌아올 때까지는 한 번만 센다
    let away = false;
    const markAway = () => {
      if (away) return;
      away = true;
      onAwayRef.current?.();
    };
    const markBack = () => {
      away = false;
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? markAway() : markBack());

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", markAway);
    window.addEventListener("focus", markBack);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", markAway);
      window.removeEventListener("focus", markBack);
    };
  }, [active]);
}

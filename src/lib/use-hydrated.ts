import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// 서버 렌더링/하이드레이션 중에는 false, 브라우저에서 마운트된 뒤에는 true.
// localStorage 등 브라우저 전용 값을 useState 초기값으로 읽을 때 사용한다.
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

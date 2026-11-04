// 이 브라우저에서 최근에 본 퀴즈 문제(panoId). 문제를 받을 때 서버에 보내 되도록 다시 나오지 않게 한다
import type { QuizKind } from "./quiz";

// 서버의 QUIZ_EXCLUDE_MAX 와 같게
const MAX = 300;
const key = (kind: QuizKind) => `whereiam:seen:${kind}`;

export function loadSeen(kind: QuizKind): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key(kind)) ?? "[]");
    return Array.isArray(raw) ? raw.filter((v): v is number => Number.isInteger(v) && v > 0).slice(-MAX) : [];
  } catch {
    return [];
  }
}

// 새로 본 문제를 뒤에 붙이고 오래된 것부터 버린다
export function addSeen(kind: QuizKind, panoIds: number[]): void {
  try {
    const next = [...loadSeen(kind).filter((id) => !panoIds.includes(id)), ...panoIds].slice(-MAX);
    localStorage.setItem(key(kind), JSON.stringify(next));
  } catch {
    // 무시
  }
}

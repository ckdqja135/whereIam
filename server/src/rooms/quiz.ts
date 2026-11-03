// 4지선다 퀴즈 규칙. 프론트 src/lib/quiz.ts 와 반드시 같게 유지할 것.
import type { QuizLevel } from './room.types';

export type { QuizLevel, QuizPublicQuestion } from './room.types';

export const QUIZ_QUESTIONS = 10;
export const QUIZ_SECONDS = 15;
export const QUIZ_CHOICES = 4;

// 쉬움(시·도) / 어려움(시·군·구) 정답 기본 점수
export const QUIZ_BASE_SCORE: Record<QuizLevel, number> = { easy: 1000, hard: 1500 };
// 빨리 맞힐수록 보너스: 남은 초 × 50, 최대 15초 → +750. 화면 타이머(올림 표시)와 같은 초를 쓰도록 올림
export const QUIZ_SPEED_BONUS_PER_SEC = 50;
// 오답·시간 초과
export const QUIZ_WRONG_PENALTY = 500;

// 이번 문제 점수 변화 (음수 가능). remainingSec(소수 가능)는 올림해서 0~QUIZ_SECONDS 로 자른다
// (화면에 "10초"가 보일 때 누르면 10초분 보너스)
export function quizDelta(correct: boolean, level: QuizLevel, remainingSec: number): number {
  if (!correct) return -QUIZ_WRONG_PENALTY;
  const sec = Math.max(0, Math.min(QUIZ_SECONDS, Math.ceil(remainingSec)));
  return QUIZ_BASE_SCORE[level] + sec * QUIZ_SPEED_BONUS_PER_SEC;
}

// 총점은 0 아래로 내려가지 않는다
export function applyQuizDelta(total: number, delta: number): number {
  return Math.max(0, total + delta);
}

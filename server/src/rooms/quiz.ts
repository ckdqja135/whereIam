// 4지선다 퀴즈 규칙. 프론트 src/lib/quiz.ts 와 반드시 같게 유지할 것.
import type { GameType } from '../challenges/challenge.types';
import type { QuizLevel } from './room.types';

export type { QuizLevel, QuizPublicQuestion } from './room.types';

// 퀴즈 종류. region: 지역 맞히기 (gameType 'quiz') / station: 지하철역 맞히기 (gameType 'station')
export type QuizKind = 'region' | 'station';
export const QUIZ_KINDS: QuizKind[] = ['region', 'station'];

export const QUIZ_QUESTIONS = 10;
export const QUIZ_CHOICES = 4;

// 종류별 제한 시간과 빨리 맞힌 보너스 (남은 1초당). 최대 보너스는 둘 다 +750
// 지하철역은 시점을 돌려 둘러볼 시간이 필요해서 더 길다
export const QUIZ_RULES: Record<QuizKind, { seconds: number; bonusPerSec: number }> = {
  region: { seconds: 15, bonusPerSec: 50 },
  station: { seconds: 30, bonusPerSec: 25 },
};

// 쉬움 / 어려움 정답 기본 점수 (지역: 시·도 / 시·군·구, 지하철역: 같은 도시 / 이웃 역)
export const QUIZ_BASE_SCORE: Record<QuizLevel, number> = { easy: 1000, hard: 1500 };
// 오답·시간 초과
export const QUIZ_WRONG_PENALTY = 500;

// 게임 종류 → 퀴즈 종류 (퀴즈가 아니면 null)
export function quizKindOf(gameType: GameType | undefined): QuizKind | null {
  if (gameType === 'quiz') return 'region';
  if (gameType === 'station') return 'station';
  return null;
}

// 이번 문제 점수 변화 (음수 가능). remainingSec(소수 가능)는 올림해서 0~제한 시간으로 자른다
// (화면에 "10초"가 보일 때 누르면 10초분 보너스)
export function quizDelta(correct: boolean, level: QuizLevel, remainingSec: number, kind: QuizKind = 'region'): number {
  if (!correct) return -QUIZ_WRONG_PENALTY;
  const { seconds, bonusPerSec } = QUIZ_RULES[kind];
  const sec = Math.max(0, Math.min(seconds, Math.ceil(remainingSec)));
  return QUIZ_BASE_SCORE[level] + sec * bonusPerSec;
}

// 총점은 0 아래로 내려가지 않는다
export function applyQuizDelta(total: number, delta: number): number {
  return Math.max(0, total + delta);
}

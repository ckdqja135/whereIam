import type { ChallengeLocation } from '../challenges/challenge.types';
import type { QuizLevel, QuizPublicQuestion } from '../rooms/room.types';

// 서버만 갖고 있는 문제 (좌표·정답 포함). 플레이어에게는 toPublicQuestion 으로 바꿔서만 내보낸다
export interface QuizServerQuestion {
  location: ChallengeLocation; // 문제 풀의 정확한 파노라마 좌표
  choices: string[]; // 4개, 서로 다름
  answer: number; // 정답 보기 번호 (0~3)
  level: QuizLevel;
}

// 좌표와 정답을 뺀 공개용 문제
export function toPublicQuestion(q: QuizServerQuestion): QuizPublicQuestion {
  return { panoId: q.location.panoId, choices: [...q.choices], level: q.level };
}

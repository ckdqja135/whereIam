import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { generateId } from '../challenges/id';
import type { QuizKind } from '../rooms/quiz';
import type { QuizSoloAnswerResponse, QuizSoloStartResponse } from './quiz-api.types';
import { QuizPoolService } from './quiz-pool.service';
import { QuizServerQuestion, toPublicQuestion } from './quiz-question';
import { StationPoolService } from './station-pool.service';

// 혼자 하기 세션은 메모리에만 둔다 (재시작하면 사라짐). 만든 뒤 1시간 지나면 만료
const SESSION_TTL_MS = 60 * 60_000;
// 동시에 보관하는 세션 수 상한 (넘으면 가장 오래된 것부터 지운다)
const MAX_SESSIONS = 2000;

interface SoloSession {
  questions: QuizServerQuestion[];
  answered: boolean[];
  expiresAt: number;
}

// 혼자 하기: 문제는 서버가 고르고, 정답·좌표는 문제마다 답한 뒤에만 알려준다.
// 점수는 혼자 하는 게임이라 브라우저가 계산한다 (서버는 채점만)
@Injectable()
export class QuizSoloService {
  // Map 은 넣은 순서를 지키고 TTL 이 모두 같으므로 앞쪽일수록 오래된 세션이다
  private readonly sessions = new Map<string, SoloSession>();

  constructor(
    private readonly pool: QuizPoolService,
    private readonly stations: StationPoolService,
  ) {}

  start(kind: QuizKind): QuizSoloStartResponse {
    // 풀이 덜 모였으면 503
    const questions = kind === 'station' ? this.stations.buildQuiz() : this.pool.buildQuiz();

    const now = Date.now();
    this.prune(now);
    while (this.sessions.size >= MAX_SESSIONS) {
      const oldest = this.sessions.keys().next().value;
      if (oldest === undefined) break;
      this.sessions.delete(oldest);
    }
    let sessionId: string;
    do {
      sessionId = generateId(16);
    } while (this.sessions.has(sessionId));
    this.sessions.set(sessionId, { questions, answered: questions.map(() => false), expiresAt: now + SESSION_TTL_MS });

    return { sessionId, questions: questions.map(toPublicQuestion) };
  }

  // 문제당 한 번만. choice 가 null 이면 시간 초과 (오답)
  answer(sessionId: string, index: number, choice: number | null): QuizSoloAnswerResponse {
    const session = this.sessions.get(sessionId);
    if (!session || session.expiresAt <= Date.now()) {
      if (session) this.sessions.delete(sessionId);
      throw new NotFoundException('퀴즈를 찾을 수 없어요. 처음부터 다시 시작해주세요');
    }
    const question = session.questions[index];
    if (!question) throw new BadRequestException('없는 문제 번호입니다');
    if (session.answered[index]) throw new ConflictException('이미 답한 문제예요');

    session.answered[index] = true;
    return {
      correct: choice === question.answer,
      answer: question.answer,
      location: { lat: question.location.lat, lng: question.location.lng },
    };
  }

  // 만료된 세션 정리 (앞쪽부터 만료되지 않은 세션이 나올 때까지)
  private prune(now: number) {
    for (const [id, session] of this.sessions) {
      if (session.expiresAt > now) break;
      this.sessions.delete(id);
    }
  }
}

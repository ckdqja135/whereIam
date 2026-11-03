import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { QuizPoolAddDto, QuizPoolReportDto, QuizSoloAnswerDto } from './dto/quiz.dto';
import type {
  QuizPoolAddResponse,
  QuizPoolStats,
  QuizSoloAnswerResponse,
  QuizSoloStartResponse,
} from './quiz-api.types';
import { QuizPoolService } from './quiz-pool.service';
import { QuizSoloService } from './quiz-solo.service';

// 풀에 보태기는 카카오 API 를 부르므로 IP당 1분에 20회, 좌표 보고는 60회, 혼자 하기 시작은 10회
const POOL_ADD_THROTTLE = { default: { ttl: 60_000, limit: 20 } };
const POOL_REPORT_THROTTLE = { default: { ttl: 60_000, limit: 60 } };
const SOLO_START_THROTTLE = { default: { ttl: 60_000, limit: 10 } };

@Controller('quiz')
export class QuizController {
  constructor(
    private readonly pool: QuizPoolService,
    private readonly solo: QuizSoloService,
  ) {}

  @Post('pool')
  @HttpCode(200)
  @Throttle(POOL_ADD_THROTTLE)
  add(@Body() dto: QuizPoolAddDto): Promise<QuizPoolAddResponse> {
    return this.pool.add(dto.items);
  }

  @Get('pool/stats')
  stats(): QuizPoolStats {
    return this.pool.stats();
  }

  // 결과와 상관없이 204 (풀에서 뺐는지는 알려주지 않는다)
  @Post('pool/report')
  @HttpCode(204)
  @Throttle(POOL_REPORT_THROTTLE)
  report(@Body() dto: QuizPoolReportDto): void {
    this.pool.report(dto);
  }

  @Post('solo')
  @HttpCode(201)
  @Throttle(SOLO_START_THROTTLE)
  startSolo(): QuizSoloStartResponse {
    return this.solo.start();
  }

  @Post('solo/:sessionId/answer')
  @HttpCode(200)
  answerSolo(@Param('sessionId') sessionId: string, @Body() dto: QuizSoloAnswerDto): QuizSoloAnswerResponse {
    return this.solo.answer(sessionId, dto.index, dto.choice);
  }
}

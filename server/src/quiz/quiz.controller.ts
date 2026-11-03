import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  QuizPoolAddDto,
  QuizPoolReportDto,
  QuizSoloAnswerDto,
  QuizSoloStartDto,
  StationFlagDto,
  StationPoolAddDto,
} from './dto/quiz.dto';
import type {
  QuizPoolAddResponse,
  QuizPoolStats,
  QuizSoloAnswerResponse,
  QuizSoloStartResponse,
  StationPoolAddResponse,
  StationPoolStats,
  StationTodoResponse,
} from './quiz-api.types';
import { QuizPoolService } from './quiz-pool.service';
import { QuizSoloService } from './quiz-solo.service';
import { StationPoolService } from './station-pool.service';

// 풀에 보태기는 카카오 API 를 부르므로 IP당 1분에 20회, 좌표 보고는 60회, 혼자 하기 시작은 10회
// (지하철역 풀은 카카오 API 를 부르지 않지만 같은 제한)
const POOL_ADD_THROTTLE = { default: { ttl: 60_000, limit: 20 } };
const POOL_REPORT_THROTTLE = { default: { ttl: 60_000, limit: 60 } };
const SOLO_START_THROTTLE = { default: { ttl: 60_000, limit: 10 } };
// 신고는 문제 하나를 바로 빼므로 IP당 1분에 10회
const FLAG_THROTTLE = { default: { ttl: 60_000, limit: 10 } };

@Controller('quiz')
export class QuizController {
  constructor(
    private readonly pool: QuizPoolService,
    private readonly stations: StationPoolService,
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
    // 지역 퀴즈와 지하철역 퀴즈 어느 쪽 로드뷰인지 브라우저가 따로 알려주지 않아도 되게 둘 다 확인
    this.pool.report(dto);
    this.stations.report(dto);
  }

  @Get('stations/stats')
  stationStats(): StationPoolStats {
    return this.stations.stats();
  }

  @Get('stations/todo')
  @Throttle(POOL_ADD_THROTTLE)
  stationTodo(@Query('n') n?: string): StationTodoResponse {
    return { items: this.stations.todo(Number(n)) };
  }

  @Post('stations/pool')
  @HttpCode(200)
  @Throttle(POOL_ADD_THROTTLE)
  addStations(@Body() dto: StationPoolAddDto): StationPoolAddResponse {
    return this.stations.add(dto.items);
  }

  @Post('stations/flag')
  @HttpCode(204)
  @Throttle(FLAG_THROTTLE)
  flagStation(@Body() dto: StationFlagDto): void {
    this.stations.flag(dto.panoId);
  }

  @Post('solo')
  @HttpCode(201)
  @Throttle(SOLO_START_THROTTLE)
  startSolo(@Body() dto: QuizSoloStartDto): QuizSoloStartResponse {
    return this.solo.start(dto.kind ?? 'region');
  }

  @Post('solo/:sessionId/answer')
  @HttpCode(200)
  answerSolo(@Param('sessionId') sessionId: string, @Body() dto: QuizSoloAnswerDto): QuizSoloAnswerResponse {
    return this.solo.answer(sessionId, dto.index, dto.choice);
  }
}

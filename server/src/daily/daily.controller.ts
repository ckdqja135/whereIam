import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DailyFinishDto, DailyGuessDto } from './dto/daily.dto';
import { DailyService } from './daily.service';
import type {
  DailyFinishResponse,
  DailyGuessResponse,
  DailyInfoResponse,
  DailyLeaderboardResponse,
  DailyRoundStartResponse,
  DailySessionResponse,
  DailyStartResponse,
} from './daily.types';

// 시작은 IP당 1분에 10회, 결과 남기기는 5회 (한 판 진행 요청은 기본 제한)
const START_THROTTLE = { default: { ttl: 60_000, limit: 10 } };
const FINISH_THROTTLE = { default: { ttl: 60_000, limit: 5 } };

@Controller('daily')
export class DailyController {
  constructor(private readonly daily: DailyService) {}

  @Get()
  info(): DailyInfoResponse {
    return this.daily.info();
  }

  @Post('start')
  @HttpCode(201)
  @Throttle(START_THROTTLE)
  start(): DailyStartResponse {
    return this.daily.start();
  }

  // 새로고침 뒤 이어서 하기
  @Get(':sessionId')
  session(@Param('sessionId') sessionId: string): DailySessionResponse {
    return this.daily.session(sessionId);
  }

  @Post(':sessionId/rounds/:round/start')
  @HttpCode(200)
  startRound(@Param('sessionId') sessionId: string, @Param('round', ParseIntPipe) round: number): DailyRoundStartResponse {
    return this.daily.startRound(sessionId, round);
  }

  @Post(':sessionId/rounds/:round/guess')
  @HttpCode(200)
  guess(
    @Param('sessionId') sessionId: string,
    @Param('round', ParseIntPipe) round: number,
    @Body() dto: DailyGuessDto,
  ): DailyGuessResponse {
    return this.daily.guess(sessionId, round, dto.guess);
  }

  @Post(':sessionId/finish')
  @HttpCode(201)
  @Throttle(FINISH_THROTTLE)
  finish(@Param('sessionId') sessionId: string, @Body() dto: DailyFinishDto): DailyFinishResponse {
    return this.daily.finish(sessionId, dto.player);
  }

  @Get(':date/leaderboard')
  leaderboard(@Param('date') date: string): DailyLeaderboardResponse {
    return this.daily.leaderboard(date);
  }
}

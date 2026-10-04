import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  ChallengeResponse,
  CreateChallengeResponse,
  LeaderboardResponse,
  SubmitResultResponse,
} from './challenge.types';
import { ChallengesService } from './challenges.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { SubmitResultDto } from './dto/submit-result.dto';

// 생성/제출은 IP당 1분에 10회로 더 엄격하게 제한
const STRICT_THROTTLE = { default: { ttl: 60_000, limit: 10 } };

@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

  @Post()
  @HttpCode(201)
  @Throttle(STRICT_THROTTLE)
  create(@Body() dto: CreateChallengeDto): CreateChallengeResponse {
    return this.challenges.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string): ChallengeResponse {
    return this.challenges.findOne(id);
  }

  @Post(':id/results')
  @Throttle(STRICT_THROTTLE)
  submitResult(@Param('id') id: string, @Body() dto: SubmitResultDto): SubmitResultResponse {
    return this.challenges.submitResult(id, dto);
  }

  @Get(':id/leaderboard')
  leaderboard(@Param('id') id: string): LeaderboardResponse {
    return this.challenges.leaderboard(id);
  }
}

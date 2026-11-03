import { Module } from '@nestjs/common';
import { QuizModule } from '../quiz/quiz.module';
import { DailyController } from './daily.controller';
import { DailyService } from './daily.service';

// 오늘의 문제 (날짜별 5곳은 SQLite, 진행 중인 판은 메모리). 위치는 지역 퀴즈 문제 풀에서 고른다
@Module({
  imports: [QuizModule],
  controllers: [DailyController],
  providers: [DailyService],
})
export class DailyModule {}

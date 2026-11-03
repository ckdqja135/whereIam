import { Module } from '@nestjs/common';
import { KakaoGeocoderService } from './kakao-geocoder.service';
import { QuizController } from './quiz.controller';
import { QuizPoolService } from './quiz-pool.service';
import { QuizSoloService } from './quiz-solo.service';

// 4지선다 퀴즈 문제 풀 (SQLite) + 혼자 하기 세션 (메모리). 대결 방도 QuizPoolService 로 문제를 만든다
@Module({
  controllers: [QuizController],
  providers: [KakaoGeocoderService, QuizPoolService, QuizSoloService],
  exports: [QuizPoolService],
})
export class QuizModule {}

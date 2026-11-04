import { Module } from '@nestjs/common';
import { KakaoGeocoderService } from './kakao-geocoder.service';
import { QuizController } from './quiz.controller';
import { QuizPoolService } from './quiz-pool.service';
import { QuizSoloService } from './quiz-solo.service';
import { StationCatalogService } from './station-catalog.service';
import { StationPoolService } from './station-pool.service';
import { StationPhotoCheckService } from './station-photo-check.service';

// 4지선다 퀴즈 문제 풀 (SQLite: 지역 quiz_pool, 지하철역 stations) + 혼자 하기 세션 (메모리).
// 대결 방도 QuizPoolService / StationPoolService 로 문제를 만든다
@Module({
  controllers: [QuizController],
  providers: [
    KakaoGeocoderService,
    QuizPoolService,
    StationCatalogService,
    StationPhotoCheckService,
    StationPoolService,
    QuizSoloService,
  ],
  exports: [QuizPoolService, StationPoolService],
})
export class QuizModule {}

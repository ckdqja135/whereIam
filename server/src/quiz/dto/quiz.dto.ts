import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsPositive,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { QUIZ_CHOICES, QUIZ_QUESTIONS } from '../../rooms/quiz';

// 한 번에 보탤 수 있는 로드뷰 수
export const QUIZ_POOL_ADD_MAX = 20;

// 대한민국 범위 안의 로드뷰 (실제로 열린 파노라마 좌표)
export class QuizPoolItemDto {
  @IsInt()
  @IsPositive()
  @Max(Number.MAX_SAFE_INTEGER)
  panoId: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(33)
  @Max(39)
  lat: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(124)
  @Max(132)
  lng: number;
}

// POST /quiz/pool (1~20개)
export class QuizPoolAddDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(QUIZ_POOL_ADD_MAX)
  @ValidateNested({ each: true })
  @Type(() => QuizPoolItemDto)
  items: QuizPoolItemDto[];
}

// POST /quiz/pool/report
export class QuizPoolReportDto extends QuizPoolItemDto {}

// POST /quiz/solo/:sessionId/answer. 이번 판에 실제로 있는 문제 번호인지는 서비스에서 검사
export class QuizSoloAnswerDto {
  @IsInt()
  @Min(0)
  @Max(QUIZ_QUESTIONS - 1)
  index: number;

  // 0~3 또는 null(시간 초과). 빠뜨리면 400
  @ValidateIf((_o, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(QUIZ_CHOICES - 1)
  choice: number | null;
}

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { QUIZ_CHOICES, QUIZ_KINDS, QUIZ_QUESTIONS } from '../../rooms/quiz';
import type { QuizKind } from '../../rooms/quiz';

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

// POST /quiz/solo. 없으면 region
export class QuizSoloStartDto {
  @IsOptional()
  @IsIn(QUIZ_KINDS)
  kind?: QuizKind;
}

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

// "2026/06/9152477/2_103458_9152477_20260605061034" (연/월/폴더/파일 이름)
export const ROADVIEW_CUBE_PATTERN = /^\d{4}\/\d{2}\/\d{1,12}\/[0-9_]{1,60}$/;

// 역 바로 앞 로드뷰. panoId 가 null 이면 근처에 로드뷰가 없음 (좌표 없이)
export class StationPoolItemDto {
  // 카카오 장소 id (숫자 문자열)
  @Matches(/^\d{1,20}$/)
  stationId: string;

  @ValidateIf((_o, value) => value !== null)
  @IsInt()
  @IsPositive()
  @Max(Number.MAX_SAFE_INTEGER)
  panoId: number | null;

  @ValidateIf((o: StationPoolItemDto) => o.panoId !== null)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(33)
  @Max(39)
  lat?: number;

  @ValidateIf((o: StationPoolItemDto) => o.panoId !== null)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(124)
  @Max(132)
  lng?: number;

  // 로드뷰 사진 경로. 서버는 정해진 카카오 주소(map.kakaocdn.net)에 이 경로만 붙여서 사진을 받는다
  @ValidateIf((o: StationPoolItemDto) => o.panoId !== null)
  @Matches(ROADVIEW_CUBE_PATTERN)
  cube?: string;

  // 사진 앞면의 방향 (0~360)
  @ValidateIf((o: StationPoolItemDto) => o.panoId !== null)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(360)
  heading?: number;
}

// POST /quiz/stations/pool (1~20개)
export class StationPoolAddDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(QUIZ_POOL_ADD_MAX)
  @ValidateNested({ each: true })
  @Type(() => StationPoolItemDto)
  items: StationPoolItemDto[];
}

// POST /quiz/stations/flag
export class StationFlagDto {
  @IsInt()
  @IsPositive()
  @Max(Number.MAX_SAFE_INTEGER)
  panoId: number;
}

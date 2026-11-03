import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ChallengeLocationDto, GameSettingsDto } from '../../challenges/dto/create-challenge.dto';
import { ROUNDS_PER_GAME } from '../../challenges/score';
import { QUIZ_CHOICES, QUIZ_QUESTIONS } from '../quiz';
import type { QuizLevel } from '../room.types';

// 퀴즈 보기 한 개의 최대 길이 (앞뒤 공백 제거 후)
const QUIZ_CHOICE_MAX_LENGTH = 40;
const QUIZ_LEVELS: QuizLevel[] = ['easy', 'hard'];

// POST /rooms/:code/ready
export class RoomReadyDto {
  @IsBoolean()
  ready: boolean;
}

// POST /rooms/:code/settings (방장, 대기실)
export class RoomSettingsDto {
  @IsObject()
  @ValidateNested()
  @Type(() => GameSettingsDto)
  settings: GameSettingsDto;
}

// 퀴즈 문제 한 개 (방장 브라우저가 카카오 주소 변환으로 만든 보기)
export class RoomQuizQuestionDto {
  @IsObject()
  @ValidateNested()
  @Type(() => ChallengeLocationDto)
  location: ChallengeLocationDto;

  // 정확히 4개, 각 앞뒤 공백 제거 후 1~40자, 공백 제거 기준으로 서로 달라야 한다
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value.map((v: unknown) => (typeof v === 'string' ? v.trim() : v)) : value,
  )
  @IsArray()
  @ArrayMinSize(QUIZ_CHOICES)
  @ArrayMaxSize(QUIZ_CHOICES)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, QUIZ_CHOICE_MAX_LENGTH, { each: true })
  choices: string[];

  @IsInt()
  @Min(0)
  @Max(QUIZ_CHOICES - 1)
  answer: number;

  @IsIn(QUIZ_LEVELS)
  level: QuizLevel;
}

// POST /rooms/:code/start (방장, 대기실). 로드뷰 위치는 브라우저에서만 뽑을 수 있어 방장이 올린다.
// classic 은 locations(5개), quiz 는 quiz(QUIZ_QUESTIONS 개)가 필요하다. 게임 종류별 필수 여부/개수는 서비스에서 검사
export class RoomStartDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(ROUNDS_PER_GAME)
  @ArrayMaxSize(ROUNDS_PER_GAME)
  @ValidateNested({ each: true })
  @Type(() => ChallengeLocationDto)
  locations?: ChallengeLocationDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(QUIZ_QUESTIONS)
  @ValidateNested({ each: true })
  @Type(() => RoomQuizQuestionDto)
  quiz?: RoomQuizQuestionDto[];
}

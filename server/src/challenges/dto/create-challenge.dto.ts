import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type { Guess, ItemId } from '../challenge.types';
import { ROUNDS_PER_GAME } from '../score';
import { IsGuessArray } from './guess.validator';
import { IsItemsArray } from './items.validator';
import { PlayerInfoDto } from './player.dto';

export const TIME_LIMITS = [0, 60, 120, 300, 600];

export class GameSettingsDto {
  // 초 단위, 0 = 무제한
  @IsInt()
  @IsIn(TIME_LIMITS)
  timeLimit: number;

  @IsBoolean()
  allowMove: boolean;

  @IsBoolean()
  allowPan: boolean;

  @IsBoolean()
  allowZoom: boolean;

  // 없으면 노템 모드
  @IsOptional()
  @IsBoolean()
  itemMode?: boolean;
}

// 대한민국 범위 안의 로드뷰 위치
export class ChallengeLocationDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(33)
  @Max(39)
  lat: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(124)
  @Max(132)
  lng: number;

  @IsInt()
  @IsPositive()
  panoId: number;
}

export class CreateChallengeDto {
  @IsObject()
  @ValidateNested()
  @Type(() => PlayerInfoDto)
  creator: PlayerInfoDto;

  @IsObject()
  @ValidateNested()
  @Type(() => GameSettingsDto)
  settings: GameSettingsDto;

  @IsArray()
  @ArrayMinSize(ROUNDS_PER_GAME)
  @ArrayMaxSize(ROUNDS_PER_GAME)
  @ValidateNested({ each: true })
  @Type(() => ChallengeLocationDto)
  locations: ChallengeLocationDto[];

  // 만든 사람이 이미 플레이했다면 그 결과도 같이 등록
  @IsOptional()
  @IsGuessArray()
  creatorGuesses?: Guess[];

  @IsOptional()
  @IsItemsArray()
  creatorItems?: ItemId[][];
}

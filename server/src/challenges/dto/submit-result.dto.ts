import { Type } from 'class-transformer';
import { IsObject, ValidateNested } from 'class-validator';
import type { Guess } from '../challenge.types';
import { IsGuessArray } from './guess.validator';
import { PlayerInfoDto } from './player.dto';

export class SubmitResultDto {
  @IsObject()
  @ValidateNested()
  @Type(() => PlayerInfoDto)
  player: PlayerInfoDto;

  // 길이는 챌린지의 라운드 수와 같아야 함 (서비스에서 검사)
  @IsGuessArray()
  guesses: Guess[];
}

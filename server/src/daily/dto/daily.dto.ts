import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import type { Guess } from '../../challenges/challenge.types';
import { IsGuess } from '../../challenges/dto/guess.validator';
import { PlayerInfoDto } from '../../challenges/dto/player.dto';

// POST /daily/:sessionId/rounds/:round/guess — null(위치 안 찍음) 또는 { lat, lng }
export class DailyGuessDto {
  @IsGuess()
  guess: Guess;
}

// POST /daily/:sessionId/finish
export class DailyFinishDto {
  @ValidateNested()
  @Type(() => PlayerInfoDto)
  player: PlayerInfoDto;
}

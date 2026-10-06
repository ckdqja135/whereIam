import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsObject, ValidateNested } from 'class-validator';
import { ChallengeLocationDto, GameSettingsDto } from '../../challenges/dto/create-challenge.dto';
import { ROUNDS_PER_GAME } from '../../challenges/score';

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

// POST /rooms/:code/start (방장, 대기실). 로드뷰 위치는 브라우저에서만 뽑을 수 있어 방장이 올린다.
export class RoomStartDto {
  @IsArray()
  @ArrayMinSize(ROUNDS_PER_GAME)
  @ArrayMaxSize(ROUNDS_PER_GAME)
  @ValidateNested({ each: true })
  @Type(() => ChallengeLocationDto)
  locations: ChallengeLocationDto[];
}

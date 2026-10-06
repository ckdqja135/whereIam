import { Type } from 'class-transformer';
import { IsObject, ValidateNested } from 'class-validator';
import { GameSettingsDto } from '../../challenges/dto/create-challenge.dto';
import { PlayerInfoDto } from '../../challenges/dto/player.dto';

// POST /rooms
export class CreateRoomDto {
  @IsObject()
  @ValidateNested()
  @Type(() => PlayerInfoDto)
  player: PlayerInfoDto;

  @IsObject()
  @ValidateNested()
  @Type(() => GameSettingsDto)
  settings: GameSettingsDto;
}

// POST /rooms/:code/join
export class JoinRoomDto {
  @IsObject()
  @ValidateNested()
  @Type(() => PlayerInfoDto)
  player: PlayerInfoDto;
}

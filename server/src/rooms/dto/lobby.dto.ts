import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsObject, IsOptional, ValidateNested } from 'class-validator';
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

// POST /rooms/:code/start (방장, 대기실). classic 은 로드뷰 위치를 브라우저에서만 뽑을 수 있어 방장이 locations(5개)를 올린다.
// quiz 는 본문 없이({}) 보내면 서버가 문제 풀에서 고른다 (예전의 quiz 필드는 forbidNonWhitelisted 로 400). 필수 여부는 서비스에서 검사
export class RoomStartDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(ROUNDS_PER_GAME)
  @ArrayMaxSize(ROUNDS_PER_GAME)
  @ValidateNested({ each: true })
  @Type(() => ChallengeLocationDto)
  locations?: ChallengeLocationDto[];
}

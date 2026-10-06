import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsString, Max, MaxLength, Min } from 'class-validator';
import { ROOM_ATTACK_TYPES, ROOM_CHAT_MAX_LENGTH } from '../room.types';
import type { RoomAttackType } from '../room.types';
import type { Guess, ItemId } from '../../challenges/challenge.types';
import { IsGuess } from '../../challenges/dto/guess.validator';
import { ITEM_IDS, MAX_ITEMS_PER_GAME } from '../../challenges/items';
import { ROUNDS_PER_GAME } from '../../challenges/score';

// POST /rooms/:code/position — 로드뷰가 실제로 열린 파노라마 좌표 보고 (정답 보정용)
export class RoomPositionDto {
  @IsInt()
  @Min(1)
  @Max(ROUNDS_PER_GAME)
  round: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  lng: number;
}

// POST /rooms/:code/guess
export class RoomGuessDto {
  @IsInt()
  @Min(1)
  @Max(ROUNDS_PER_GAME)
  round: number;

  // null(추측 안 함) 또는 { lat, lng }
  @IsGuess()
  guess: Guess;

  // 이번 라운드에 쓴 아이템. 정해진 id 만, 라운드 안에서 중복 불가.
  // 노템 모드 여부와 게임 전체 합계(최대 3개)는 서비스에서 검사
  @IsArray()
  @ArrayMaxSize(MAX_ITEMS_PER_GAME)
  @ArrayUnique()
  @IsIn(ITEM_IDS, { each: true })
  items: ItemId[];
}

// POST /rooms/:code/away — 라운드 진행 중 다른 탭/창으로 나감
export class RoomAwayDto {
  @IsInt()
  @Min(1)
  @Max(ROUNDS_PER_GAME)
  round: number;
}

// POST /rooms/:code/chat (공백 제거 후 빈 문자열은 서비스에서 400)
export class RoomChatDto {
  @IsString()
  @MaxLength(ROOM_CHAT_MAX_LENGTH)
  text: string;
}

// POST /rooms/:code/kick (방장, 대기실)
export class RoomKickDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  playerId: string;
}

// POST /rooms/:code/attack (아이템 모드, 라운드 진행 중)
export class RoomAttackDto {
  @IsInt()
  @Min(1)
  @Max(ROUNDS_PER_GAME)
  round: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  targetId: string;

  @IsIn(ROOM_ATTACK_TYPES)
  type: RoomAttackType;
}

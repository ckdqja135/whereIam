import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsNumber, Max, Min } from 'class-validator';
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

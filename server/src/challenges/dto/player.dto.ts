import { Transform, Type } from 'class-transformer';
import { IsInt, IsObject, IsString, Length, Max, Min, ValidateNested } from 'class-validator';
import { AVATAR_LIMITS } from '../challenge.types';

// 각 항목: 0 이상 AVATAR_LIMITS[key] 미만 정수
export class AvatarDto {
  @IsInt() @Min(0) @Max(AVATAR_LIMITS.skin - 1)
  skin: number;

  @IsInt() @Min(0) @Max(AVATAR_LIMITS.hairStyle - 1)
  hairStyle: number;

  @IsInt() @Min(0) @Max(AVATAR_LIMITS.hairColor - 1)
  hairColor: number;

  @IsInt() @Min(0) @Max(AVATAR_LIMITS.eyes - 1)
  eyes: number;

  @IsInt() @Min(0) @Max(AVATAR_LIMITS.hat - 1)
  hat: number;

  @IsInt() @Min(0) @Max(AVATAR_LIMITS.outfitColor - 1)
  outfitColor: number;

  @IsInt() @Min(0) @Max(AVATAR_LIMITS.pantsColor - 1)
  pantsColor: number;
}

export class PlayerInfoDto {
  // 앞뒤 공백 제거 후 2~12자
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 12)
  nickname: string;

  @IsObject()
  @ValidateNested()
  @Type(() => AvatarDto)
  avatar: AvatarDto;
}

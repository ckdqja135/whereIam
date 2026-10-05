import { registerDecorator, ValidationOptions } from 'class-validator';
import { ITEM_IDS, MAX_ITEMS_PER_GAME } from '../items';

// 라운드별 아이템 배열: [['region'], [], ['radius', 'nearby'], ...]
// - 각 항목은 정해진 아이템 id, 같은 라운드 안에서 중복 불가
// - 게임 전체 합계는 MAX_ITEMS_PER_GAME 이하
// (라운드 수와 길이가 같은지는 서비스에서 검사)
function isValidItems(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  let total = 0;
  for (const round of value) {
    if (!Array.isArray(round)) return false;
    if (new Set(round).size !== round.length) return false;
    if (!round.every((id) => typeof id === 'string' && (ITEM_IDS as string[]).includes(id))) return false;
    total += round.length;
  }
  return total <= MAX_ITEMS_PER_GAME;
}

export function IsItemsArray(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isItemsArray',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} 은 라운드별 아이템 배열이어야 하며, 아이템은 게임당 최대 ${MAX_ITEMS_PER_GAME}개, 라운드 안에서 중복될 수 없습니다`,
        ...options,
      },
      validator: { validate: isValidItems },
    });
  };
}

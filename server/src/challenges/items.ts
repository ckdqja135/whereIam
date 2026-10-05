// 힌트 아이템 규칙. 프론트 src/lib/items.ts 와 반드시 같게 유지할 것.
import type { ItemId } from './challenge.types';

export const ITEM_PENALTIES: Record<ItemId, number> = {
  region: 800,
  radius: 1200,
  nearby: 1500,
};

export const ITEM_IDS = Object.keys(ITEM_PENALTIES) as ItemId[];

// 한 게임(라운드 전체)에서 쓸 수 있는 아이템 총 개수
export const MAX_ITEMS_PER_GAME = 3;

export function roundPenalty(items: ItemId[] | undefined): number {
  return (items ?? []).reduce((sum, id) => sum + ITEM_PENALTIES[id], 0);
}

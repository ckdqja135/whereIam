// 힌트 아이템 규칙. 서버 server/src/challenges/items.ts 와 반드시 같게 유지할 것.
import type { ItemId } from "./api-types";

export type { ItemId };

export interface ItemDef {
  id: ItemId;
  emoji: string;
  name: string;
  description: string;
  penalty: number;
}

export const ITEMS: ItemDef[] = [
  { id: "region", emoji: "🗺️", name: "지역 힌트", description: "정답의 시/도를 알려줘요", penalty: 800 },
  { id: "radius", emoji: "🎯", name: "범위 힌트", description: "지도에 정답이 있는 반경 50km 원을 그려줘요", penalty: 1200 },
  { id: "nearby", emoji: "🏫", name: "주변 장소", description: "정답 근처 학교·역·관공서 이름을 알려줘요", penalty: 1500 },
];

// 한 게임(라운드 전체)에서 쓸 수 있는 아이템 총 개수
export const MAX_ITEMS_PER_GAME = 3;

export function itemDef(id: ItemId): ItemDef {
  return ITEMS.find((i) => i.id === id)!;
}

export function roundPenalty(items: ItemId[] | undefined): number {
  return (items ?? []).reduce((sum, id) => sum + itemDef(id).penalty, 0);
}

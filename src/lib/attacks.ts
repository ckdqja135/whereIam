import { Droplets, FlipVertical2, RotateCw, Snowflake, type LucideIcon } from "lucide-react";
import type { RoomAttackType } from "./room-types";

export interface AttackDef {
  type: RoomAttackType;
  icon: LucideIcon;
  name: string;
  description: string;
  // 맞은 사람에게 보여줄 문구 (닉네임 뒤에 붙는다)
  hitText: string;
}

export const ATTACKS: AttackDef[] = [
  { type: "ink", icon: Droplets, name: "먹물", description: "상대 화면에 먹물을 뿌려 시야를 가려요 (6초)", hitText: "님이 먹물을 뿌렸어요!" },
  { type: "freeze", icon: Snowflake, name: "얼음", description: "상대를 얼려 아무것도 못 하게 해요 (5초)", hitText: "님이 얼음을 던졌어요!" },
  { type: "flip", icon: FlipVertical2, name: "뒤집기", description: "상대 화면을 거꾸로 뒤집어요 (6초)", hitText: "님이 화면을 뒤집었어요!" },
  { type: "spin", icon: RotateCw, name: "회전", description: "상대 화면을 빙글빙글 돌려요 (6초)", hitText: "님이 화면을 돌렸어요!" },
];

export function attackDef(type: RoomAttackType): AttackDef {
  return ATTACKS.find((a) => a.type === type)!;
}

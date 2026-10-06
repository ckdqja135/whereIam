"use client";

import { useCallback, useRef, useState } from "react";
import { itemDef, ItemId, MAX_ITEMS_PER_GAME } from "./items";
import { getNearbyHint, getRegionHint, makeRadiusHint } from "./hints";

export interface RoundHints {
  region: string | null;
  nearby: string | null;
  circle: { lat: number; lng: number; radius: number } | null;
}

const EMPTY_HINTS: RoundHints = { region: null, nearby: null, circle: null };

// 한 라운드의 아이템 사용 상태. 혼자 하기와 실시간 대결에서 같이 쓴다.
// usedBefore: 이번 라운드 전까지 이 게임에서 쓴 아이템 수
export function useRoundItems(enabled: boolean, usedBefore: number) {
  const [roundItems, setRoundItems] = useState<ItemId[]>([]);
  const [busy, setBusy] = useState<ItemId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hints, setHints] = useState<RoundHints>(EMPTY_HINTS);
  // reset 이후에 늦게 도착한 힌트 응답을 무시하기 위한 세대 번호
  const generationRef = useRef(0);

  const itemsLeft = MAX_ITEMS_PER_GAME - usedBefore - roundItems.length;

  const reset = useCallback(() => {
    generationRef.current += 1;
    setRoundItems([]);
    setBusy(null);
    setMessage(null);
    setHints(EMPTY_HINTS);
  }, []);

  // 힌트를 받는 데 성공했을 때만 아이템을 소모한다. 범위 힌트를 쓰면 true 를 돌려준다(지도 보기 전환용).
  const apply = useCallback(
    async (id: ItemId, answer: { lat: number; lng: number }): Promise<boolean> => {
      if (!enabled || busy || itemsLeft <= 0 || roundItems.includes(id)) return false;
      const generation = generationRef.current;
      setBusy(id);
      setMessage(null);
      let next: Partial<RoundHints> | null = null;
      try {
        if (id === "region") {
          const region = await getRegionHint(answer.lat, answer.lng);
          if (region) next = { region };
        } else if (id === "radius") {
          next = { circle: makeRadiusHint(answer.lat, answer.lng) };
        } else {
          const nearby = await getNearbyHint(answer.lat, answer.lng);
          if (nearby) next = { nearby };
        }
      } catch {
        next = null;
      }
      if (generation !== generationRef.current) return false;
      if (next) {
        setHints((prev) => ({ ...prev, ...next }));
        setRoundItems((prev) => [...prev, id]);
      } else {
        setMessage(`${itemDef(id).name}를 찾지 못했어요. 아이템은 소모되지 않았어요.`);
      }
      setBusy(null);
      return Boolean(next && id === "radius");
    },
    [enabled, busy, itemsLeft, roundItems]
  );

  return { roundItems, itemsLeft, busy, message, hints, apply, reset };
}

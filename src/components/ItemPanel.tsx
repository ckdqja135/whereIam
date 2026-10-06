"use client";

import { useState } from "react";
import { ITEMS, ItemId, MAX_ITEMS_PER_GAME } from "@/lib/items";
import type { RoundHints } from "@/lib/use-round-items";

interface ItemPanelProps {
  itemsLeft: number;
  roundItems: ItemId[];
  busy: ItemId | null;
  message: string | null;
  disabled?: boolean;
  onUse: (id: ItemId) => void;
}

// 게임 화면 왼쪽 위 아이템 패널 (아이템 모드에서만)
// 모바일에서는 로드뷰를 가리지 않도록 접어 두고, 눌러서 펼친다 (데스크톱은 항상 펼침)
export function ItemPanel({ itemsLeft, roundItems, busy, message, disabled, onUse }: ItemPanelProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="pointer-events-auto w-full rounded-lg bg-black/70 p-2 text-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 px-1 text-left text-[11px] font-semibold text-white/70 sm:pointer-events-none"
      >
        <span>
          🎁 아이템 · 남은 횟수 <span className="text-yellow-300">{itemsLeft}</span>/{MAX_ITEMS_PER_GAME}
        </span>
        <span className="sm:hidden">{expanded ? "▲" : "▼"}</span>
      </button>
      <div className={`mt-1.5 flex-col gap-1 ${expanded ? "flex" : "hidden sm:flex"}`}>
        {ITEMS.map((item) => {
          const used = roundItems.includes(item.id);
          const off = disabled || used || itemsLeft <= 0 || busy !== null;
          return (
            <button
              key={item.id}
              onClick={() => onUse(item.id)}
              disabled={off}
              title={item.description}
              className="flex items-center justify-between gap-2 rounded-md bg-white/10 px-2.5 py-1.5 text-left text-xs font-semibold transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span>
                {item.emoji} {item.name}
                {used && " ✓"}
                {busy === item.id && " …"}
              </span>
              <span className="tabular-nums text-red-300">-{item.penalty.toLocaleString()}</span>
            </button>
          );
        })}
      </div>
      {message && <p className="mt-1.5 px-1 text-[11px] text-red-300">{message}</p>}
    </div>
  );
}

// 받은 힌트 표시
export function HintPanel({ hints }: { hints: RoundHints }) {
  if (!hints.region && !hints.nearby && !hints.circle) return null;
  return (
    <div className="pointer-events-auto w-full space-y-1 rounded-lg bg-violet-700/90 p-2.5 text-xs text-white shadow-lg">
      {hints.region && (
        <p>
          🗺️ 정답은 <b>{hints.region}</b>에 있어요
        </p>
      )}
      {hints.circle && (
        <p>
          🎯 지도에 표시된 <b>보라색 원 안</b>에 있어요
        </p>
      )}
      {hints.nearby && (
        <p>
          🏫 근처에 <b>{hints.nearby}</b>
        </p>
      )}
    </div>
  );
}

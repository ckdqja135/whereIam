"use client";

import { useState } from "react";
import type { RoomAttackType, RoomPlayer } from "@/lib/room-types";
import { ROOM_ATTACKS_PER_ROUND } from "@/lib/room-types";
import { ATTACKS, attackDef } from "@/lib/attacks";
import { normalizeAvatar } from "@/lib/avatar";
import AvatarPin from "../avatar/AvatarPin";

interface AttackPanelProps {
  attacksLeft: number;
  targets: RoomPlayer[]; // 방해할 수 있는 사람 (나 제외, 아직 제출 안 한 사람)
  busy: boolean;
  message: string | null;
  onAttack: (type: RoomAttackType, targetId: string) => void;
}

// 방해 아이템 패널. 아이템을 고르고, 상대가 여러 명이면 대상을 고른다.
// 모바일에서는 접어 두고 눌러서 펼친다 (데스크톱은 항상 펼침)
export default function AttackPanel({ attacksLeft, targets, busy, message, onAttack }: AttackPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [picking, setPicking] = useState<RoomAttackType | null>(null);

  const choose = (type: RoomAttackType) => {
    if (targets.length === 1) {
      onAttack(type, targets[0].id);
      setPicking(null);
    } else {
      setPicking((cur) => (cur === type ? null : type));
    }
  };

  const disabledAll = busy || attacksLeft <= 0 || targets.length === 0;

  return (
    <div className="pointer-events-auto w-full rounded-lg bg-red-950/80 p-2 text-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 px-1 text-left text-[11px] font-semibold text-white/80 sm:pointer-events-none"
      >
        <span>
          ⚔️ 방해 · 이번 라운드 <span className="text-yellow-300">{attacksLeft}</span>/{ROOM_ATTACKS_PER_ROUND}
        </span>
        <span className="sm:hidden">{expanded ? "▲" : "▼"}</span>
      </button>

      <div className={`mt-1.5 ${expanded ? "block" : "hidden sm:block"}`}>
        <div className="grid grid-cols-2 gap-1">
          {ATTACKS.map((a) => (
            <button
              key={a.type}
              onClick={() => choose(a.type)}
              disabled={disabledAll}
              title={a.description}
              aria-pressed={picking === a.type}
              className={`rounded-md px-2 py-1.5 text-left text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                picking === a.type ? "bg-yellow-400 text-gray-900" : "bg-white/10 hover:bg-white/20"
              }`}
            >
              {a.emoji} {a.name}
            </button>
          ))}
        </div>

        {/* 대상 고르기 (상대가 여러 명일 때) */}
        {picking && targets.length > 1 && (
          <div className="mt-1.5 rounded-md bg-black/40 p-1.5">
            <p className="px-1 pb-1 text-[11px] text-white/70">{attackDef(picking).emoji} 누구에게 쓸까요?</p>
            <div className="flex flex-col gap-1">
              {targets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onAttack(picking, t.id);
                    setPicking(null);
                  }}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/25 disabled:opacity-40"
                >
                  <AvatarPin avatar={normalizeAvatar(t.avatar)} size={20} />
                  <span className="truncate">{t.nickname}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {targets.length === 0 && attacksLeft > 0 && (
          <p className="mt-1.5 px-1 text-[11px] text-white/60">방해할 수 있는 상대가 없어요 (모두 제출함)</p>
        )}
        {message && <p className="mt-1.5 px-1 text-[11px] text-red-300">{message}</p>}
      </div>
    </div>
  );
}

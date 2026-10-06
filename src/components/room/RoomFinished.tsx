"use client";

import { useState } from "react";
import Link from "next/link";
import { roomActions } from "@/lib/api";
import type { RoomState } from "@/lib/room-types";
import { normalizeAvatar } from "@/lib/avatar";
import { MAX_SCORE } from "@/lib/score";
import AvatarPin from "../avatar/AvatarPin";

interface RoomFinishedProps {
  code: string;
  token: string;
  state: RoomState; // status === "finished"
  onState: (s: RoomState) => void;
  onLeave: () => void;
}

const MEDALS = ["🥇", "🥈", "🥉"];

// 최종 순위. 방장은 같은 멤버로 한 판 더 할 수 있다.
export default function RoomFinished({ code, token, state, onState, onLeave }: RoomFinishedProps) {
  const isHost = state.hostId === state.me;
  const [busy, setBusy] = useState(false);
  const ranked = [...state.players].sort((a, b) => b.totalScore - a.totalScore);
  const maxTotal = MAX_SCORE * state.totalRounds;

  const rematch = async () => {
    setBusy(true);
    try {
      onState(await roomActions.rematch(code, token));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-screen overflow-y-auto bg-gradient-to-b from-indigo-950 via-[#241a46] to-gray-900 px-4 py-10 text-white">
      <div className="mx-auto flex max-w-md flex-col items-center">
        <h1 className="text-3xl font-extrabold italic">최종 결과</h1>

        <ol className="mt-8 w-full space-y-2">
          {ranked.map((p, i) => (
            <li
              key={p.id}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 ${
                i === 0 ? "bg-yellow-400/20 ring-2 ring-yellow-300" : "bg-white/10"
              } ${p.id === state.me ? "outline outline-2 outline-blue-400" : ""}`}
            >
              <span className="w-8 text-center text-2xl">{MEDALS[i] ?? i + 1}</span>
              <AvatarPin avatar={normalizeAvatar(p.avatar)} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">
                  {p.nickname}
                  {p.left && <span className="ml-1 text-xs font-normal text-white/50">(나감)</span>}
                  {(p.awayCount ?? 0) > 0 && (
                    <span className="ml-1 text-xs font-normal text-yellow-300" title="라운드 중 다른 탭/창으로 나간 횟수">
                      ⚠️{p.awayCount}
                    </span>
                  )}
                </p>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-blue-400" style={{ width: `${(p.totalScore / maxTotal) * 100}%` }} />
                </div>
              </div>
              <span className="text-lg font-bold tabular-nums">{p.totalScore.toLocaleString()}</span>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex w-full gap-3">
          <Link
            href="/"
            onClick={onLeave}
            className="flex-1 rounded-lg bg-white/10 py-3 text-center font-semibold hover:bg-white/20"
          >
            나가기
          </Link>
          {isHost ? (
            <button
              onClick={rematch}
              disabled={busy}
              className="flex-1 rounded-lg bg-blue-600 py-3 font-semibold hover:bg-blue-700 disabled:bg-gray-500"
            >
              한 판 더
            </button>
          ) : (
            <p className="flex flex-1 items-center justify-center text-center text-sm text-white/60">방장이 한 판 더를 누르면 대기실로 돌아가요</p>
          )}
        </div>
      </div>
    </div>
  );
}

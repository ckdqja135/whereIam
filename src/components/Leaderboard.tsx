"use client";

import type { LeaderboardEntry } from "@/lib/api-types";
import { normalizeAvatar } from "@/lib/avatar";
import AvatarPin from "./avatar/AvatarPin";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  highlightId?: string | null;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function Leaderboard({ entries, highlightId }: LeaderboardProps) {
  if (entries.length === 0) {
    return <p className="py-4 text-center text-sm text-gray-500">아직 기록이 없어요</p>;
  }
  return (
    <ol className="divide-y divide-gray-100">
      {entries.map((e, i) => (
        <li
          key={e.resultId}
          className={`flex items-center gap-3 px-2 py-2 text-sm ${e.resultId === highlightId ? "rounded-lg bg-blue-50" : ""}`}
        >
          <span className="w-6 text-center font-bold text-gray-500">{MEDALS[i] ?? i + 1}</span>
          <AvatarPin avatar={normalizeAvatar(e.player.avatar)} size={28} />
          <span className="flex-1 truncate font-medium text-gray-800">{e.player.nickname}</span>
          <span className="font-bold tabular-nums text-gray-900">{e.totalScore.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}

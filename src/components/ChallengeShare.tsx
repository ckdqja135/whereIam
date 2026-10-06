"use client";

import { useState } from "react";
import { createChallenge, isApiConfigured } from "@/lib/api";
import type { Profile } from "@/lib/profile";
import type { GameSettings } from "@/lib/game-settings";
import type { RoundResult } from "@/lib/game";

interface ChallengeShareProps {
  profile: Profile;
  settings: GameSettings;
  results: RoundResult[];
}

// 방금 플레이한 5개 위치로 챌린지를 만들고 링크를 공유한다.
export default function ChallengeShare({ profile, settings, results }: ChallengeShareProps) {
  const [status, setStatus] = useState<"idle" | "creating" | "done" | "error">("idle");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  if (!isApiConfigured()) return null;

  const handleCreate = async () => {
    setStatus("creating");
    try {
      const { id } = await createChallenge({
        creator: { nickname: profile.nickname, avatar: profile.avatar },
        settings,
        locations: results.map((r) => r.answer),
        creatorGuesses: results.map((r) => r.guess),
        creatorItems: results.map((r) => r.items),
      });
      setLink(`${window.location.origin}/challenge/${id}`);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "챌린지를 만들지 못했어요.");
      setStatus("error");
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 복사 실패 시 사용자가 직접 선택해서 복사
    }
  };

  return (
    <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
      <p className="text-sm font-semibold text-indigo-900">친구에게 도전장 보내기</p>
      <p className="mt-1 text-xs text-indigo-700">같은 5개 장소로 친구와 점수를 겨뤄보세요</p>

      {status === "done" ? (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-base text-gray-800 sm:text-xs"
            />
            <button
              onClick={handleCopy}
              className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              {copied ? "복사됨!" : "복사"}
            </button>
          </div>
          <a href={link} className="block text-center text-xs font-semibold text-indigo-700 underline">
            순위표 보러 가기
          </a>
        </div>
      ) : (
        <>
          <button
            onClick={handleCreate}
            disabled={status === "creating"}
            className="mt-3 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-indigo-300"
          >
            {status === "creating" ? "만드는 중..." : "챌린지 링크 만들기"}
          </button>
          {status === "error" && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}

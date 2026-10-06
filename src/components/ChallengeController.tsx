"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useHydrated } from "@/lib/use-hydrated";
import { useKakaoSdk } from "@/lib/use-kakao-sdk";
import { getChallenge, getLeaderboard, submitChallengeResult } from "@/lib/api";
import type { ChallengeResponse, LeaderboardEntry } from "@/lib/api-types";
import { normalizeAvatar, randomAvatar } from "@/lib/avatar";
import { loadProfile, NICKNAME_MAX, Profile, saveProfile, validateNickname } from "@/lib/profile";
import type { RoundResult } from "@/lib/game";
import AvatarCustomizer from "./avatar/AvatarCustomizer";
import AvatarPin from "./avatar/AvatarPin";
import GameSession from "./GameSession";
import GameSettingsIcons from "./GameSettingsIcons";
import Leaderboard from "./Leaderboard";
import ResultScreen from "./ResultScreen";

type Screen = "loading" | "notFound" | "landing" | "playing" | "finished";

// /challenge/[id]: 도전장 확인 → 같은 5개 위치로 플레이 → 서버 채점 → 순위표
export default function ChallengeController({ id }: { id: string }) {
  const hydrated = useHydrated();
  if (!hydrated) return <Spinner />;
  return <ChallengeGame id={id} />;
}

function Spinner() {
  return (
    <div className="flex h-dvh items-center justify-center bg-gray-900">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-600 border-t-blue-500" />
    </div>
  );
}

function ChallengeGame({ id }: { id: string }) {
  const sdk = useKakaoSdk();
  const [screen, setScreen] = useState<Screen>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<ChallengeResponse | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [savedProfile] = useState(loadProfile);
  const [nickname, setNickname] = useState(savedProfile?.nickname ?? "");
  const [avatar, setAvatar] = useState(() => savedProfile?.avatar ?? randomAvatar());
  const [touched, setTouched] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [results, setResults] = useState<RoundResult[]>([]);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [submitError, setSubmitError] = useState("");
  const [myResultId, setMyResultId] = useState<string | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    getChallenge(id)
      .then((data) => {
        if (cancelled) return;
        setChallenge({ ...data, creator: { ...data.creator, avatar: normalizeAvatar(data.creator.avatar) } });
        setScreen("landing");
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "챌린지를 불러오지 못했어요.");
        setScreen("notFound");
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  const retryLoad = () => {
    setScreen("loading");
    setReloadKey((k) => k + 1);
  };

  const nicknameError = validateNickname(nickname);

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (nicknameError || !sdk.ready) return;
    const next = { nickname: nickname.trim(), avatar };
    saveProfile(next);
    setProfile(next);
    setScreen("playing");
  };

  const submit = useCallback(
    async (finalResults: RoundResult[], player: Profile) => {
      setSubmitState("submitting");
      try {
        const res = await submitChallengeResult(id, {
          player: { nickname: player.nickname, avatar: player.avatar },
          guesses: finalResults.map((r) => r.guess),
          items: finalResults.map((r) => r.items),
        });
        setMyResultId(res.resultId);
        setMyRank(res.rank);
        // 점수는 서버 계산 결과를 기준으로 표시한다
        setResults(finalResults.map((r, i) => ({ ...r, score: res.rounds[i]?.score ?? r.score })));
        setSubmitState("done");
        const board = await getLeaderboard(id);
        setLeaderboard(board.entries);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "결과를 저장하지 못했어요.");
        setSubmitState("error");
      }
    },
    [id]
  );

  // --- 로딩 / 없음 ---
  if (screen === "loading") return <Spinner />;

  if (screen === "notFound" || !challenge) {
    return (
      <div className="flex h-dvh items-center justify-center bg-gray-900 px-4">
        <div className="rounded-2xl bg-white p-8 text-center shadow-lg">
          <p className="text-lg font-bold text-gray-900">챌린지를 열 수 없어요</p>
          <p className="mt-2 text-sm text-gray-600">{loadError}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={retryLoad} className="rounded-lg bg-gray-100 px-5 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-200">
              다시 시도
            </button>
            <Link href="/" className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              메인으로
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // --- 플레이 ---
  if (screen === "playing" && profile) {
    return (
      <GameSession
        profile={profile}
        settings={challenge.settings}
        locations={challenge.locations}
        onFinish={(r) => {
          setResults(r);
          setScreen("finished");
          submit(r, profile);
        }}
      />
    );
  }

  // --- 결과 + 순위표 ---
  if (screen === "finished" && profile) {
    return (
      <ResultScreen
        profile={profile}
        results={results}
        title={`${challenge.creator.nickname}님의 챌린지`}
        actions={
          <>
            <Link
              href="/"
              className="flex-1 rounded-lg bg-gray-100 py-3 text-center font-semibold text-gray-800 transition-colors hover:bg-gray-200"
            >
              메인으로
            </Link>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                } catch {
                  // 무시
                }
              }}
              className="flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
            >
              링크 복사
            </button>
          </>
        }
      >
        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold text-gray-700">순위표</p>
            {myRank && <p className="text-xs text-gray-500">내 순위 {myRank}위</p>}
          </div>
          <div className="mt-2">
            {submitState === "submitting" && <p className="py-4 text-center text-sm text-gray-500">결과 저장 중...</p>}
            {submitState === "error" && (
              <div className="py-3 text-center">
                <p className="text-sm text-red-600">{submitError}</p>
                <button
                  onClick={() => submit(results, profile)}
                  className="mt-2 rounded-lg bg-gray-100 px-4 py-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-200"
                >
                  다시 저장
                </button>
              </div>
            )}
            {submitState === "done" && <Leaderboard entries={leaderboard} highlightId={myResultId} />}
          </div>
        </div>
      </ResultScreen>
    );
  }

  // --- 도전장 랜딩 ---
  return (
    <div className="h-dvh overflow-y-auto bg-gradient-to-b from-indigo-950 via-[#241a46] to-gray-900 px-4 py-10 text-white">
      <div className="mx-auto flex max-w-xl flex-col items-center">
        <h1 className="text-3xl font-extrabold italic tracking-tight sm:text-4xl">도전장이 도착했어요!</h1>

        <div className="mt-6 flex items-center gap-2 rounded-full bg-white/10 py-1.5 pl-1.5 pr-4">
          <AvatarPin avatar={challenge.creator.avatar} size={36} />
          <span className="font-bold">{challenge.creator.nickname}</span>
        </div>
        <p className="mt-2 text-sm text-white/80">님이 Where I Am 플레이에 도전장을 보냈어요</p>

        <form onSubmit={handleStart} className="mt-6 flex w-full max-w-xs flex-col items-center">
          <AvatarCustomizer avatar={avatar} onChange={setAvatar} dark />

          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onBlur={() => setTouched(true)}
            maxLength={NICKNAME_MAX}
            placeholder="닉네임"
            autoComplete="off"
            aria-label="닉네임"
            className="mt-5 w-full rounded-lg border border-white/30 bg-white/10 px-4 py-2.5 text-center text-white placeholder-white/50 outline-none focus:border-white/70"
          />
          {touched && nicknameError && <p className="mt-1 text-xs text-red-300">{nicknameError}</p>}

          <button
            type="submit"
            disabled={!sdk.ready}
            className="mt-4 w-full rounded-full bg-gradient-to-b from-lime-400 to-green-600 py-3 font-bold italic text-white shadow-lg transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:from-gray-500 disabled:to-gray-600"
          >
            {sdk.ready ? "도전하기" : sdk.error ? "카카오맵을 불러오지 못했어요" : "카카오맵 불러오는 중..."}
          </button>
        </form>

        <p className="mt-10 text-xs italic text-white/60">게임 설정</p>
        <div className="mt-3">
          <GameSettingsIcons settings={challenge.settings} />
        </div>
      </div>
    </div>
  );
}

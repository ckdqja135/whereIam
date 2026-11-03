"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useHydrated } from "@/lib/use-hydrated";
import { useKakaoSdk } from "@/lib/use-kakao-sdk";
import { finishDaily, getDailyInfo, getDailyLeaderboard, guessDaily, startDaily, startDailyRound } from "@/lib/api";
import type { LeaderboardEntry } from "@/lib/api-types";
import type { DailyInfoResponse, DailyStartResponse } from "@/lib/daily-api-types";
import { dailyLabel, dailyShareText, DailyRecord, loadDailyRecord, roundEmoji, saveDailyRecord, shareDaily } from "@/lib/daily";
import { randomAvatar } from "@/lib/avatar";
import { loadProfile, NICKNAME_MAX, Profile, saveProfile, validateNickname } from "@/lib/profile";
import type { RoundResult } from "@/lib/game";
import AvatarCustomizer from "../avatar/AvatarCustomizer";
import GameSession, { ServerRounds } from "../GameSession";
import GameSettingsIcons from "../GameSettingsIcons";
import Leaderboard from "../Leaderboard";
import ResultScreen from "../ResultScreen";

type Screen = "loading" | "error" | "landing" | "playing" | "finished";

// /daily: 오늘의 문제. 하루 5곳을 모두가 똑같이 풀고 그날 순위에 오른다 (이 브라우저에서는 하루 한 번)
export default function DailyController() {
  const hydrated = useHydrated();
  if (!hydrated) return <Spinner />;
  return <DailyGame />;
}

function Spinner() {
  return (
    <div className="flex h-dvh items-center justify-center bg-gray-900">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-600 border-t-blue-500" />
    </div>
  );
}

function DailyGame() {
  const sdk = useKakaoSdk();
  const [screen, setScreen] = useState<Screen>("loading");
  const [info, setInfo] = useState<DailyInfoResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // 이 브라우저에서 오늘 이미 남긴 결과
  const [record, setRecord] = useState<DailyRecord | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [players, setPlayers] = useState(0);

  const [savedProfile] = useState(loadProfile);
  const [nickname, setNickname] = useState(savedProfile?.nickname ?? "");
  const [avatar, setAvatar] = useState(() => savedProfile?.avatar ?? randomAvatar());
  const [touched, setTouched] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [session, setSession] = useState<DailyStartResponse | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [submitError, setSubmitError] = useState("");
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const loadBoard = useCallback(async (date: string) => {
    try {
      const res = await getDailyLeaderboard(date);
      setBoard(res.entries);
      setPlayers(res.players);
    } catch {
      // 순위표는 없어도 진행에 지장 없음
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getDailyInfo()
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        setPlayers(data.players);
        setRecord(loadDailyRecord(data.date));
        setScreen("landing");
        void loadBoard(data.date);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "오늘의 문제를 불러오지 못했어요.");
        setScreen("error");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, loadBoard]);

  // 라운드마다 서버가 로드뷰를 내주고 채점한다 (정답 좌표는 답한 뒤에만)
  const server = useMemo<ServerRounds | null>(
    () =>
      session && {
        total: session.rounds,
        start: (round) => startDailyRound(session.sessionId, round),
        guess: (round, guess) => guessDaily(session.sessionId, round, { guess }),
      },
    [session]
  );

  const nicknameError = validateNickname(nickname);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (nicknameError || !sdk.ready || starting) return;
    const next = { nickname: nickname.trim(), avatar };
    saveProfile(next);
    setProfile(next);
    setStarting(true);
    setStartError(null);
    try {
      setSession(await startDaily());
      setScreen("playing");
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "오늘의 문제를 시작하지 못했어요.");
    } finally {
      setStarting(false);
    }
  };

  const finish = useCallback(
    async (finalResults: RoundResult[], player: Profile) => {
      if (!session) return;
      setSubmitState("submitting");
      try {
        const res = await finishDaily(session.sessionId, { player: { nickname: player.nickname, avatar: player.avatar } });
        const next: DailyRecord = {
          date: session.date,
          resultId: res.resultId,
          totalScore: res.totalScore,
          rounds: res.rounds.map((r) => r.score),
          rank: res.rank,
        };
        saveDailyRecord(next);
        setRecord(next);
        setPlayers(res.players);
        setResults(finalResults.map((r, i) => ({ ...r, score: res.rounds[i]?.score ?? r.score })));
        setSubmitState("done");
        void loadBoard(session.date);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "결과를 저장하지 못했어요.");
        setSubmitState("error");
      }
    },
    [session, loadBoard]
  );

  const share = async (r: DailyRecord) => {
    const result = await shareDaily(dailyShareText(r.date, r.rounds, r.totalScore), `${window.location.origin}/daily`);
    setShareMsg(
      result === "copied"
        ? "복사했어요! 카카오톡·디스코드에 붙여넣으세요"
        : result === "failed"
          ? "공유하지 못했어요. 주소창의 링크를 복사해 주세요"
          : null
    );
  };

  if (screen === "loading") return <Spinner />;

  if (screen === "error" || !info) {
    return (
      <div className="flex h-dvh items-center justify-center bg-gray-900 px-4">
        <div className="rounded-2xl bg-white p-8 text-center shadow-lg">
          <p className="text-lg font-bold text-gray-900">오늘의 문제를 열 수 없어요</p>
          <p className="mt-2 text-sm text-gray-600">{loadError}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => {
                setScreen("loading");
                setReloadKey((k) => k + 1);
              }}
              className="rounded-lg bg-gray-100 px-5 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-200"
            >
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
  if (screen === "playing" && profile && session && server) {
    return (
      <GameSession
        profile={profile}
        settings={session.settings}
        server={server}
        onFinish={(r) => {
          setResults(r);
          setScreen("finished");
          void finish(r, profile);
        }}
      />
    );
  }

  const date = session?.date ?? info.date;

  // --- 결과 + 순위표 ---
  if (screen === "finished" && profile) {
    return (
      <ResultScreen
        profile={profile}
        results={results}
        title={`오늘의 문제 · ${dailyLabel(date)}`}
        actions={
          <>
            <Link
              href="/"
              className="flex-1 rounded-lg bg-gray-100 py-3 text-center font-semibold text-gray-800 transition-colors hover:bg-gray-200"
            >
              메인으로
            </Link>
            <button
              onClick={() => record && void share(record)}
              disabled={!record}
              className="flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-gray-400"
            >
              결과 공유하기
            </button>
          </>
        }
      >
        {shareMsg && <p className="mt-3 text-center text-xs font-semibold text-blue-600">{shareMsg}</p>}
        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold text-gray-700">오늘의 순위</p>
            {record && (
              <p className="text-xs text-gray-500">
                {players}명 중 {record.rank}위
              </p>
            )}
          </div>
          <div className="mt-2">
            {submitState === "submitting" && <p className="py-4 text-center text-sm text-gray-500">결과 저장 중...</p>}
            {submitState === "error" && (
              <div className="py-3 text-center">
                <p className="text-sm text-red-600">{submitError}</p>
                <button
                  onClick={() => void finish(results, profile)}
                  className="mt-2 rounded-lg bg-gray-100 px-4 py-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-200"
                >
                  다시 저장
                </button>
              </div>
            )}
            {submitState === "done" && <Leaderboard entries={board} highlightId={record?.resultId} />}
          </div>
        </div>
      </ResultScreen>
    );
  }

  // --- 랜딩 (오늘 이미 했으면 내 결과) ---
  return (
    <div className="h-dvh overflow-y-auto bg-gradient-to-b from-indigo-950 via-[#241a46] to-gray-900 px-4 py-10 text-white">
      <div className="mx-auto flex max-w-md flex-col items-center">
        <p className="text-sm font-semibold tracking-widest text-indigo-200">WHERE I AM</p>
        <h1 className="mt-1 text-3xl font-extrabold italic tracking-tight sm:text-4xl">📅 오늘의 문제</h1>
        <p className="mt-2 text-lg font-bold">{dailyLabel(info.date)}</p>
        <p className="mt-1 text-sm text-white/70">
          모두 같은 5곳, 하루 한 번 도전! {players > 0 && `오늘 ${players}명 도전`}
        </p>

        {record ? (
          <div className="mt-8 w-full rounded-2xl bg-white/10 p-6 text-center">
            <p className="text-sm text-white/70">오늘은 이미 도전했어요</p>
            <p className="mt-2 text-4xl font-extrabold tabular-nums text-yellow-300">{record.totalScore.toLocaleString()}점</p>
            <p className="mt-2 text-2xl tracking-widest">{record.rounds.map(roundEmoji).join("")}</p>
            <p className="mt-2 text-sm text-white/80">
              {players}명 중 {record.rank}위
            </p>
            <button
              onClick={() => void share(record)}
              className="mt-5 w-full rounded-full bg-gradient-to-b from-lime-400 to-green-600 py-3 font-bold text-white shadow-lg transition-transform hover:scale-[1.02]"
            >
              결과 공유하기
            </button>
            {shareMsg && <p className="mt-2 text-xs font-semibold text-lime-200">{shareMsg}</p>}
            <p className="mt-4 text-xs text-white/60">내일 자정(한국 시간)에 새 문제가 나와요</p>
          </div>
        ) : (
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
            {startError && <p className="mt-2 text-center text-xs text-red-300">{startError}</p>}
            <button
              type="submit"
              disabled={!sdk.ready || starting}
              className="mt-4 w-full rounded-full bg-gradient-to-b from-lime-400 to-green-600 py-3 font-bold italic text-white shadow-lg transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:from-gray-500 disabled:to-gray-600"
            >
              {starting ? "준비 중..." : sdk.ready ? "도전하기" : sdk.error ? "카카오맵을 불러오지 못했어요" : "카카오맵 불러오는 중..."}
            </button>
          </form>
        )}

        <p className="mt-10 text-xs italic text-white/60">게임 설정</p>
        <div className="mt-3">
          <GameSettingsIcons settings={info.settings} />
        </div>

        <div className="mt-8 w-full rounded-2xl bg-white p-4 text-gray-900">
          <p className="text-sm font-semibold text-gray-700">오늘의 순위</p>
          <div className="mt-2">
            <Leaderboard entries={board} highlightId={record?.resultId} />
          </div>
        </div>

        <Link href="/" className="mt-6 text-sm text-white/70 underline underline-offset-4 hover:text-white">
          메인으로
        </Link>
      </div>
    </div>
  );
}

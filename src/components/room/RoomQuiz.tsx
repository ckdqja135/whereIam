"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Ellipsis, TriangleAlert } from "lucide-react";
import { reportQuizPosition, roomActions } from "@/lib/api";
import { ROOM_AWAY_PENALTY, RoomState } from "@/lib/room-types";
import { normalizeAvatar } from "@/lib/avatar";
import { QUIZ_RULES, quizKindOf } from "@/lib/quiz";
import { useAwayDetector } from "@/lib/use-anti-cheat";
import AvatarPin from "../avatar/AvatarPin";
import QuizStage, { QuizPicker } from "../quiz/QuizStage";

interface RoomQuizProps {
  code: string;
  token: string;
  state: RoomState; // status === "playing" | "reveal", settings.gameType === "quiz" | "station"
  clockOffset: number;
  onState: (s: RoomState) => void;
}

// 서버 마감 시각에는 네트워크 지연을 감안한 여유(2초)가 더해져 있다. 화면에는 빼고 보여준다
const DEADLINE_GRACE_MS = 2000;

// 대결 4지선다 퀴즈의 한 문제 (문제 → 정답 공개까지 같은 화면이라 로드뷰를 다시 불러오지 않는다)
export default function RoomQuiz({ code, token, state, clockOffset, onState }: RoomQuizProps) {
  const me = state.players.find((p) => p.id === state.me)!;
  // 퀴즈 방은 좌표를 보내지 않는다 (진행 중 location 은 null). 로드뷰는 panoId 로만 연다
  const revealing = state.status === "reveal";
  const result = revealing ? state.rounds[state.rounds.length - 1] : null;
  const choices = result?.quiz?.choices ?? state.quiz?.choices ?? [];
  const level = result?.quiz?.level ?? state.quiz?.level ?? "easy";
  const panoId = state.quiz?.panoId ?? 0;
  const kind = quizKindOf(state.settings.gameType) ?? "region";
  const seconds = QUIZ_RULES[kind].seconds;

  const [myChoice, setMyChoice] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awayThisRound, setAwayThisRound] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  const serverNow = now + clockOffset;
  const secondsLeft =
    !revealing && state.roundDeadline !== null
      ? Math.max(0, Math.min(seconds, (state.roundDeadline - DEADLINE_GRACE_MS - serverNow) / 1000))
      : null;
  const answered = myChoice !== null || me.submitted;

  // 답하기 전에 다른 탭/창으로 나가면 기록·감점 (단축키 차단은 RoomController 가 방 전체에서 담당)
  useAwayDetector(!revealing && !answered, () => {
    setAwayThisRound((n) => n + 1);
    roomActions.away(code, token, { round: state.round }).catch(() => {});
  });

  const pick = async (choice: number) => {
    if (answered || revealing || sending || secondsLeft === 0) return;
    setMyChoice(choice);
    setSending(true);
    setError(null);
    try {
      onState(await roomActions.answer(code, token, { round: state.round, choice }));
    } catch (err) {
      setMyChoice(null);
      setError(err instanceof Error ? err.message : "답을 보내지 못했어요.");
    } finally {
      setSending(false);
    }
  };

  // ---------- 결과 공개 ----------
  const myResult = result?.results.find((r) => r.playerId === state.me);
  const playerById = useMemo(() => new Map(state.players.map((p) => [p.id, p])), [state.players]);
  const pickers = useMemo(() => {
    const map = new Map<number, QuizPicker[]>();
    for (const r of result?.results ?? []) {
      if (r.choice === null || r.choice === undefined) continue;
      const p = playerById.get(r.playerId);
      if (!p) continue;
      const list = map.get(r.choice) ?? [];
      list.push({ id: p.id, nickname: p.nickname, avatar: normalizeAvatar(p.avatar) });
      map.set(r.choice, list);
    }
    return map;
  }, [result, playerById]);
  const deltaOf = (id: string) => result?.results.find((r) => r.playerId === id)?.score;
  const nextIn = revealing && state.revealDeadline !== null ? Math.max(0, Math.ceil((state.revealDeadline - serverNow) / 1000)) : null;

  const activePlayers = state.players.filter((p) => !p.left);
  const ranked = [...activePlayers].sort((a, b) => b.totalScore - a.totalScore);
  const isLast = state.round >= state.totalRounds;

  let banner: React.ReactNode = null;
  if (revealing && myResult) {
    const d = myResult.score;
    banner = (
      <span className={`rounded-full px-5 py-2 text-base font-extrabold text-white shadow-lg ${myResult.correct ? "bg-emerald-500" : "bg-red-500"}`}>
        {myResult.correct ? "정답!" : myResult.choice === null || myResult.choice === undefined ? "시간 초과" : "오답"} {d > 0 ? "+" : ""}
        {d.toLocaleString()}
        {(myResult.awayPenalty ?? 0) > 0 && <span className="ml-1 text-xs font-bold">(자리 비움 -{myResult.awayPenalty})</span>}
      </span>
    );
  } else if (!revealing && answered) {
    const done = activePlayers.filter((p) => p.submitted).length;
    banner = (
      <span className="rounded-full bg-black/75 px-4 py-1.5 text-sm font-semibold text-white">
        답 제출 완료! 다른 참가자를 기다리는 중 ({done}/{activePlayers.length})
      </span>
    );
  } else if (error) {
    banner = <span className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white">{error}</span>;
  } else if (awayThisRound > 0) {
    banner = (
      <span className="flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white">
        <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
        다른 탭/창으로 이동해서 이번 문제 -{(awayThisRound * ROOM_AWAY_PENALTY).toLocaleString()}점
      </span>
    );
  }

  return (
    <QuizStage
      kind={kind}
      panoId={panoId}
      view={state.quiz?.view}
      onLoaded={(lat, lng) => {
        // 실제 좌표를 서버에 보고 (저장된 문제 좌표와 다르면 서버가 그 문제를 풀에서 뺀다)
        if (panoId) reportQuizPosition({ panoId, lat, lng }).catch(() => {});
      }}
      questionNo={state.round}
      total={state.totalRounds}
      level={level}
      choices={choices}
      secondsLeft={secondsLeft}
      myChoice={revealing ? (myResult?.choice ?? null) : myChoice}
      answer={revealing ? (result?.quiz?.answer ?? null) : null}
      pickers={revealing ? pickers : undefined}
      disabled={revealing || answered || sending || secondsLeft === 0}
      onPick={pick}
      banner={banner}
      topLeft={
        <>
          <div className="pointer-events-auto w-full rounded-lg bg-black/70 p-2 text-white">
            {ranked.map((p, i) => {
              const d = deltaOf(p.id);
              return (
                <div key={p.id} className="flex items-center gap-2 py-0.5 text-xs">
                  <span className="w-3 text-center text-white/50">{i + 1}</span>
                  <AvatarPin avatar={normalizeAvatar(p.avatar)} size={22} />
                  <span className={`flex-1 truncate ${p.id === state.me ? "font-bold" : ""}`}>
                    {p.nickname}
                    {!p.connected && " (연결 끊김)"}
                  </span>
                  {(p.awayCount ?? 0) > 0 && (
                    <span className="flex items-center gap-0.5 text-yellow-300" title="문제를 푸는 중 다른 탭/창으로 나간 횟수">
                      <TriangleAlert className="h-3 w-3" aria-hidden />
                      {p.awayCount}
                    </span>
                  )}
                  <span className="tabular-nums text-white/80">{p.totalScore.toLocaleString()}</span>
                  {revealing && d !== undefined ? (
                    <span className={`w-12 text-right font-bold tabular-nums ${d > 0 ? "text-emerald-300" : "text-red-300"}`}>
                      {d > 0 ? "+" : ""}
                      {d.toLocaleString()}
                    </span>
                  ) : (
                    p.submitted ? (
                      <Check className="h-3.5 w-3.5 text-green-400" aria-label="제출함" />
                    ) : (
                      <Ellipsis className="h-3.5 w-3.5 text-white/40" aria-label="고르는 중" />
                    )
                  )}
                </div>
              );
            })}
          </div>
          {nextIn !== null && (
            <div className="rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">
              {nextIn}초 후 {isLast ? "최종 결과" : "다음 문제"}
            </div>
          )}
        </>
      }
    />
  );
}

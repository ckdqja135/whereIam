"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Profile } from "@/lib/profile";
import type { QuizKind, QuizPublicQuestion } from "@/lib/quiz";
import { applyQuizDelta, QUIZ_RULES, QUIZ_TEXT, quizDelta } from "@/lib/quiz";
import { answerQuizSolo, reportQuizPosition, startQuizSolo } from "@/lib/api";
import { ensureQuizPoolReady, ensureStationPoolReady } from "@/lib/quiz-pool";
import { useBlockDevtools } from "@/lib/use-anti-cheat";
import AvatarPin from "../avatar/AvatarPin";
import QuizStage from "./QuizStage";

export interface QuizResult {
  question: QuizPublicQuestion;
  answer: number; // 서버가 알려준 정답 번호
  choice: number | null; // null = 시간 초과
  correct: boolean;
  delta: number;
}

interface QuizSoloSessionProps {
  kind: QuizKind;
  profile: Profile;
  onFinish: (results: QuizResult[], total: number) => void;
}

// 정답 공개 시간 / 로드뷰가 늦게 뜰 때 타이머를 시작하는 최대 대기 시간
const REVEAL_MS = 3000;
const LOAD_FALLBACK_MS = 2500;

// 혼자 하는 4지선다 퀴즈 (지역 / 지하철역). 문제는 서버의 문제 풀에서 오고, 채점도 서버가 한다 (브라우저는 정답을 모른다).
export default function QuizSoloSession({ kind, profile, onFinish }: QuizSoloSessionProps) {
  const seconds = QUIZ_RULES[kind].seconds;
  const KindIcon = QUIZ_TEXT[kind].icon;
  const [session, setSession] = useState<{ id: string; questions: QuizPublicQuestion[] } | null>(null);
  const [preparing, setPreparing] = useState<{ total: number; minimum: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"question" | "checking" | "reveal">("question");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [myChoice, setMyChoice] = useState<number | null>(null);
  const [answerIndex, setAnswerIndex] = useState<number | null>(null);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [total, setTotal] = useState(0);
  const answeredRef = useRef(false);

  // 문제 받기 (풀이 부족하면 먼저 모은다)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ensure = kind === "station" ? ensureStationPoolReady : ensureQuizPoolReady;
        await ensure((t, m) => !cancelled && setPreparing({ total: t, minimum: m }));
        const res = await startQuizSolo(kind);
        if (!cancelled) setSession({ id: res.sessionId, questions: res.questions });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "문제를 불러오지 못했어요.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, kind]);

  useBlockDevtools(session !== null && phase === "question");

  const question = session?.questions[index];

  // 로드뷰가 뜨면 타이머 시작 (안 뜨더라도 잠시 뒤 시작). 실제 좌표는 서버에 보고만 한다 (풀 품질 관리)
  const markLoaded = useCallback(
    (lat?: number, lng?: number) => {
      setStartedAt((s) => s ?? Date.now());
      if (question && lat !== undefined && lng !== undefined) {
        reportQuizPosition({ panoId: question.panoId, lat, lng }).catch(() => {});
      }
    },
    [question]
  );
  useEffect(() => {
    if (!session || phase !== "question") return;
    const t = setTimeout(() => markLoaded(), LOAD_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [session, phase, index, markLoaded]);

  const secondsLeft = startedAt === null ? seconds : Math.max(0, seconds - (now - startedAt) / 1000);

  const answer = useCallback(
    async (choice: number | null) => {
      if (!session || !question || answeredRef.current) return;
      answeredRef.current = true;
      const remaining = secondsLeft;
      setMyChoice(choice);
      setPhase("checking");
      try {
        const res = await answerQuizSolo(session.id, { index, choice });
        const delta = quizDelta(res.correct, question.level, remaining, kind);
        setAnswerIndex(res.answer);
        setResults((r) => [...r, { question, answer: res.answer, choice, correct: res.correct, delta }]);
        setTotal((t) => applyQuizDelta(t, delta));
        setPhase("reveal");
      } catch (err) {
        setError(err instanceof Error ? err.message : "채점하지 못했어요.");
      }
    },
    [session, question, index, secondsLeft, kind]
  );

  // 시계 (시간이 다 되면 시간 초과로 제출). answerRef 는 위 answer 를 가리킨다
  const answerRef = useRef(answer);
  useEffect(() => {
    answerRef.current = answer;
  }, [answer]);
  const startedAtRef = useRef<number | null>(null);
  useEffect(() => {
    startedAtRef.current = startedAt;
  }, [startedAt]);
  useEffect(() => {
    if (!session || phase !== "question") return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const s = startedAtRef.current;
      if (s !== null && t - s >= seconds * 1000) answerRef.current(null);
    }, 100);
    return () => clearInterval(id);
  }, [session, phase, seconds]);

  // 정답을 잠깐 보여주고 다음 문제로
  useEffect(() => {
    if (phase !== "reveal" || !session) return;
    const t = setTimeout(() => {
      if (index + 1 >= session.questions.length) {
        onFinish(results, total);
        return;
      }
      answeredRef.current = false;
      setIndex((i) => i + 1);
      setMyChoice(null);
      setAnswerIndex(null);
      setStartedAt(null);
      setPhase("question");
    }, REVEAL_MS);
    return () => clearTimeout(t);
  }, [phase, session, index, results, total, onFinish]);

  const restart = () => {
    // 새 판으로 다시 시작 (이미 푼 문제의 답은 공개됐으므로 이어서 하지 않는다)
    setError(null);
    setSession(null);
    setPreparing(null);
    setIndex(0);
    setResults([]);
    setTotal(0);
    setMyChoice(null);
    setAnswerIndex(null);
    setStartedAt(null);
    setPhase("question");
    answeredRef.current = false;
    setAttempt((a) => a + 1);
  };

  if (error) {
    return (
      <div className="flex h-dvh items-center justify-center bg-gray-900 px-4">
        <div className="rounded-2xl bg-white p-8 text-center shadow-lg">
          <p className="text-lg font-bold text-gray-900">퀴즈를 진행할 수 없어요</p>
          <p className="mt-2 text-sm text-gray-600">{error}</p>
          <button onClick={restart} className="mt-6 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            처음부터 다시
          </button>
        </div>
      </div>
    );
  }

  if (!session || !question) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-gray-900 px-4 text-white">
        <KindIcon className="h-10 w-10 text-white/80" aria-hidden />
        <p className="text-lg font-bold">{preparing ? "문제를 모으는 중이에요" : "문제를 불러오는 중이에요"}</p>
        {preparing && (
          <>
            <div className="h-2 w-56 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-yellow-400 transition-[width]"
                style={{ width: `${Math.min(100, (preparing.total / preparing.minimum) * 100)}%` }}
              />
            </div>
            <p className="text-center text-xs text-white/60">
              처음 한 번만 필요해요. {kind === "station" ? "전국 지하철역 앞" : "전국의"} 로드뷰를 모으고 있어요 (
              {preparing.total}/{preparing.minimum})
            </p>
          </>
        )}
      </div>
    );
  }

  const last = results[results.length - 1];
  const banner =
    phase === "reveal" && last ? (
      <span className={`rounded-full px-5 py-2 text-base font-extrabold text-white shadow-lg ${last.correct ? "bg-emerald-500" : "bg-red-500"}`}>
        {last.correct ? "정답!" : last.choice === null ? "시간 초과" : "오답"} {last.delta > 0 ? "+" : ""}
        {last.delta.toLocaleString()}
      </span>
    ) : phase === "checking" ? (
      <span className="rounded-full bg-black/75 px-4 py-1.5 text-sm font-semibold text-white">채점 중…</span>
    ) : null;

  return (
    <QuizStage
      key={index}
      kind={kind}
      panoId={question.panoId}
      questionNo={index + 1}
      total={session.questions.length}
      level={question.level}
      choices={question.choices}
      secondsLeft={phase === "question" ? secondsLeft : null}
      myChoice={myChoice}
      answer={phase === "reveal" ? answerIndex : null}
      disabled={phase !== "question"}
      onPick={(i) => answer(i)}
      onLoaded={markLoaded}
      banner={banner}
      topLeft={
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg bg-black/70 py-1.5 pl-1.5 pr-3 text-sm font-bold text-white">
          <AvatarPin avatar={profile.avatar} size={30} />
          <span className="max-w-[7rem] truncate">{profile.nickname}</span>
          <span className="tabular-nums text-yellow-300">{total.toLocaleString()}점</span>
        </div>
      }
    />
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Profile } from "@/lib/profile";
import type { QuizQuestion } from "@/lib/quiz";
import { applyQuizDelta, QUIZ_QUESTIONS, QUIZ_SECONDS, quizDelta } from "@/lib/quiz";
import { generateQuiz } from "@/lib/quiz-generator";
import { useBlockDevtools } from "@/lib/use-anti-cheat";
import AvatarPin from "../avatar/AvatarPin";
import QuizStage from "./QuizStage";

export interface QuizResult {
  question: QuizQuestion;
  choice: number | null; // null = 시간 초과
  correct: boolean;
  delta: number;
}

interface QuizSoloSessionProps {
  profile: Profile;
  onFinish: (results: QuizResult[], total: number) => void;
}

// 정답 공개 시간 / 로드뷰가 늦게 뜰 때 타이머를 시작하는 최대 대기 시간
const REVEAL_MS = 3000;
const LOAD_FALLBACK_MS = 2500;

// 혼자 하는 4지선다 퀴즈 (카카오 SDK 로드 후에만 렌더링)
export default function QuizSoloSession({ profile, onFinish }: QuizSoloSessionProps) {
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"question" | "reveal">("question");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [myChoice, setMyChoice] = useState<number | null>(null);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [total, setTotal] = useState(0);
  const answeredRef = useRef(false);

  // 문제 만들기
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    generateQuiz(QUIZ_QUESTIONS, (done) => !cancelled && setProgress(done))
      .then((q) => !cancelled && setQuestions(q))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useBlockDevtools(questions !== null && phase === "question");

  // 로드뷰가 뜨면 타이머 시작 (안 뜨더라도 잠시 뒤 시작)
  const markLoaded = useCallback(() => {
    setStartedAt((s) => s ?? Date.now());
  }, []);
  useEffect(() => {
    if (!questions || phase !== "question") return;
    const t = setTimeout(markLoaded, LOAD_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [questions, phase, index, markLoaded]);

  // 시계 (시간이 다 되면 시간 초과로 제출). answerRef 는 아래 answer 를 가리킨다
  const answerRef = useRef<(choice: number | null) => void>(() => {});
  const startedAtRef = useRef<number | null>(null);
  useEffect(() => {
    startedAtRef.current = startedAt;
  }, [startedAt]);
  useEffect(() => {
    if (!questions || phase !== "question") return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const s = startedAtRef.current;
      if (s !== null && t - s >= QUIZ_SECONDS * 1000) answerRef.current(null);
    }, 100);
    return () => clearInterval(id);
  }, [questions, phase]);

  const question = questions?.[index];
  const secondsLeft = startedAt === null ? QUIZ_SECONDS : Math.max(0, QUIZ_SECONDS - (now - startedAt) / 1000);

  const answer = useCallback(
    (choice: number | null) => {
      if (!question || answeredRef.current) return;
      answeredRef.current = true;
      const correct = choice === question.answer;
      const delta = quizDelta(correct, question.level, secondsLeft);
      setMyChoice(choice);
      setResults((r) => [...r, { question, choice, correct, delta }]);
      setTotal((t) => applyQuizDelta(t, delta));
      setPhase("reveal");
    },
    [question, secondsLeft]
  );

  useEffect(() => {
    answerRef.current = answer;
  }, [answer]);

  // 정답을 잠깐 보여주고 다음 문제로
  useEffect(() => {
    if (phase !== "reveal" || !questions) return;
    const t = setTimeout(() => {
      if (index + 1 >= questions.length) {
        onFinish(results, total);
        return;
      }
      answeredRef.current = false;
      setIndex((i) => i + 1);
      setMyChoice(null);
      setStartedAt(null);
      setPhase("question");
    }, REVEAL_MS);
    return () => clearTimeout(t);
  }, [phase, questions, index, results, total, onFinish]);

  if (error) {
    return (
      <div className="flex h-dvh items-center justify-center bg-gray-900 px-4">
        <div className="rounded-2xl bg-white p-8 text-center shadow-lg">
          <p className="text-lg font-bold text-gray-900">문제를 만들지 못했어요</p>
          <p className="mt-2 text-sm text-gray-600">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setProgress(0);
              setAttempt((a) => a + 1);
            }}
            className="mt-6 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (!questions || !question) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-gray-900 px-4 text-white">
        <p className="text-4xl">❓</p>
        <p className="text-lg font-bold">문제를 준비하고 있어요</p>
        <div className="h-2 w-56 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-yellow-400 transition-[width]" style={{ width: `${(progress / QUIZ_QUESTIONS) * 100}%` }} />
        </div>
        <p className="text-sm tabular-nums text-white/60">
          {progress}/{QUIZ_QUESTIONS}
        </p>
      </div>
    );
  }

  const last = results[results.length - 1];
  const banner =
    phase === "reveal" && last ? (
      <span
        className={`rounded-full px-5 py-2 text-base font-extrabold text-white shadow-lg ${
          last.correct ? "bg-emerald-500" : "bg-red-500"
        }`}
      >
        {last.correct ? "정답!" : last.choice === null ? "시간 초과" : "오답"} {last.delta > 0 ? "+" : ""}
        {last.delta.toLocaleString()}
      </span>
    ) : null;

  return (
    <QuizStage
      key={index}
      location={question.location}
      questionNo={index + 1}
      total={questions.length}
      level={question.level}
      choices={question.choices}
      secondsLeft={phase === "question" ? secondsLeft : null}
      myChoice={myChoice}
      answer={phase === "reveal" ? question.answer : null}
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

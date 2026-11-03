"use client";

import type { ReactNode } from "react";
import type { ChallengeLocation } from "@/lib/api-types";
import type { Avatar } from "@/lib/avatar";
import type { QuizLevel } from "@/lib/quiz";
import { QUIZ_LEVEL_LABEL, QUIZ_SECONDS } from "@/lib/quiz";
import RoadviewPane from "../RoadviewPane";
import AvatarPin from "../avatar/AvatarPin";

export interface QuizPicker {
  id: string;
  nickname: string;
  avatar: Avatar;
}

interface QuizStageProps {
  location: ChallengeLocation;
  questionNo: number;
  total: number;
  level: QuizLevel;
  choices: string[];
  // 남은 시간 (초, 소수 가능). null 이면 타이머 숨김
  secondsLeft: number | null;
  myChoice: number | null;
  // 결과 공개 중이면 정답 번호, 아니면 null
  answer: number | null;
  // 결과 공개 중 각 보기를 고른 사람들 (대결)
  pickers?: Map<number, QuizPicker[]>;
  disabled: boolean;
  onPick: (choice: number) => void;
  onLoaded?: () => void;
  topLeft?: ReactNode; // 점수/참가자 현황
  banner?: ReactNode; // 정답·오답 안내
}

const MARKS = ["A", "B", "C", "D"];

// 4지선다 문제 화면: 움직일 수 없는 로드뷰(사진처럼) + 타이머 + 보기 4개
export default function QuizStage({
  location,
  questionNo,
  total,
  level,
  choices,
  secondsLeft,
  myChoice,
  answer,
  pickers,
  disabled,
  onPick,
  onLoaded,
  topLeft,
  banner,
}: QuizStageProps) {
  const revealed = answer !== null;
  const fraction = secondsLeft === null ? 1 : Math.max(0, Math.min(1, secondsLeft / QUIZ_SECONDS));
  const urgent = secondsLeft !== null && secondsLeft <= 5;

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-gray-900">
      {/* 이동·회전·확대를 모두 막은 로드뷰 = 스크린샷처럼 보인다 */}
      <div className="absolute inset-0">
        <RoadviewPane
          panoId={location.panoId}
          lat={location.lat}
          lng={location.lng}
          isLoading={false}
          allowMove={false}
          allowPan={false}
          allowZoom={false}
          onActualPosition={onLoaded ? () => onLoaded() : undefined}
        />
      </div>

      {/* 상단: 문제 번호·난이도 / 타이머 */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex max-w-[16rem] flex-col items-start gap-2">{topLeft}</div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="rounded-lg bg-black/70 px-3 py-1.5 text-sm font-bold text-white">
              문제 {questionNo}/{total}
            </div>
            <div
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                level === "hard" ? "bg-rose-500 text-white" : "bg-emerald-500 text-white"
              }`}
            >
              {level === "hard" ? "어려움" : "쉬움"} · {QUIZ_LEVEL_LABEL[level]}
            </div>
          </div>
        </div>

        {secondsLeft !== null && (
          <div className="mx-auto mt-2 max-w-xl">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/40">
              <div
                className={`h-full rounded-full transition-[width] duration-200 ease-linear ${urgent ? "bg-red-500" : "bg-yellow-400"}`}
                style={{ width: `${fraction * 100}%` }}
              />
            </div>
            <p className={`mt-1 text-center text-sm font-bold tabular-nums drop-shadow ${urgent ? "text-red-400" : "text-white"}`}>
              {Math.ceil(secondsLeft)}초
            </p>
          </div>
        )}
      </div>

      {/* 하단: 질문 + 보기 4개 */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
        <div className="mx-auto max-w-2xl">
          {banner && <div className="mb-2 flex justify-center">{banner}</div>}
          <p className="mb-2 text-center text-lg font-extrabold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] sm:text-xl">
            여기는 어디일까요?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {choices.map((c, i) => {
              const isAnswer = revealed && i === answer;
              const isMineWrong = revealed && i === myChoice && i !== answer;
              const isMine = !revealed && i === myChoice;
              const people = pickers?.get(i) ?? [];
              return (
                <button
                  key={i}
                  onClick={() => onPick(i)}
                  disabled={disabled || myChoice !== null || revealed}
                  className={`relative flex min-h-14 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold shadow-lg transition-all sm:text-base ${
                    isAnswer
                      ? "bg-emerald-500 text-white ring-4 ring-emerald-200"
                      : isMineWrong
                        ? "bg-red-500 text-white"
                        : isMine
                          ? "bg-blue-600 text-white ring-4 ring-blue-200"
                          : revealed || myChoice !== null
                            ? "bg-white/70 text-gray-500"
                            : "bg-white text-gray-900 hover:-translate-y-0.5 hover:bg-yellow-50 active:translate-y-0"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
                      isAnswer || isMineWrong || isMine ? "bg-white/25" : "bg-gray-900 text-white"
                    }`}
                  >
                    {isAnswer ? "✓" : isMineWrong ? "✕" : MARKS[i]}
                  </span>
                  <span className="min-w-0 flex-1 break-keep leading-tight">{c}</span>
                  {people.length > 0 && (
                    <span className="flex shrink-0 -space-x-1.5">
                      {people.map((p) => (
                        <span key={p.id} title={p.nickname} className="rounded-full ring-2 ring-white">
                          <AvatarPin avatar={p.avatar} size={22} />
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

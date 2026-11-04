"use client";

import { useState, type ReactNode } from "react";
import { Check, Flag, X } from "lucide-react";
import { flagStation } from "@/lib/api";
import type { Avatar } from "@/lib/avatar";
import type { QuizKind, QuizLevel } from "@/lib/quiz";
import type { QuizView } from "@/lib/room-types";
import { QUIZ_RULES, QUIZ_TEXT } from "@/lib/quiz";
import RoadviewPane from "../RoadviewPane";
import AvatarPin from "../avatar/AvatarPin";

export interface QuizPicker {
  id: string;
  nickname: string;
  avatar: Avatar;
}

// 퀴즈는 좌표를 받지 않고 panoId 만으로 로드뷰를 연다. setPanoId 에는 위치가 필요하지만
// 아무 좌표나 넣어도 panoId 의 실제 위치로 열린다 (실험으로 확인). 국토 중앙 좌표를 넣는다
const PLACEHOLDER = { lat: 36.5, lng: 127.5 };

interface QuizStageProps {
  kind: QuizKind;
  panoId: number;
  // 지하철역: 시작 방향과 좌우 회전 범위 (출입구를 등지고 보기)
  view?: QuizView;
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
  // 로드뷰가 열리면 실제 좌표와 함께 호출 (타이머 시작·위치 보고용)
  onLoaded?: (lat: number, lng: number) => void;
  topLeft?: ReactNode; // 점수/참가자 현황
  banner?: ReactNode; // 정답·오답 안내
}

const MARKS = ["A", "B", "C", "D"];

// 4지선다 문제 화면: 움직일 수 없는 로드뷰 + 타이머 + 보기 4개.
// 지역 퀴즈는 사진처럼 완전히 고정, 지하철역 퀴즈는 제자리에서 시점만 돌려 볼 수 있다
export default function QuizStage({
  kind,
  panoId,
  view,
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
  const fraction = secondsLeft === null ? 1 : Math.max(0, Math.min(1, secondsLeft / QUIZ_RULES[kind].seconds));
  const urgent = secondsLeft !== null && secondsLeft <= 5;
  const text = QUIZ_TEXT[kind];
  const canLookAround = kind === "station";
  // 지하철역: 정답 공개 뒤 "역 이름이 보였어요" 신고 (사진 확인이 놓친 간판). 신고하면 그 문제는 다시 안 나온다
  const [flagged, setFlagged] = useState(false);
  const flag = () => {
    setFlagged(true);
    flagStation({ panoId }).catch(() => {});
  };

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-gray-900">
      {/* 이동·확대를 막고 화살표·도로명도 숨긴 로드뷰. 지역 퀴즈는 회전도 막아 스크린샷처럼 보인다 */}
      <div className="wia-rv-bare absolute inset-0">
        <RoadviewPane
          panoId={panoId}
          lat={PLACEHOLDER.lat}
          lng={PLACEHOLDER.lng}
          isLoading={false}
          allowMove={false}
          allowPan={canLookAround}
          allowZoom={false}
          viewLimit={canLookAround ? view : undefined}
          onActualPosition={onLoaded}
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
              {level === "hard" ? "어려움" : "쉬움"} · {text.levelLabel[level]}
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
          {canLookAround && revealed && (
            <div className="mb-2 flex justify-center">
              {flagged ? (
                <span className="rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold text-white/90">
                  신고했어요. 이 문제는 다시 나오지 않아요
                </span>
              ) : (
                <button
                  type="button"
                  onClick={flag}
                  className="flex items-center gap-1 rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold text-white/90 hover:bg-black/75"
                >
                  <Flag className="h-3 w-3" aria-hidden />
                  사진에 역 이름이 보였어요
                </button>
              )}
            </div>
          )}
          <p className="mb-2 text-center text-lg font-extrabold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] sm:text-xl">
            {text.prompt}
            {canLookAround && !revealed && (
              <span className="mt-0.5 block text-xs font-semibold text-white/80">
                역 출입구를 등지고 서 있어요 · 앞쪽만 드래그해서 둘러볼 수 있어요
              </span>
            )}
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
                    {isAnswer ? (
                      <Check className="h-4 w-4" aria-label="정답" />
                    ) : isMineWrong ? (
                      <X className="h-4 w-4" aria-label="내가 고른 오답" />
                    ) : (
                      MARKS[i]
                    )}
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

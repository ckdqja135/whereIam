"use client";

import { Check, X } from "lucide-react";
import type { Profile } from "@/lib/profile";
import type { QuizKind } from "@/lib/quiz";
import { QUIZ_TEXT, quizMaxTotal } from "@/lib/quiz";
import AvatarPin from "../avatar/AvatarPin";
import type { QuizResult } from "./QuizSoloSession";
import StationFlagButton from "./StationFlagButton";

interface QuizResultScreenProps {
  kind: QuizKind;
  profile: Profile;
  results: QuizResult[];
  total: number;
  onPlayAgain: () => void;
  onGoLobby: () => void;
}

// 혼자 하기 퀴즈 결과
export default function QuizResultScreen({ kind, profile, results, total, onPlayAgain, onGoLobby }: QuizResultScreenProps) {
  const correct = results.filter((r) => r.correct).length;

  return (
    <div className="h-dvh overflow-y-auto bg-gradient-to-b from-indigo-950 via-gray-900 to-gray-900 px-4 py-8">
      <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <AvatarPin avatar={profile.avatar} size={48} />
          <div>
            <p className="text-sm text-gray-500">{QUIZ_TEXT[kind].title} 결과</p>
            <p className="font-bold text-gray-900">{profile.nickname}</p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-4xl font-bold tabular-nums text-blue-600">{total.toLocaleString()}점</p>
          <p className="mt-1 text-sm text-gray-500">
            {results.length}문제 중 <b className="text-gray-900">{correct}개</b> 정답
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, (total / quizMaxTotal(kind)) * 100)}%` }} />
          </div>
        </div>

        {kind === "station" && (
          <p className="mt-6 text-xs text-gray-500">역 건물이나 역 이름이 바로 보인 문제는 신고해주세요. 다른 사진으로 바꿀게요</p>
        )}
        <ol className={`${kind === "station" ? "mt-2" : "mt-6"} divide-y divide-gray-100`}>
          {results.map((r, i) => (
            <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${r.correct ? "bg-emerald-500" : "bg-red-500"}`}>
                {r.correct ? <Check className="h-3.5 w-3.5" aria-label="정답" /> : <X className="h-3.5 w-3.5" aria-label="오답" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-gray-900">{r.question.choices[r.answer]}</p>
                <p className="text-xs text-gray-500">
                  {QUIZ_TEXT[kind].levelLabel[r.question.level]}
                  {!r.correct && ` · ${r.choice === null ? "시간 초과" : `고른 답: ${r.question.choices[r.choice]}`}`}
                </p>
              </div>
              {kind === "station" && <StationFlagButton panoId={r.question.panoId} variant="light" />}
              <span className={`shrink-0 font-bold tabular-nums ${r.delta > 0 ? "text-blue-600" : "text-red-500"}`}>
                {r.delta > 0 ? "+" : ""}
                {r.delta.toLocaleString()}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex gap-3">
          <button onClick={onGoLobby} className="flex-1 rounded-lg bg-gray-100 py-3 font-semibold text-gray-800 hover:bg-gray-200">
            메인으로
          </button>
          <button onClick={onPlayAgain} className="flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700">
            다시 하기
          </button>
        </div>
      </div>
    </div>
  );
}

import { Ban, Footprints, Gift, ListOrdered, MapPinned, Rotate3d, Timer, ZoomIn, type LucideIcon } from "lucide-react";
import type { GameSettings } from "@/lib/game-settings";
import { modeLabel, timeLimitLabel } from "@/lib/game-settings";
import { QUIZ_QUESTIONS, QUIZ_RULES, QUIZ_TEXT, quizKindOf } from "@/lib/quiz";

// 챌린지/결과 화면에 표시하는 게임 설정 요약
export default function GameSettingsIcons({ settings }: { settings: GameSettings }) {
  const quizKind = quizKindOf(settings.gameType);
  const items: { icon: LucideIcon; label: string; on: boolean }[] = quizKind
    ? [
        { icon: MapPinned, label: "대한민국", on: true },
        { icon: QUIZ_TEXT[quizKind].icon, label: QUIZ_TEXT[quizKind].title, on: true },
        { icon: Timer, label: `문제당 ${QUIZ_RULES[quizKind].seconds}초`, on: true },
        { icon: ListOrdered, label: `${QUIZ_QUESTIONS}문제`, on: true },
      ]
    : [
        { icon: MapPinned, label: "대한민국", on: true },
        { icon: settings.itemMode ? Gift : Ban, label: modeLabel(settings), on: true },
        { icon: Timer, label: timeLimitLabel(settings.timeLimit), on: true },
        { icon: Footprints, label: settings.allowMove ? "이동 허용" : "이동 금지", on: settings.allowMove },
        { icon: Rotate3d, label: settings.allowPan ? "회전 허용" : "회전 금지", on: settings.allowPan },
        { icon: ZoomIn, label: settings.allowZoom ? "확대 허용" : "확대 금지", on: settings.allowZoom },
      ];
  return (
    <ul className="flex flex-wrap justify-center gap-x-6 gap-y-3">
      {items.map((it) => (
        <li key={it.label} className="flex w-20 flex-col items-center gap-1 text-center">
          <it.icon className={`h-8 w-8 ${it.on ? "text-white" : "text-white/35"}`} strokeWidth={1.75} aria-hidden />
          <span className={`text-xs ${it.on ? "text-white" : "text-white/50 line-through"}`}>{it.label}</span>
        </li>
      ))}
    </ul>
  );
}

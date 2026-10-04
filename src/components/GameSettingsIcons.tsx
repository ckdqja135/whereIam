import type { GameSettings } from "@/lib/game-settings";
import { timeLimitLabel } from "@/lib/game-settings";

// 챌린지/결과 화면에 표시하는 게임 설정 요약
export default function GameSettingsIcons({ settings }: { settings: GameSettings }) {
  const items = [
    { icon: "🇰🇷", label: "대한민국", on: true },
    { icon: "⏱️", label: timeLimitLabel(settings.timeLimit), on: true },
    { icon: "🚶", label: settings.allowMove ? "이동 허용" : "이동 금지", on: settings.allowMove },
    { icon: "↔️", label: settings.allowPan ? "회전 허용" : "회전 금지", on: settings.allowPan },
    { icon: "🔍", label: settings.allowZoom ? "확대 허용" : "확대 금지", on: settings.allowZoom },
  ];
  return (
    <ul className="flex flex-wrap justify-center gap-x-6 gap-y-3">
      {items.map((it) => (
        <li key={it.label} className="flex w-20 flex-col items-center gap-1 text-center">
          <span className={`text-3xl ${it.on ? "" : "opacity-40 grayscale"}`}>{it.icon}</span>
          <span className={`text-xs ${it.on ? "text-white" : "text-white/50 line-through"}`}>{it.label}</span>
        </li>
      ))}
    </ul>
  );
}

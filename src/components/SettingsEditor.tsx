"use client";

import { GameSettings, TIME_LIMIT_OPTIONS } from "@/lib/game-settings";

const MODES = [
  { itemMode: false, emoji: "🚫", title: "노템 모드", desc: "실력만으로 승부" },
  { itemMode: true, emoji: "🎁", title: "아이템 모드", desc: "힌트 + 대결 방해 아이템" },
];

const RULES: { key: "allowMove" | "allowPan" | "allowZoom"; label: string }[] = [
  { key: "allowMove", label: "이동" },
  { key: "allowPan", label: "회전" },
  { key: "allowZoom", label: "확대/축소" },
];

interface SettingsEditorProps {
  settings: GameSettings;
  onChange: (next: GameSettings) => void;
  disabled?: boolean;
}

// 모드 / 제한 시간 / 로드뷰 조작 허용. 혼자 하기 로비와 대결 대기실(방장)에서 같이 쓴다.
export default function SettingsEditor({ settings, onChange, disabled }: SettingsEditorProps) {
  const set = (patch: Partial<GameSettings>) => onChange({ ...settings, ...patch });
  const chip = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
      active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`;

  return (
    <div>
      <p className="text-sm font-semibold text-gray-700">게임 모드</p>
      <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="게임 모드">
        {MODES.map((m) => {
          const selected = (settings.itemMode ?? false) === m.itemMode;
          return (
            <button
              key={m.title}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => set({ itemMode: m.itemMode })}
              className={`rounded-xl border-2 px-3 py-3 text-left transition-colors disabled:cursor-not-allowed ${
                selected ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"
              }`}
            >
              <span className="text-xl">{m.emoji}</span>
              <p className="mt-1 text-sm font-bold text-gray-900">{m.title}</p>
              <p className="text-xs text-gray-500">{m.desc}</p>
            </button>
          );
        })}
      </div>

      <p className="mt-5 text-sm font-semibold text-gray-700">라운드 제한 시간</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {TIME_LIMIT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => set({ timeLimit: opt.value })}
            aria-pressed={settings.timeLimit === opt.value}
            className={chip(settings.timeLimit === opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <p className="mt-5 text-sm font-semibold text-gray-700">로드뷰 조작 허용</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {RULES.map((r) => (
          <button
            key={r.key}
            type="button"
            disabled={disabled}
            onClick={() => set({ [r.key]: !settings[r.key] })}
            aria-pressed={settings[r.key]}
            className={chip(settings[r.key])}
          >
            {settings[r.key] ? "✓ " : "✕ "}
            {r.label}
          </button>
        ))}
      </div>

      {settings.itemMode && (
        <div className="mt-5 space-y-1.5 rounded-lg bg-violet-50 px-3 py-2.5 text-xs leading-relaxed text-violet-800">
          <p>
            💡 <b>힌트</b>(지역·범위·주변 장소): 게임당 <b>최대 3번</b>. 쓰면 그 라운드 점수가 깎여요.
          </p>
          <p>
            ⚔️ <b>방해</b>(먹물·얼음·뒤집기·회전): 친구와 대결할 때만, <b>라운드마다 3번</b>. 감점 없이 상대 화면을 잠깐 방해해요.
          </p>
        </div>
      )}
    </div>
  );
}

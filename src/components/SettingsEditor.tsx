"use client";

import { Ban, Check, CircleCheck, CircleX, Gift, Lightbulb, MapPinned, Swords, X } from "lucide-react";
import { GameSettings, TIME_LIMIT_OPTIONS } from "@/lib/game-settings";
import type { QuizKind } from "@/lib/quiz";
import { QUIZ_QUESTIONS, QUIZ_RULES, QUIZ_TEXT, quizKindOf } from "@/lib/quiz";

const GAME_TYPES = [
  { gameType: "classic" as const, icon: MapPinned, title: "지도에 찍기", desc: "지도에서 위치 찾기" },
  {
    gameType: "quiz" as const,
    icon: QUIZ_TEXT.region.icon,
    title: QUIZ_TEXT.region.title,
    desc: `${QUIZ_RULES.region.seconds}초 안에 지역 고르기`,
  },
  {
    gameType: "station" as const,
    icon: QUIZ_TEXT.station.icon,
    title: QUIZ_TEXT.station.title,
    desc: `${QUIZ_RULES.station.seconds}초 안에 역 고르기`,
  },
];

const MODES = [
  { itemMode: false, icon: Ban, title: "노템 모드", desc: "실력만으로 승부" },
  { itemMode: true, icon: Gift, title: "아이템 모드", desc: "힌트 + 대결 방해 아이템" },
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

// 게임 종류 / 모드 / 제한 시간 / 로드뷰 조작 허용. 혼자 하기 로비와 대결 대기실(방장)에서 같이 쓴다.
export default function SettingsEditor({ settings, onChange, disabled }: SettingsEditorProps) {
  const set = (patch: Partial<GameSettings>) => onChange({ ...settings, ...patch });
  const chip = (active: boolean) =>
    `inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
      active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`;

  const quizKind = quizKindOf(settings.gameType);

  return (
    <div>
      <p className="text-sm font-semibold text-gray-700">게임 종류</p>
      <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="게임 종류">
        {GAME_TYPES.map((g) => {
          const selected = (settings.gameType ?? "classic") === g.gameType;
          return (
            <button
              key={g.gameType}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => set({ gameType: g.gameType })}
              className={`break-keep rounded-xl border-2 px-2.5 py-3 text-left transition-colors disabled:cursor-not-allowed sm:px-3 ${
                selected ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white hover:bg-gray-50"
              }`}
            >
              <g.icon className={`h-6 w-6 ${selected ? "text-indigo-600" : "text-gray-500"}`} aria-hidden />
              <p className="mt-1 text-[13px] font-bold leading-tight text-gray-900 sm:text-sm">{g.title}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-gray-500 sm:text-xs">{g.desc}</p>
            </button>
          );
        })}
      </div>

      {quizKind ? (
        <QuizRules kind={quizKind} />
      ) : (
        <ClassicSettings settings={settings} set={set} chip={chip} disabled={disabled} />
      )}
    </div>
  );
}

// 퀴즈 규칙 안내
function QuizRules({ kind }: { kind: QuizKind }) {
  const { seconds, bonusPerSec } = QUIZ_RULES[kind];
  const { icon: KindIcon, levelLabel } = QUIZ_TEXT[kind];
  return (
    <div className="mt-5 space-y-1.5 rounded-lg bg-indigo-50 px-3 py-2.5 text-xs leading-relaxed text-indigo-900">
      <p className="flex gap-1.5">
        <KindIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {kind === "station" ? (
          <span>
            지하철역 바로 앞 로드뷰를 보고 <b>{seconds}초 안에</b> 4개 중 무슨 역인지 골라요. 이동은 안 되고{" "}
            <b>드래그해서 둘러볼 수</b> 있어요. 한 판 <b>{QUIZ_QUESTIONS}문제</b>.
          </span>
        ) : (
          <span>
            움직이지 않는 로드뷰를 보고 <b>{seconds}초 안에</b> 4개 중 지역을 골라요. 한 판 <b>{QUIZ_QUESTIONS}문제</b>.
          </span>
        )}
      </p>
      <p className="flex gap-1.5">
        <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
        <span>
          정답:{" "}
          <b>
            쉬움({levelLabel.easy}) +1,000 / 어려움({levelLabel.hard}) +1,500
          </b>
          , 빨리 맞힐수록 남은 1초당 +{bonusPerSec}
        </span>
      </p>
      <p className="flex gap-1.5">
        <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden />
        <span>
          오답·시간 초과: <b>-500</b> (총점은 0 아래로 안 내려가요)
        </span>
      </p>
    </div>
  );
}

// 지도에 찍기 전용 설정 (모드 / 제한 시간 / 로드뷰 조작)
function ClassicSettings({
  settings,
  set,
  chip,
  disabled,
}: {
  settings: GameSettings;
  set: (patch: Partial<GameSettings>) => void;
  chip: (active: boolean) => string;
  disabled?: boolean;
}) {
  return (
    <div>
      <p className="mt-5 text-sm font-semibold text-gray-700">게임 모드</p>
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
              <m.icon className={`h-6 w-6 ${selected ? "text-blue-600" : "text-gray-500"}`} aria-hidden />
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
            {settings[r.key] ? <Check className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
            {r.label}
          </button>
        ))}
      </div>

      {settings.itemMode && (
        <div className="mt-5 space-y-1.5 rounded-lg bg-violet-50 px-3 py-2.5 text-xs leading-relaxed text-violet-800">
          <p className="flex gap-1.5">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              <b>힌트</b>(지역·범위·주변 장소): 게임당 <b>최대 3번</b>. 쓰면 그 라운드 점수가 깎여요.
            </span>
          </p>
          <p className="flex gap-1.5">
            <Swords className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              <b>방해</b>(먹물·얼음·뒤집기·회전): 친구와 대결할 때만, <b>라운드마다 3번</b>. 감점 없이 상대 화면을 잠깐 방해해요.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

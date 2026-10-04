"use client";

import { useState } from "react";
import { NICKNAME_MAX, Profile, validateNickname } from "@/lib/profile";
import { randomAvatar } from "@/lib/avatar";
import { GameSettings, TIME_LIMIT_OPTIONS } from "@/lib/game-settings";
import { ROUNDS_PER_GAME } from "@/lib/score";
import AvatarCustomizer from "./avatar/AvatarCustomizer";

interface LobbyScreenProps {
  initialProfile: Profile | null;
  initialSettings: GameSettings;
  sdkReady: boolean;
  sdkError: string | null;
  onStart: (profile: Profile, settings: GameSettings) => void;
}

const RULES: { key: "allowMove" | "allowPan" | "allowZoom"; label: string }[] = [
  { key: "allowMove", label: "이동" },
  { key: "allowPan", label: "회전" },
  { key: "allowZoom", label: "확대/축소" },
];

export default function LobbyScreen({
  initialProfile,
  initialSettings,
  sdkReady,
  sdkError,
  onStart,
}: LobbyScreenProps) {
  const [nickname, setNickname] = useState(initialProfile?.nickname ?? "");
  const [avatar, setAvatar] = useState(() => initialProfile?.avatar ?? randomAvatar());
  const [settings, setSettings] = useState(initialSettings);
  const [touched, setTouched] = useState(false);

  const nicknameError = validateNickname(nickname);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (nicknameError || !sdkReady) return;
    onStart({ nickname: nickname.trim(), avatar }, settings);
  };

  const chip = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
      active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`;

  return (
    <div className="h-screen overflow-y-auto bg-gradient-to-b from-indigo-950 via-gray-900 to-gray-900 px-4 py-8">
      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-8">
        <h1 className="text-center text-2xl font-bold text-gray-900">Where I Am</h1>
        <p className="mt-1 text-center text-sm text-gray-500">로드뷰를 보고 대한민국 어디인지 맞혀보세요</p>

        {/* 캐릭터 */}
        <div className="mt-4">
          <AvatarCustomizer avatar={avatar} onChange={setAvatar} />
        </div>

        {/* 닉네임 */}
        <label className="mt-5 block text-sm font-semibold text-gray-700" htmlFor="nickname">
          닉네임
        </label>
        <input
          id="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onBlur={() => setTouched(true)}
          maxLength={NICKNAME_MAX}
          placeholder="닉네임을 입력하세요"
          autoComplete="off"
          className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />
        {touched && nicknameError && <p className="mt-1 text-xs text-red-600">{nicknameError}</p>}

        {/* 라운드 시간 */}
        <p className="mt-6 text-sm font-semibold text-gray-700">라운드 제한 시간</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TIME_LIMIT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSettings((s) => ({ ...s, timeLimit: opt.value }))}
              aria-pressed={settings.timeLimit === opt.value}
              className={chip(settings.timeLimit === opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 이동/회전/확대 허용 */}
        <p className="mt-5 text-sm font-semibold text-gray-700">로드뷰 조작 허용</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {RULES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setSettings((s) => ({ ...s, [r.key]: !s[r.key] }))}
              aria-pressed={settings[r.key]}
              className={chip(settings[r.key])}
            >
              {settings[r.key] ? "✓ " : "✕ "}
              {r.label}
            </button>
          ))}
        </div>

        <button
          type="submit"
          disabled={!sdkReady}
          className="mt-8 w-full rounded-lg bg-blue-600 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {sdkReady ? `게임 시작 (${ROUNDS_PER_GAME}라운드)` : sdkError ? "카카오맵을 불러오지 못했어요" : "카카오맵 불러오는 중..."}
        </button>
        {sdkError && <p className="mt-2 text-center text-xs text-red-600">{sdkError}</p>}
      </form>
    </div>
  );
}

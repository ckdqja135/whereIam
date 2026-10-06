"use client";

import { useState } from "react";
import { NICKNAME_MAX, Profile, validateNickname } from "@/lib/profile";
import { randomAvatar } from "@/lib/avatar";
import type { GameSettings } from "@/lib/game-settings";
import { ROUNDS_PER_GAME } from "@/lib/score";
import AvatarCustomizer from "./avatar/AvatarCustomizer";
import SettingsEditor from "./SettingsEditor";

interface LobbyScreenProps {
  initialProfile: Profile | null;
  initialSettings: GameSettings;
  sdkReady: boolean;
  sdkError: string | null;
  onStart: (profile: Profile, settings: GameSettings) => void;
  // 친구와 대결: 방 만들기 / 코드로 참가
  onCreateRoom: (profile: Profile, settings: GameSettings) => Promise<void>;
  onJoinRoom: (code: string, profile: Profile) => Promise<void>;
  roomsAvailable: boolean;
}

export default function LobbyScreen({
  initialProfile,
  initialSettings,
  sdkReady,
  sdkError,
  onStart,
  onCreateRoom,
  onJoinRoom,
  roomsAvailable,
}: LobbyScreenProps) {
  const [nickname, setNickname] = useState(initialProfile?.nickname ?? "");
  const [avatar, setAvatar] = useState(() => initialProfile?.avatar ?? randomAvatar());
  const [settings, setSettings] = useState(initialSettings);
  const [touched, setTouched] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [roomBusy, setRoomBusy] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);

  const nicknameError = validateNickname(nickname);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (nicknameError || !sdkReady) return;
    onStart({ nickname: nickname.trim(), avatar }, settings);
  };

  // 닉네임 검사 후 현재 프로필을 돌려준다 (실패하면 null)
  const validProfile = (): Profile | null => {
    setTouched(true);
    if (nicknameError) return null;
    return { nickname: nickname.trim(), avatar };
  };

  const createRoom = async () => {
    const profile = validProfile();
    if (!profile) return;
    setRoomBusy(true);
    setRoomError(null);
    try {
      await onCreateRoom(profile, settings);
    } catch (err) {
      setRoomError(err instanceof Error ? err.message : "방을 만들지 못했어요.");
      setRoomBusy(false);
    }
  };

  const joinRoom = async () => {
    const profile = validProfile();
    const code = roomCode.trim().toUpperCase();
    if (!profile) return;
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setRoomError("방 코드 6자리를 입력해주세요.");
      return;
    }
    setRoomBusy(true);
    setRoomError(null);
    try {
      await onJoinRoom(code, profile);
    } catch (err) {
      setRoomError(err instanceof Error ? err.message : "방에 참가하지 못했어요.");
      setRoomBusy(false);
    }
  };

  return (
    <div className="h-dvh overflow-y-auto bg-gradient-to-b from-indigo-950 via-gray-900 to-gray-900 px-4 py-8">
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

        <div className="mt-6">
          <SettingsEditor settings={settings} onChange={setSettings} />
        </div>

        <button
          type="submit"
          disabled={!sdkReady}
          className="mt-6 w-full rounded-lg bg-blue-600 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {sdkReady ? `${settings.itemMode ? "아이템" : "노템"} 모드로 시작 (${ROUNDS_PER_GAME}라운드)` : sdkError ? "카카오맵을 불러오지 못했어요" : "카카오맵 불러오는 중..."}
        </button>
        {sdkError && <p className="mt-2 text-center text-xs text-red-600">{sdkError}</p>}

        {/* 친구와 실시간 대결 */}
        {roomsAvailable && (
          <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
            <p className="text-sm font-semibold text-indigo-900">👥 친구와 실시간 대결 (2~4인)</p>
            <p className="mt-1 text-xs text-indigo-700">같은 5문제를 같은 설정으로 동시에 풀어요. 위 설정이 방 설정이 돼요.</p>
            <button
              type="button"
              onClick={createRoom}
              disabled={!sdkReady || roomBusy}
              className="mt-3 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
            >
              {roomBusy ? "방 만드는 중..." : "대결 방 만들기"}
            </button>
            <div className="mt-2 flex gap-2">
              <input
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="방 코드"
                aria-label="방 코드"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-center font-mono text-base uppercase sm:text-sm tracking-widest text-gray-900 outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={joinRoom}
                disabled={!sdkReady || roomBusy}
                className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100 disabled:opacity-50"
              >
                참가
              </button>
            </div>
            {roomError && <p className="mt-2 text-xs text-red-600">{roomError}</p>}
          </div>
        )}
      </form>
    </div>
  );
}

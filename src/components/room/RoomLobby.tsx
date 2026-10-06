"use client";

import { useState } from "react";
import { roomActions } from "@/lib/api";
import { ROOM_MAX_PLAYERS, ROOM_MIN_PLAYERS, RoomState } from "@/lib/room-types";
import type { ChallengeLocation } from "@/lib/api-types";
import type { GameSettings } from "@/lib/game-settings";
import { normalizeAvatar } from "@/lib/avatar";
import { getRandomRoadviewLocation } from "@/lib/random-location";
import { ROUNDS_PER_GAME } from "@/lib/score";
import AvatarPin from "../avatar/AvatarPin";
import GameSettingsIcons from "../GameSettingsIcons";
import SettingsEditor from "../SettingsEditor";

interface RoomLobbyProps {
  code: string;
  token: string;
  state: RoomState; // status === "lobby"
  sdkReady: boolean;
  onState: (s: RoomState) => void;
  onLeave: () => void;
}

// 대기실: 참가자 목록, 준비, 방장 설정/시작
export default function RoomLobby({ code, token, state, sdkReady, onState, onLeave }: RoomLobbyProps) {
  const me = state.players.find((p) => p.id === state.me)!;
  const isHost = state.hostId === state.me;
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // 내보내기 확인 중인 참가자 (한 번 더 눌러야 확정)
  const [kickTarget, setKickTarget] = useState<string | null>(null);

  const players = state.players.filter((p) => !p.left);
  const others = players.filter((p) => p.id !== state.hostId);
  const allReady = others.every((p) => p.ready);
  const canStart = players.length >= ROOM_MIN_PLAYERS && allReady;
  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/room/${code}` : "";

  const run = async (action: () => Promise<RoomState>) => {
    setBusy(true);
    setError(null);
    try {
      onState(await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청에 실패했어요.");
    } finally {
      setBusy(false);
    }
  };

  const changeSettings = (settings: GameSettings) => run(() => roomActions.settings(code, token, { settings }));

  // 방장 브라우저가 문제 5개를 뽑아서 서버에 올린다 (카카오 로드뷰 위치는 브라우저에서만 뽑을 수 있음)
  const start = async () => {
    setError(null);
    setPreparing(0);
    try {
      const locations: ChallengeLocation[] = [];
      for (let i = 0; i < ROUNDS_PER_GAME; i++) {
        locations.push(await getRandomRoadviewLocation());
        setPreparing(i + 1);
      }
      onState(await roomActions.start(code, token, { locations }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "게임을 시작하지 못했어요.");
    } finally {
      setPreparing(null);
    }
  };

  const kick = (playerId: string) => {
    setKickTarget(null);
    run(() => roomActions.kick(code, token, { playerId }));
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 직접 선택해서 복사
    }
  };

  return (
    <div className="h-dvh overflow-y-auto bg-gradient-to-b from-indigo-950 via-gray-900 to-gray-900 px-4 py-8">
      <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-8">
        <p className="text-center text-sm text-gray-500">대결 대기실</p>
        <p className="mt-1 text-center font-mono text-4xl font-black tracking-[0.3em] text-gray-900">{code}</p>

        <div className="mt-4 flex gap-2">
          <input
            readOnly
            value={inviteUrl}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="초대 링크"
            className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-base text-gray-700 sm:text-xs"
          />
          <button onClick={copyInvite} className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">
            {copied ? "복사됨!" : "초대 링크 복사"}
          </button>
        </div>

        {/* 참가자 */}
        <p className="mt-6 text-sm font-semibold text-gray-700">
          참가자 {players.length}/{ROOM_MAX_PLAYERS}
        </p>
        <ul className="mt-2 grid grid-cols-2 gap-2">
          {Array.from({ length: ROOM_MAX_PLAYERS }).map((_, i) => {
            const p = players[i];
            if (!p) {
              return (
                <li key={`empty-${i}`} className="flex h-16 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-xs text-gray-400">
                  빈 자리
                </li>
              );
            }
            const host = p.id === state.hostId;
            return (
              <li
                key={p.id}
                className={`flex h-16 items-center gap-2 rounded-xl border-2 px-2 ${
                  p.id === state.me ? "border-blue-400 bg-blue-50" : "border-gray-100 bg-gray-50"
                } ${p.connected ? "" : "opacity-50"}`}
              >
                <AvatarPin avatar={normalizeAvatar(p.avatar)} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900">
                    {host && "👑 "}
                    {p.nickname}
                  </p>
                  <p className={`text-xs ${host || p.ready ? "text-green-600" : "text-gray-400"}`}>
                    {!p.connected ? "연결 끊김" : host ? "방장" : p.ready ? "준비 완료" : "준비 중"}
                  </p>
                </div>
                {/* 방장만: 다른 참가자 내보내기 (두 번 눌러 확정) */}
                {isHost && !host && (
                  kickTarget === p.id ? (
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        onClick={() => kick(p.id)}
                        disabled={busy}
                        className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-red-700"
                      >
                        내보내기
                      </button>
                      <button onClick={() => setKickTarget(null)} className="rounded-md px-2 py-0.5 text-[11px] text-gray-500 hover:bg-gray-200">
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setKickTarget(p.id)}
                      aria-label={`${p.nickname} 내보내기`}
                      title="내보내기"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      ✕
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ul>

        {/* 설정 */}
        <div className="mt-6">
          {isHost ? (
            <SettingsEditor settings={state.settings} onChange={changeSettings} disabled={busy || preparing !== null} />
          ) : (
            <div className="rounded-xl bg-gray-900 px-3 py-4">
              <GameSettingsIcons settings={state.settings} />
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}

        {/* 액션 */}
        <div className="mt-6 flex gap-3">
          <button onClick={onLeave} className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-200">
            나가기
          </button>
          {isHost ? (
            <button
              onClick={start}
              disabled={!canStart || !sdkReady || preparing !== null}
              className="flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {preparing !== null
                ? `문제 준비 중... (${preparing}/${ROUNDS_PER_GAME})`
                : players.length < ROOM_MIN_PLAYERS
                  ? "친구를 기다리는 중"
                  : !allReady
                    ? "모두 준비하면 시작할 수 있어요"
                    : "게임 시작"}
            </button>
          ) : (
            <button
              onClick={() => run(() => roomActions.ready(code, token, { ready: !me.ready }))}
              disabled={busy}
              className={`flex-1 rounded-lg py-3 font-semibold text-white disabled:opacity-60 ${
                me.ready ? "bg-gray-500 hover:bg-gray-600" : "bg-green-600 hover:bg-green-700"
              }`}
            >
              {me.ready ? "준비 취소" : "준비"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

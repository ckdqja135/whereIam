"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/lib/use-hydrated";
import { useKakaoSdk } from "@/lib/use-kakao-sdk";
import { useBlockDevtools } from "@/lib/use-anti-cheat";
import { joinRoom, roomActions } from "@/lib/api";
import { randomAvatar } from "@/lib/avatar";
import { loadProfile, NICKNAME_MAX, saveProfile, validateNickname } from "@/lib/profile";
import { clearRoomCredentials, loadRoomCredentials, RoomCredentials, saveRoomCredentials, useRoomState } from "@/lib/use-room";
import AvatarCustomizer from "../avatar/AvatarCustomizer";
import RoomLobby from "./RoomLobby";
import RoomRound from "./RoomRound";
import RoomReveal from "./RoomReveal";
import RoomFinished from "./RoomFinished";
import RoomChat from "./RoomChat";

// /room/[code]: 참가 → 대기실 → 라운드 진행/결과 → 최종 순위
export default function RoomController({ code }: { code: string }) {
  const hydrated = useHydrated();
  if (!hydrated) return <Spinner />;
  return <RoomGame code={code.toUpperCase()} />;
}

function Spinner({ text }: { text?: string }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-gray-900">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-600 border-t-blue-500" />
      {text && <p className="text-sm text-white/70">{text}</p>}
    </div>
  );
}

function RoomGame({ code }: { code: string }) {
  const [creds, setCreds] = useState<RoomCredentials | null>(() => loadRoomCredentials(code));
  if (!creds) return <JoinScreen code={code} onJoined={setCreds} />;
  return <RoomSession code={code} creds={creds} onReset={() => setCreds(null)} />;
}

function RoomSession({ code, creds, onReset }: { code: string; creds: RoomCredentials; onReset: () => void }) {
  const router = useRouter();
  const sdk = useKakaoSdk();
  const { state, applyState, fatal, offline, clockOffset } = useRoomState(code, creds.token, null);
  // 대결 방에 있는 동안(대기실·라운드·결과 모두) 개발자 도구 단축키와 우클릭을 막는다
  useBlockDevtools(true);

  const leave = () => {
    roomActions.leave(code, creds.token).catch(() => {});
    clearRoomCredentials(code);
  };

  if (fatal) {
    const kicked = fatal.includes("내보냈");
    return (
      <div className="flex h-dvh items-center justify-center bg-gray-900 px-4">
        <div className="rounded-2xl bg-white p-8 text-center shadow-lg">
          <p className="text-lg font-bold text-gray-900">{kicked ? "방에서 나가게 됐어요" : "대결 방에 들어갈 수 없어요"}</p>
          <p className="mt-2 text-sm text-gray-600">{fatal}</p>
          <div className="mt-6 flex justify-center gap-3">
            {!kicked && (
            <button
              onClick={() => {
                clearRoomCredentials(code);
                onReset();
              }}
              className="rounded-lg bg-gray-100 px-5 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-200"
            >
              다시 참가
            </button>
            )}
            <Link
              href="/"
              onClick={() => clearRoomCredentials(code)} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              메인으로
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!state) return <Spinner text="대결 방에 연결하는 중..." />;
  if (state.status !== "lobby" && state.status !== "finished" && !sdk.ready) return <Spinner text="카카오맵 불러오는 중..." />;

  const banner = offline && (
    <div className="fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white shadow-lg">
      연결이 불안정해요. 다시 연결하는 중...
    </div>
  );

  let screen: React.ReactNode;
  if (state.status === "lobby") {
    screen = (
      <RoomLobby
        code={code}
        token={creds.token}
        state={state}
        sdkReady={sdk.ready}
        onState={applyState}
        onLeave={() => {
          leave();
          router.push("/");
        }}
      />
    );
  } else if (state.status === "playing") {
    screen = (
      <RoomRound key={state.round} code={code} token={creds.token} state={state} clockOffset={clockOffset} onState={applyState} />
    );
  } else if (state.status === "reveal") {
    screen = (
      <RoomReveal key={state.round} code={code} token={creds.token} state={state} clockOffset={clockOffset} onState={applyState} />
    );
  } else {
    screen = <RoomFinished code={code} token={creds.token} state={state} onState={applyState} onLeave={leave} />;
  }

  return (
    <>
      {banner}
      {screen}
      {/* 채팅은 화면이 바뀌어도 유지 (대기실에서는 열린 채로 시작) */}
      <RoomChat code={code} token={creds.token} state={state} onState={applyState} defaultOpen={state.status === "lobby"} />
    </>
  );
}

// 초대 링크로 들어온 사람: 닉네임/캐릭터 정하고 참가
function JoinScreen({ code, onJoined }: { code: string; onJoined: (c: RoomCredentials) => void }) {
  const [saved] = useState(loadProfile);
  const [nickname, setNickname] = useState(saved?.nickname ?? "");
  const [avatar, setAvatar] = useState(() => saved?.avatar ?? randomAvatar());
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nicknameError = validateNickname(nickname);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (nicknameError) return;
    const profile = { nickname: nickname.trim(), avatar };
    saveProfile(profile);
    setBusy(true);
    setError(null);
    try {
      const res = await joinRoom(code, { player: profile });
      const creds = { playerId: res.playerId, token: res.token };
      saveRoomCredentials(res.code, creds);
      onJoined(creds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "방에 참가하지 못했어요.");
      setBusy(false);
    }
  };

  return (
    <div className="h-dvh overflow-y-auto bg-gradient-to-b from-indigo-950 via-[#241a46] to-gray-900 px-4 py-10 text-white">
      <form onSubmit={submit} className="mx-auto flex max-w-xs flex-col items-center">
        <h1 className="text-3xl font-extrabold italic">대결 초대!</h1>
        <p className="mt-2 text-sm text-white/70">
          방 코드 <span className="font-mono font-bold tracking-widest text-white">{code}</span>
        </p>

        <div className="mt-6">
          <AvatarCustomizer avatar={avatar} onChange={setAvatar} dark />
        </div>

        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onBlur={() => setTouched(true)}
          maxLength={NICKNAME_MAX}
          placeholder="닉네임"
          aria-label="닉네임"
          autoComplete="off"
          className="mt-5 w-full rounded-lg border border-white/30 bg-white/10 px-4 py-2.5 text-center text-white placeholder-white/50 outline-none focus:border-white/70"
        />
        {touched && nicknameError && <p className="mt-1 text-xs text-red-300">{nicknameError}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-full bg-gradient-to-b from-lime-400 to-green-600 py-3 font-bold italic text-white shadow-lg transition-transform hover:scale-[1.02] disabled:from-gray-500 disabled:to-gray-600"
        >
          {busy ? "참가하는 중..." : "참가하기"}
        </button>
        {error && <p className="mt-3 text-center text-sm text-red-300">{error}</p>}

        <Link href="/" className="mt-6 text-xs text-white/50 underline">
          메인으로
        </Link>
      </form>
    </div>
  );
}

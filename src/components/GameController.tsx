"use client";

import { useState } from "react";
import { useHydrated } from "@/lib/use-hydrated";
import { useKakaoSdk } from "@/lib/use-kakao-sdk";
import { loadProfile, Profile, saveProfile } from "@/lib/profile";
import { GameSettings, loadSettings, saveSettings } from "@/lib/game-settings";
import type { RoundResult } from "@/lib/game";
import LobbyScreen from "./LobbyScreen";
import GameSession from "./GameSession";
import ResultScreen from "./ResultScreen";
import ChallengeShare from "./ChallengeShare";

type Screen = "lobby" | "playing" | "finished";

// 메인(혼자 하기): 로비 → 5라운드 → 결과 (+ 챌린지 링크 만들기)
export default function GameController() {
  const hydrated = useHydrated();
  if (!hydrated) return <div className="h-screen bg-gray-900" />;
  return <HomeGame />;
}

function HomeGame() {
  const sdk = useKakaoSdk();
  const [screen, setScreen] = useState<Screen>("lobby");
  // 저장된 프로필/설정 (브라우저에서만 렌더링되므로 바로 읽을 수 있다)
  const [profile, setProfile] = useState<Profile | null>(loadProfile);
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const [results, setResults] = useState<RoundResult[]>([]);
  // 같은 설정으로 다시 하기 시 GameSession을 새로 마운트하기 위한 키
  const [gameKey, setGameKey] = useState(0);

  const startGame = () => {
    setResults([]);
    setGameKey((k) => k + 1);
    setScreen("playing");
  };

  if (screen === "playing" && profile) {
    return (
      <GameSession
        key={gameKey}
        profile={profile}
        settings={settings}
        onFinish={(r) => {
          setResults(r);
          setScreen("finished");
        }}
      />
    );
  }

  if (screen === "finished" && profile) {
    return (
      <ResultScreen
        profile={profile}
        results={results}
        actions={
          <>
            <button
              onClick={() => setScreen("lobby")}
              className="flex-1 rounded-lg bg-gray-100 py-3 font-semibold text-gray-800 transition-colors hover:bg-gray-200"
            >
              메인으로
            </button>
            <button
              onClick={startGame}
              className="flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
            >
              다시 하기
            </button>
          </>
        }
      >
        <ChallengeShare profile={profile} settings={settings} results={results} />
      </ResultScreen>
    );
  }

  return (
    <LobbyScreen
      initialProfile={profile}
      initialSettings={settings}
      sdkReady={sdk.ready}
      sdkError={sdk.error}
      onStart={(nextProfile, nextSettings) => {
        saveProfile(nextProfile);
        saveSettings(nextSettings);
        setProfile(nextProfile);
        setSettings(nextSettings);
        startGame();
      }}
    />
  );
}

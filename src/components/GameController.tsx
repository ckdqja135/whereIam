"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadKakaoSDK } from "@/lib/kakao-loader";
import { getRandomRoadviewLocation, RandomLocation } from "@/lib/random-location";
import { calculateDistance, DistanceResult } from "@/lib/haversine";
import RoadviewPane, { RoadviewHandle } from "./RoadviewPane";
import MapPane from "./MapPane";

type GamePhase = "init" | "loading" | "playing" | "submitted" | "error";
type ViewMode = "roadview" | "map";

const ROUND_TIME = 600;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function GameController() {
  const [phase, setPhase] = useState<GamePhase>("init");
  const [view, setView] = useState<ViewMode>("roadview");
  const [sdkReady, setSdkReady] = useState(false);
  const [round, setRound] = useState(1);
  const [answer, setAnswer] = useState<RandomLocation | null>(null);
  const [guessCoord, setGuessCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<DistanceResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(ROUND_TIME);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roadviewRef = useRef<RoadviewHandle>(null);

  // SDK 로딩
  useEffect(() => {
    loadKakaoSDK()
      .then(() => setSdkReady(true))
      .catch((err) => {
        setErrorMsg(err.message);
        setPhase("error");
      });
  }, []);

  // 첫 라운드
  useEffect(() => {
    if (sdkReady && phase === "init") startNewRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkReady]);

  // 타이머
  useEffect(() => {
    if (phase !== "playing") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  // 타이머 만료 → 자동 제출
  useEffect(() => {
    if (remainingSeconds === 0 && phase === "playing") submitGuess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds, phase]);

  const startNewRound = useCallback(async () => {
    setPhase("loading");
    setView("roadview");
    setGuessCoord(null);
    setDistance(null);
    setErrorMsg(null);
    setRemainingSeconds(ROUND_TIME);

    try {
      const location = await getRandomRoadviewLocation();
      setAnswer(location);
      setPhase("playing");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "위치를 불러오는 데 실패했습니다.");
      setPhase("error");
    }
  }, []);

  const submitGuess = useCallback(() => {
    if (!answer) return;
    const lat = guessCoord?.lat ?? 37.5665;
    const lng = guessCoord?.lng ?? 126.978;
    setGuessCoord({ lat, lng });
    setDistance(calculateDistance(answer.lat, answer.lng, lat, lng));
    setPhase("submitted");
    setView("map");
  }, [answer, guessCoord]);

  const handleActualPosition = useCallback((lat: number, lng: number) => {
    setAnswer((prev) => prev ? { ...prev, lat, lng } : prev);
  }, []);

  const handleMapClick = (lat: number, lng: number) => {
    if (phase !== "playing") return;
    setGuessCoord({ lat, lng });
  };

  const handleNextRound = () => {
    setRound((prev) => prev + 1);
    startNewRound();
  };

  const isUrgent = remainingSeconds <= 30;

  // --- 에러/초기화 화면 ---
  if (phase === "error") {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="rounded-lg bg-white p-8 text-center shadow-lg">
          <p className="mb-4 text-lg font-bold text-red-600">오류 발생</p>
          <p className="mb-6 text-sm text-gray-600">{errorMsg}</p>
          <button
            onClick={() => { setPhase("init"); if (sdkReady) startNewRound(); }}
            className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (phase === "init") {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-gray-600 border-t-blue-500" />
          <p className="text-lg text-white">카카오맵 SDK 로딩 중...</p>
        </div>
      </div>
    );
  }

  // --- 게임 화면 (풀스크린 싱글 뷰) ---
  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* 로드뷰 레이어 */}
      <div className={`absolute inset-0 ${view === "roadview" ? "z-0" : "-z-10"}`}>
        <RoadviewPane
          ref={roadviewRef}
          panoId={answer?.panoId ?? null}
          lat={answer?.lat ?? 37.5665}
          lng={answer?.lng ?? 126.978}
          isLoading={phase === "loading"}
          onActualPosition={handleActualPosition}
        />
      </div>

      {/* 지도 레이어 */}
      <div className={`absolute inset-0 ${view === "map" ? "z-0" : "-z-10"}`}>
        {sdkReady && answer && (
          <MapPane
            answerLat={answer.lat}
            answerLng={answer.lng}
            guessLat={guessCoord?.lat ?? null}
            guessLng={guessCoord?.lng ?? null}
            distanceFormatted={distance?.formatted ?? null}
            isSubmitted={phase === "submitted"}
            onClickPosition={handleMapClick}
          />
        )}
      </div>

      {/* ===== 오버레이 UI ===== */}

      {/* 상단: 라운드 + 타이머 */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-center justify-between p-4">
        <div className="pointer-events-auto rounded-lg bg-black/70 px-4 py-2 text-sm font-bold text-white">
          라운드 {round}
        </div>
        {phase === "playing" && (
          <div
            className={`pointer-events-auto rounded-lg px-4 py-2 text-sm font-bold tabular-nums ${
              isUrgent ? "animate-pulse bg-red-600 text-white" : "bg-black/70 text-white"
            }`}
          >
            {formatTime(remainingSeconds)}
          </div>
        )}
      </div>

      {/* 하단: 액션 버튼들 */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-3 p-4">
        {/* 제출 결과 */}
        {phase === "submitted" && distance && (
          <div className="pointer-events-auto rounded-xl bg-white px-6 py-4 text-center shadow-lg">
            <p className="text-3xl font-bold text-blue-600">{distance.formatted}</p>
            <p className="mt-1 text-sm text-gray-500">정답과의 거리</p>
          </div>
        )}

        {/* 지도에서 위치 안내 */}
        {phase === "playing" && view === "map" && !guessCoord && (
          <div className="pointer-events-none rounded-full bg-black/60 px-4 py-2 text-xs text-white">
            지도를 클릭하여 위치를 선택하세요
          </div>
        )}

        {/* 버튼 그룹 */}
        <div className="pointer-events-auto flex gap-3">
          {phase === "playing" && (
            <>
              {/* 뷰 전환 */}
              {view === "roadview" ? (
                <button
                  onClick={() => setView("map")}
                  className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-gray-800 shadow-lg transition-colors hover:bg-gray-100"
                >
                  지도 보기
                </button>
              ) : (
                <button
                  onClick={() => setView("roadview")}
                  className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-gray-800 shadow-lg transition-colors hover:bg-gray-100"
                >
                  로드뷰 보기
                </button>
              )}

              {/* 원래 위치로 */}
              {view === "roadview" && (
                <button
                  onClick={() => roadviewRef.current?.resetPosition()}
                  className="rounded-lg bg-white/90 px-5 py-3 text-sm font-semibold text-gray-800 shadow-lg transition-colors hover:bg-gray-100"
                >
                  원래 위치로
                </button>
              )}

              {/* 제출 */}
              {view === "map" && (
                <button
                  onClick={submitGuess}
                  disabled={!guessCoord}
                  className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  {guessCoord ? "정답 제출" : "위치를 선택하세요"}
                </button>
              )}
            </>
          )}

          {phase === "submitted" && (
            <button
              onClick={handleNextRound}
              className="rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-green-700"
            >
              다음 라운드 &rarr;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

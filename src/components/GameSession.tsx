"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRandomRoadviewLocation } from "@/lib/random-location";
import { calculateDistance, DistanceResult } from "@/lib/haversine";
import { calculateScore, ROUNDS_PER_GAME } from "@/lib/score";
import { getAvatarPin } from "@/lib/avatar-pin";
import { formatAddress, getAddress, AddressResult } from "@/lib/address";
import type { Profile } from "@/lib/profile";
import type { GameSettings } from "@/lib/game-settings";
import type { ChallengeLocation } from "@/lib/api-types";
import type { RoundResult } from "@/lib/game";
import { ItemId, itemDef, roundPenalty } from "@/lib/items";
import { useRoundItems } from "@/lib/use-round-items";
import { useAntiCheat } from "@/lib/use-anti-cheat";
import { HintPanel, ItemPanel } from "./ItemPanel";
import RoadviewPane, { RoadviewHandle } from "./RoadviewPane";
import MapPane from "./MapPane";
import AvatarPin from "./avatar/AvatarPin";

type RoundPhase = "loading" | "playing" | "submitted" | "error";
type ViewMode = "roadview" | "map";

interface GameSessionProps {
  profile: Profile;
  settings: GameSettings;
  // 챌린지처럼 정해진 위치로 플레이할 때. 없으면 라운드마다 랜덤 출제
  locations?: ChallengeLocation[];
  onFinish: (results: RoundResult[]) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// 카카오 SDK가 로드된 뒤에만 렌더링해야 한다.
export default function GameSession({ profile, settings, locations, onFinish }: GameSessionProps) {
  const totalRounds = locations?.length ?? ROUNDS_PER_GAME;
  const hasTimer = settings.timeLimit > 0;

  const [phase, setPhase] = useState<RoundPhase>("loading");
  const [view, setView] = useState<ViewMode>("roadview");
  const [round, setRound] = useState(1);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [answer, setAnswer] = useState<ChallengeLocation | null>(null);
  const [guessCoord, setGuessCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<DistanceResult | null>(null);
  const [roundScore, setRoundScore] = useState(0);
  const [roundAddress, setRoundAddress] = useState<AddressResult | null | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(settings.timeLimit);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roadviewRef = useRef<RoadviewHandle>(null);
  // 주소 응답이 늦게 와서 다음 라운드 화면에 잘못 뜨지 않도록 현재 라운드를 기억한다
  const roundRef = useRef(round);
  useEffect(() => {
    roundRef.current = round;
  }, [round]);

  const pinSrc = useMemo(() => getAvatarPin(profile.avatar), [profile.avatar]);
  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  // 아이템: 지난 라운드까지 쓴 개수 + 이번 라운드 상태
  const items = useRoundItems(settings.itemMode ?? false, results.reduce((sum, r) => sum + r.items.length, 0));
  const { roundItems, reset: resetItems } = items;

  const startRound = useCallback(
    async (roundNumber: number) => {
      setPhase("loading");
      setView("roadview");
      setGuessCoord(null);
      setDistance(null);
      setRoundScore(0);
      setRoundAddress(undefined);
      resetItems();
      setErrorMsg(null);
      setRemainingSeconds(settings.timeLimit);

      try {
        const location = locations ? locations[roundNumber - 1] : await getRandomRoadviewLocation();
        setAnswer(location);
        setPhase("playing");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "위치를 불러오는 데 실패했습니다.");
        setPhase("error");
      }
    },
    [locations, settings.timeLimit, resetItems]
  );

  // 첫 라운드
  useEffect(() => {
    startRound(1);
  }, [startRound]);

  // 타이머
  useEffect(() => {
    if (phase !== "playing" || !hasTimer) {
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
  }, [phase, hasTimer]);

  // 타이머 만료 → 자동 제출 (위치를 안 찍었으면 0점)
  useEffect(() => {
    if (hasTimer && remainingSeconds === 0 && phase === "playing") submitGuess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds, phase, hasTimer]);

  const submitGuess = useCallback(() => {
    if (!answer) return;
    const dist = guessCoord
      ? calculateDistance(answer.lat, answer.lng, guessCoord.lat, guessCoord.lng)
      : null;
    // 아이템을 쓴 만큼 감점 (0점 아래로는 내려가지 않음, 서버와 같은 규칙)
    const penalty = roundPenalty(roundItems);
    const score = dist ? Math.max(0, calculateScore(dist.km) - penalty) : 0;

    setDistance(dist);
    setRoundScore(score);
    setResults((prev) => [...prev, { answer, guess: guessCoord, distance: dist, score, items: roundItems, penalty }]);
    setPhase("submitted");
    setView("map");

    // 정답 위치 주소는 비동기로 받아서 이번 라운드 결과에 채운다
    const roundIndex = round - 1;
    getAddress(answer.lat, answer.lng).then((address) => {
      if (roundRef.current === roundIndex + 1) setRoundAddress(address);
      setResults((prev) => prev.map((r, i) => (i === roundIndex ? { ...r, address } : r)));
    });
  }, [answer, guessCoord, round, roundItems]);

  // 라운드 진행 중 개발자 도구 단축키/우클릭 막기
  useAntiCheat(phase === "playing");

  const applyItem = async (id: ItemId) => {
    if (!answer || phase !== "playing") return;
    const showMap = await items.apply(id, answer);
    if (showMap) setView("map");
  };

  // 로드뷰가 실제로 열린 파노라마 좌표로 정답을 보정한다.
  // 챌린지 위치는 이미 보정된 좌표로 저장되므로 서버 채점과 일치한다.
  const handleActualPosition = useCallback((lat: number, lng: number) => {
    setAnswer((prev) => (prev ? { ...prev, lat, lng } : prev));
  }, []);

  const handleMapClick = (lat: number, lng: number) => {
    if (phase !== "playing") return;
    setGuessCoord({ lat, lng });
  };

  const isLastRound = round >= totalRounds;

  const handleNextRound = () => {
    if (isLastRound) {
      onFinish(results);
      return;
    }
    const next = round + 1;
    setRound(next);
    startRound(next);
  };

  const isUrgent = hasTimer && remainingSeconds <= 30;

  if (phase === "error") {
    return (
      <div className="flex h-dvh items-center justify-center bg-gray-900">
        <div className="rounded-lg bg-white p-8 text-center shadow-lg">
          <p className="mb-4 text-lg font-bold text-red-600">오류 발생</p>
          <p className="mb-6 text-sm text-gray-600">{errorMsg}</p>
          <button
            onClick={() => startRound(round)}
            className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-dvh w-screen overflow-hidden">
      {/* 로드뷰 레이어 */}
      <div className={`absolute inset-0 ${view === "roadview" ? "z-0" : "-z-10"}`}>
        <RoadviewPane
          ref={roadviewRef}
          panoId={answer?.panoId ?? null}
          lat={answer?.lat ?? 37.5665}
          lng={answer?.lng ?? 126.978}
          isLoading={phase === "loading"}
          allowMove={settings.allowMove}
          allowPan={settings.allowPan}
          allowZoom={settings.allowZoom}
          onActualPosition={handleActualPosition}
        />
      </div>

      {/* 지도 레이어 */}
      <div className={`absolute inset-0 ${view === "map" ? "z-0" : "-z-10"}`}>
        {answer && (
          <MapPane
            answerLat={answer.lat}
            answerLng={answer.lng}
            guessLat={guessCoord?.lat ?? null}
            guessLng={guessCoord?.lng ?? null}
            distanceFormatted={distance?.formatted ?? null}
            isSubmitted={phase === "submitted"}
            pinSrc={pinSrc}
            hintCircle={items.hints.circle}
            onClickPosition={handleMapClick}
          />
        )}
      </div>

      {/* ===== 오버레이 UI ===== */}

      {/* 상단: 플레이어 + 라운드/점수 + 타이머 */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between gap-2 p-4">
        <div className="flex max-w-[16rem] flex-col items-start gap-2">
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg bg-black/70 py-1.5 pl-1.5 pr-4 text-sm font-bold text-white">
            <AvatarPin avatar={profile.avatar} size={32} />
            <span className="max-w-[8rem] truncate">{profile.nickname}</span>
          </div>

          {/* 아이템 (게임 전체 3회, 사용하면 이번 라운드 점수에서 감점) */}
          {phase === "playing" && settings.itemMode && (
            <ItemPanel
              itemsLeft={items.itemsLeft}
              roundItems={roundItems}
              busy={items.busy}
              message={items.message}
              onUse={applyItem}
            />
          )}
          {phase === "playing" && <HintPanel hints={items.hints} />}
        </div>

        <div className="flex items-center gap-2">
          <div className="pointer-events-auto rounded-lg bg-black/70 px-4 py-2 text-sm font-bold text-white">
            라운드 {round}/{totalRounds}
            <span className="ml-3 tabular-nums text-yellow-300">{totalScore.toLocaleString()}점</span>
          </div>
          {phase === "playing" && hasTimer && (
            <div
              className={`pointer-events-auto rounded-lg px-4 py-2 text-sm font-bold tabular-nums ${
                isUrgent ? "animate-pulse bg-red-600 text-white" : "bg-black/70 text-white"
              }`}
            >
              {formatTime(remainingSeconds)}
            </div>
          )}
        </div>
      </div>

      {/* 하단: 액션 버튼들 */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* 제출 결과 */}
        {phase === "submitted" && (
          <div className="pointer-events-auto min-w-64 rounded-xl bg-white px-6 py-4 text-center shadow-lg">
            <p className="text-3xl font-bold tabular-nums text-blue-600">
              {roundScore.toLocaleString()}점
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {distance ? `정답과의 거리 ${distance.formatted}` : "시간 초과 - 위치를 선택하지 않았어요"}
            </p>
            {roundItems.length > 0 && (
              <p className="mt-1 text-xs font-semibold text-red-500">
                아이템 {roundItems.map((id) => itemDef(id).emoji).join(" ")} 사용 -{roundPenalty(roundItems).toLocaleString()}점
              </p>
            )}
            <p className="mt-2 max-w-xs text-sm font-medium text-gray-800">
              📍 {roundAddress === undefined ? "주소 확인 중..." : formatAddress(roundAddress) ?? "주소 정보 없음"}
            </p>
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

              {/* 원래 위치로 (이동 허용일 때만 의미 있음) */}
              {view === "roadview" && settings.allowMove && (
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
              {isLastRound ? "최종 결과 보기" : "다음 라운드"} &rarr;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

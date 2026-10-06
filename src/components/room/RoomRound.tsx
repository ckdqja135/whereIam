"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { roomActions } from "@/lib/api";
import type { RoomState } from "@/lib/room-types";
import { normalizeAvatar } from "@/lib/avatar";
import { getAvatarPin } from "@/lib/avatar-pin";
import type { ItemId } from "@/lib/items";
import { useRoundItems } from "@/lib/use-round-items";
import RoadviewPane, { RoadviewHandle } from "../RoadviewPane";
import MapPane from "../MapPane";
import AvatarPin from "../avatar/AvatarPin";
import { HintPanel, ItemPanel } from "../ItemPanel";

interface RoomRoundProps {
  code: string;
  token: string;
  state: RoomState; // status === "playing"
  clockOffset: number;
  onState: (s: RoomState) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// 실시간 대결의 한 라운드. 라운드가 바뀌면 key 로 새로 마운트된다.
export default function RoomRound({ code, token, state, clockOffset, onState }: RoomRoundProps) {
  const me = state.players.find((p) => p.id === state.me)!;
  const location = state.location!;
  const itemMode = state.settings.itemMode ?? false;

  const [view, setView] = useState<"roadview" | "map">("roadview");
  // 로드뷰가 실제로 열린 좌표 (정답 보정용, 힌트 계산에도 사용)
  const [answer, setAnswer] = useState({ lat: location.lat, lng: location.lng });
  const [guess, setGuess] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const roadviewRef = useRef<RoadviewHandle>(null);
  const reportedRef = useRef(false);
  const autoSubmittedRef = useRef(false);

  const items = useRoundItems(itemMode, me.itemsUsed);
  const pinSrc = useMemo(() => getAvatarPin(normalizeAvatar(me.avatar)), [me.avatar]);
  const submitted = me.submitted;

  // 남은 시간 (서버 시계 기준, 서버 마감에는 2초 여유가 있으므로 화면에서는 2초 빼고 보여준다)
  const remainingMs = state.roundDeadline === null ? null : state.roundDeadline - 2000 - (now + clockOffset);
  const remaining = remainingMs === null ? null : Math.max(0, Math.ceil(remainingMs / 1000));

  useEffect(() => {
    if (state.roundDeadline === null || submitted) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [state.roundDeadline, submitted]);

  const submit = useCallback(
    async (finalGuess: { lat: number; lng: number } | null, usedItems: ItemId[]) => {
      if (submitting || submitted) return;
      setSubmitting(true);
      setError(null);
      try {
        onState(await roomActions.guess(code, token, { round: state.round, guess: finalGuess, items: usedItems }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "제출하지 못했어요.");
      } finally {
        setSubmitting(false);
      }
    },
    [code, token, state.round, submitting, submitted, onState]
  );

  // 시간이 다 되면 지금 찍어둔 위치로 자동 제출 (안 찍었으면 0점)
  useEffect(() => {
    if (remaining === 0 && !submitted && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      submit(guess, items.roundItems);
    }
  }, [remaining, submitted, guess, items.roundItems, submit]);

  // 정답 보정: 로드뷰가 열린 실제 좌표를 서버에 한 번 보고
  const handleActualPosition = useCallback(
    (lat: number, lng: number) => {
      setAnswer({ lat, lng });
      if (reportedRef.current) return;
      reportedRef.current = true;
      roomActions.position(code, token, { round: state.round, lat, lng }).catch(() => {
        reportedRef.current = false;
      });
    },
    [code, token, state.round]
  );

  const applyItem = async (id: ItemId) => {
    if (submitted) return;
    const showMap = await items.apply(id, answer);
    if (showMap) setView("map");
  };

  const activePlayers = state.players.filter((p) => !p.left);
  const isUrgent = remaining !== null && remaining <= 10;

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className={`absolute inset-0 ${view === "roadview" ? "z-0" : "-z-10"}`}>
        <RoadviewPane
          ref={roadviewRef}
          panoId={location.panoId}
          lat={location.lat}
          lng={location.lng}
          isLoading={false}
          allowMove={state.settings.allowMove}
          allowPan={state.settings.allowPan}
          allowZoom={state.settings.allowZoom}
          onActualPosition={handleActualPosition}
        />
      </div>
      <div className={`absolute inset-0 ${view === "map" ? "z-0" : "-z-10"}`}>
        <MapPane
          answerLat={location.lat}
          answerLng={location.lng}
          guessLat={guess?.lat ?? null}
          guessLng={guess?.lng ?? null}
          distanceFormatted={null}
          isSubmitted={false}
          pinSrc={pinSrc}
          hintCircle={items.hints.circle}
          onClickPosition={(lat, lng) => {
            if (!submitted) setGuess({ lat, lng });
          }}
        />
      </div>

      {/* 상단 */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between gap-2 p-4">
        <div className="flex max-w-[16rem] flex-col items-start gap-2">
          {/* 참가자 제출 현황 */}
          <div className="pointer-events-auto w-full rounded-lg bg-black/70 p-2 text-white">
            {activePlayers.map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-0.5 text-xs">
                <AvatarPin avatar={normalizeAvatar(p.avatar)} size={22} />
                <span className={`flex-1 truncate ${p.id === state.me ? "font-bold" : ""}`}>
                  {p.nickname}
                  {!p.connected && " (연결 끊김)"}
                </span>
                <span className="tabular-nums text-white/70">{p.totalScore.toLocaleString()}</span>
                <span className={p.submitted ? "text-green-400" : "text-white/40"}>{p.submitted ? "✓" : "…"}</span>
              </div>
            ))}
          </div>

          {itemMode && !submitted && (
            <ItemPanel
              itemsLeft={items.itemsLeft}
              roundItems={items.roundItems}
              busy={items.busy}
              message={items.message}
              onUse={applyItem}
            />
          )}
          {!submitted && <HintPanel hints={items.hints} />}
        </div>

        <div className="flex items-center gap-2">
          <div className="pointer-events-auto rounded-lg bg-black/70 px-4 py-2 text-sm font-bold text-white">
            라운드 {state.round}/{state.totalRounds}
          </div>
          {remaining !== null && !submitted && (
            <div
              className={`pointer-events-auto rounded-lg px-4 py-2 text-sm font-bold tabular-nums ${
                isUrgent ? "animate-pulse bg-red-600 text-white" : "bg-black/70 text-white"
              }`}
            >
              {formatTime(remaining)}
            </div>
          )}
        </div>
      </div>

      {/* 하단 */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-3 p-4">
        {submitted ? (
          <div className="pointer-events-auto rounded-xl bg-white px-6 py-4 text-center shadow-lg">
            <p className="text-lg font-bold text-gray-900">제출 완료!</p>
            <p className="mt-1 text-sm text-gray-500">
              다른 참가자를 기다리는 중… ({activePlayers.filter((p) => p.submitted).length}/{activePlayers.length})
            </p>
          </div>
        ) : (
          <>
            {error && <div className="pointer-events-auto rounded-full bg-red-600 px-4 py-2 text-xs text-white">{error}</div>}
            {view === "map" && !guess && (
              <div className="pointer-events-none rounded-full bg-black/60 px-4 py-2 text-xs text-white">
                지도를 클릭하여 위치를 선택하세요
              </div>
            )}
            <div className="pointer-events-auto flex gap-3">
              {view === "roadview" ? (
                <button
                  onClick={() => setView("map")}
                  className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-gray-800 shadow-lg hover:bg-gray-100"
                >
                  지도 보기
                </button>
              ) : (
                <button
                  onClick={() => setView("roadview")}
                  className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-gray-800 shadow-lg hover:bg-gray-100"
                >
                  로드뷰 보기
                </button>
              )}
              {view === "roadview" && state.settings.allowMove && (
                <button
                  onClick={() => roadviewRef.current?.resetPosition()}
                  className="rounded-lg bg-white/90 px-5 py-3 text-sm font-semibold text-gray-800 shadow-lg hover:bg-gray-100"
                >
                  원래 위치로
                </button>
              )}
              {view === "map" && (
                <button
                  onClick={() => submit(guess, items.roundItems)}
                  disabled={!guess || submitting}
                  className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  {submitting ? "제출 중…" : guess ? "정답 제출" : "위치를 선택하세요"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

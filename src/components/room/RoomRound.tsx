"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { roomActions } from "@/lib/api";
import { ROOM_ATTACKS_PER_ROUND, ROOM_AWAY_PENALTY, RoomAttackType, RoomState } from "@/lib/room-types";
import { attackDef } from "@/lib/attacks";
import { normalizeAvatar } from "@/lib/avatar";
import { getAvatarPin } from "@/lib/avatar-pin";
import type { ItemId } from "@/lib/items";
import { useRoundItems } from "@/lib/use-round-items";
import { useAwayDetector } from "@/lib/use-anti-cheat";
import RoadviewPane, { RoadviewHandle } from "../RoadviewPane";
import MapPane from "../MapPane";
import AvatarPin from "../avatar/AvatarPin";
import { HintPanel, ItemPanel } from "../ItemPanel";
import AttackPanel from "./AttackPanel";
import AttackEffects from "./AttackEffects";

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

  // 남은 시간·방해 효과 표시를 위해 시계는 라운드 내내 돈다 (제출 후에도)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

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

  // 제출 전까지 다른 탭/창으로 나가면 서버에 기록하고, 이번 라운드 점수에서 감점된다
  // (단축키·우클릭 차단은 방 전체에서 RoomController 가 담당)
  const [awayThisRound, setAwayThisRound] = useState(0);
  useAwayDetector(!submitted, () => {
    setAwayThisRound((n) => n + 1);
    roomActions.away(code, token, { round: state.round }).catch(() => {});
  });

  const applyItem = async (id: ItemId) => {
    if (submitted) return;
    const showMap = await items.apply(id, answer);
    if (showMap) setView("map");
  };

  const activePlayers = state.players.filter((p) => !p.left);
  const nicknameOf = (id: string) => state.players.find((p) => p.id === id)?.nickname ?? "누군가";

  // ---------- 방해 아이템 ----------
  const serverNow = now + clockOffset;
  const attacks = state.attacks;
  const attacksSupported = itemMode && attacks !== undefined;
  const myEffects = (attacks ?? []).filter((a) => a.toId === state.me && a.until > serverNow);
  const flipped = myEffects.some((a) => a.type === "flip");
  const spinning = myEffects.some((a) => a.type === "spin");
  const attacksLeft = ROOM_ATTACKS_PER_ROUND - (attacks ?? []).filter((a) => a.fromId === state.me).length;
  const attackTargets = activePlayers.filter((p) => p.id !== state.me && !p.submitted);
  // 모두에게 보여주는 최근 공격 알림 (4초)
  const recentAttacks = (attacks ?? []).filter((a) => serverNow - a.at < 4000).slice(-3);
  const [attackBusy, setAttackBusy] = useState(false);
  const [attackMessage, setAttackMessage] = useState<string | null>(null);
  const attack = async (type: RoomAttackType, targetId: string) => {
    setAttackBusy(true);
    setAttackMessage(null);
    try {
      onState(await roomActions.attack(code, token, { round: state.round, targetId, type }));
    } catch (err) {
      setAttackMessage(err instanceof Error ? err.message : "방해하지 못했어요.");
    } finally {
      setAttackBusy(false);
    }
  };

  // 왼쪽 위 현황은 총점이 높은 순으로
  const ranked = [...activePlayers].sort((a, b) => b.totalScore - a.totalScore);
  const isUrgent = remaining !== null && remaining <= 10;

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-gray-900">
      {/* 방해 효과 '회전'(빙글빙글)과 '뒤집기'(거꾸로)는 로드뷰·지도 어느 쪽을 보고 있어도 적용된다 */}
      <div className="absolute inset-0" style={spinning ? { animation: "wia-spin 2.4s linear infinite" } : undefined}>
        <div
          className="absolute inset-0"
          style={{ transform: flipped ? "rotate(180deg)" : undefined, transition: "transform 400ms ease" }}
        >
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
        </div>
      </div>

      {/* 자리 비움 감점 안내 (본인에게만) */}
      {awayThisRound > 0 && !submitted && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white shadow-lg">
          ⚠️ 다른 탭/창으로 이동해서 이번 라운드 -{(awayThisRound * ROOM_AWAY_PENALTY).toLocaleString()}점
        </div>
      )}

      {/* 나에게 걸린 방해 효과 */}
      <AttackEffects effects={myEffects} serverNow={serverNow} nicknameOf={nicknameOf} />

      {/* 상단 */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between gap-2 p-4">
        <div className="flex max-w-[16rem] flex-col items-start gap-2">
          {/* 참가자 제출 현황 */}
          <div className="pointer-events-auto w-full rounded-lg bg-black/70 p-2 text-white">
            {ranked.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2 py-0.5 text-xs">
                <span className="w-3 text-center text-white/50">{i + 1}</span>
                <AvatarPin avatar={normalizeAvatar(p.avatar)} size={22} />
                <span className={`flex-1 truncate ${p.id === state.me ? "font-bold" : ""}`}>
                  {p.nickname}
                  {!p.connected && " (연결 끊김)"}
                </span>
                {(p.awayCount ?? 0) > 0 && (
                  <span className="text-yellow-300" title="라운드 중 다른 탭/창으로 나간 횟수">
                    ⚠️{p.awayCount}
                  </span>
                )}
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
          {attacksSupported && (
            <AttackPanel
              attacksLeft={attacksLeft}
              targets={attackTargets}
              busy={attackBusy}
              message={attackMessage}
              onAttack={attack}
            />
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <div className="pointer-events-auto rounded-lg bg-black/70 px-4 py-2 text-sm font-bold text-white">
              라운드 {state.round}/{state.totalRounds}
            </div>
            {remaining !== null && (
              <div
                className={`pointer-events-auto rounded-lg px-4 py-2 text-sm font-bold tabular-nums ${
                  isUrgent ? "animate-pulse bg-red-600 text-white" : "bg-black/70 text-white"
                }`}
              >
                {formatTime(remaining)}
              </div>
            )}
          </div>
          {/* 방해 아이템 알림 (모두에게) */}
          {recentAttacks.map((a) => (
            <div key={a.id} className="rounded-full bg-black/75 px-3 py-1 text-xs font-semibold text-white shadow">
              {nicknameOf(a.fromId)} → {nicknameOf(a.toId)} {attackDef(a.type).emoji} {attackDef(a.type).name}!
            </div>
          ))}
        </div>
      </div>

      {/* 하단 */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {submitted ? (
          <div className="pointer-events-auto rounded-xl bg-white px-6 py-4 text-center shadow-lg">
            <p className="text-lg font-bold text-gray-900">제출 완료!</p>
            <p className="mt-1 text-sm text-gray-500">
              다른 참가자를 기다리는 중… ({activePlayers.filter((p) => p.submitted).length}/{activePlayers.length})
            </p>
            {remaining !== null && (
              <p className="mt-1 text-xs text-gray-400">시간이 끝나면 아직 안 낸 사람은 자동 제출돼요 · 남은 시간 {formatTime(remaining)}</p>
            )}
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

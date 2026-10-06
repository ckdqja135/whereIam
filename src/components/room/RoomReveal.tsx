"use client";

import { useEffect, useMemo, useState } from "react";
import { roomActions } from "@/lib/api";
import type { RoomState } from "@/lib/room-types";
import { normalizeAvatar } from "@/lib/avatar";
import { formatAddress, getAddress, AddressResult } from "@/lib/address";
import { itemDef } from "@/lib/items";
import AvatarPin from "../avatar/AvatarPin";
import RoundRevealMap from "./RoundRevealMap";

interface RoomRevealProps {
  code: string;
  token: string;
  state: RoomState; // status === "reveal"
  clockOffset: number;
  onState: (s: RoomState) => void;
}

function formatKm(km: number | null): string {
  if (km === null) return "시간 초과";
  return km >= 1 ? `${km.toFixed(1)}km` : `${Math.round(km * 1000)}m`;
}

// 라운드 결과: 모두의 추측 + 라운드 점수. 일정 시간 뒤 자동으로 다음 라운드로 넘어간다.
export default function RoomReveal({ code, token, state, clockOffset, onState }: RoomRevealProps) {
  const result = state.rounds[state.rounds.length - 1];
  const isHost = state.hostId === state.me;
  const isLast = state.round >= state.totalRounds;
  const [now, setNow] = useState(() => Date.now());
  const [address, setAddress] = useState<AddressResult | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAddress(result.answer.lat, result.answer.lng).then((a) => {
      if (!cancelled) setAddress(a);
    });
    return () => {
      cancelled = true;
    };
  }, [result.answer.lat, result.answer.lng]);

  const playerById = useMemo(() => new Map(state.players.map((p) => [p.id, p])), [state.players]);
  const entries = useMemo(
    () =>
      result.results.map((r) => ({
        playerId: r.playerId,
        avatar: normalizeAvatar(playerById.get(r.playerId)?.avatar),
        guess: r.guess,
      })),
    [result, playerById]
  );
  const ranked = [...result.results].sort((a, b) => b.score - a.score);

  const autoIn =
    state.revealDeadline === null ? null : Math.max(0, Math.ceil((state.revealDeadline - (now + clockOffset)) / 1000));

  const next = async () => {
    setBusy(true);
    try {
      onState(await roomActions.next(code, token));
    } catch {
      // 자동 진행과 겹치면 409 가 날 수 있다. 폴링이 곧 다음 상태를 가져온다.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-dvh flex-col bg-gray-900 md:flex-row">
      <div className="h-[45vh] w-full shrink-0 md:h-full md:flex-1">
        <RoundRevealMap answer={result.answer} entries={entries} />
      </div>

      <div className="flex w-full flex-1 flex-col overflow-y-auto bg-white p-6 md:w-96 md:flex-none">
        <p className="text-sm text-gray-500">
          라운드 {result.round}/{state.totalRounds} 결과
        </p>
        <p className="mt-1 text-sm font-medium text-gray-800">
          📍 {address === undefined ? "주소 확인 중..." : formatAddress(address) ?? "주소 정보 없음"}
        </p>

        <ol className="mt-4 divide-y divide-gray-100">
          {ranked.map((r, i) => {
            const p = playerById.get(r.playerId);
            return (
              <li key={r.playerId} className={`flex items-center gap-3 py-2.5 ${r.playerId === state.me ? "rounded-lg bg-blue-50 px-2" : ""}`}>
                <span className="w-5 text-center text-sm font-bold text-gray-400">{i + 1}</span>
                <AvatarPin avatar={normalizeAvatar(p?.avatar)} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {p?.nickname ?? "?"}
                    {(p?.awayCount ?? 0) > 0 && (
                      <span className="ml-1 text-xs font-normal text-amber-600" title="라운드 중 다른 탭/창으로 나간 횟수">
                        ⚠️ 자리 비움 {p?.awayCount}회
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatKm(r.distanceKm)}
                    {r.penalty > 0 && (
                      <span className="ml-1 text-red-500">
                        {r.items.map((id) => itemDef(id).emoji).join("")} -{r.penalty.toLocaleString()}
                      </span>
                    )}
                    {(r.awayPenalty ?? 0) > 0 && (
                      <span className="ml-1 text-amber-600">⚠️ 자리 비움 -{r.awayPenalty!.toLocaleString()}</span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-blue-600">+{r.score.toLocaleString()}</p>
                  <p className="text-xs tabular-nums text-gray-400">{(p?.totalScore ?? 0).toLocaleString()}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-auto pt-6">
          {isHost ? (
            <button
              onClick={next}
              disabled={busy}
              className="w-full rounded-lg bg-green-600 py-3 font-semibold text-white hover:bg-green-700 disabled:bg-gray-400"
            >
              {isLast ? "최종 결과 보기" : "다음 라운드"} {autoIn !== null && `(${autoIn})`}
            </button>
          ) : (
            <p className="text-center text-sm text-gray-500">
              {autoIn !== null ? `${autoIn}초 후 ${isLast ? "최종 결과로" : "다음 라운드로"} 넘어가요` : "방장을 기다리는 중…"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

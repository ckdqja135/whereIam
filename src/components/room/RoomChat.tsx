"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { roomActions } from "@/lib/api";
import { ROOM_CHAT_MAX_LENGTH, ROOM_SYSTEM_PLAYER_ID, RoomChatMessage, RoomState } from "@/lib/room-types";
import { normalizeAvatar } from "@/lib/avatar";
import AvatarPin from "../avatar/AvatarPin";

interface RoomChatProps {
  code: string;
  token: string;
  state: RoomState;
  onState: (s: RoomState) => void;
  defaultOpen?: boolean;
}

// "오후 02:24"
function formatTime(at: number): string {
  const d = new Date(at);
  const h = d.getHours();
  const hh = String(h % 12 === 0 ? 12 : h % 12).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${h < 12 ? "오전" : "오후"} ${hh}:${mm}`;
}

const sameMinute = (a: number, b: number) => Math.floor(a / 60000) === Math.floor(b / 60000);

interface ChatRow {
  message: RoomChatMessage;
  mine: boolean;
  showSender: boolean; // 연속 메시지 묶음의 첫 메시지 → 얼굴/닉네임
  showTime: boolean; // 묶음의 마지막 메시지 → 시간
}

// 같은 사람이 같은 분에 연달아 보낸 메시지는 카카오톡처럼 하나로 묶어 보여준다
function toRows(messages: RoomChatMessage[], me: string): ChatRow[] {
  return messages.map((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const groupedWithPrev = prev && prev.playerId === m.playerId && sameMinute(prev.at, m.at);
    const groupedWithNext = next && next.playerId === m.playerId && sameMinute(next.at, m.at);
    return { message: m, mine: m.playerId === me, showSender: !groupedWithPrev, showTime: !groupedWithNext };
  });
}

// 대결 방 채팅 (카카오톡 오픈채팅 스타일). 롱 폴링으로 받은 방 상태의 chat 을 그대로 보여준다.
export default function RoomChat({ code, token, state, onState, defaultOpen = false }: RoomChatProps) {
  const messages = useMemo(() => state.chat ?? [], [state.chat]);
  const lastId = messages.length > 0 ? messages[messages.length - 1].id : 0;
  // 모바일에서는 채팅이 화면 전체를 덮으므로 처음부터 열지 않는다
  const [open, setOpen] = useState(
    () => defaultOpen && typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches
  );
  const [readId, setReadId] = useState(lastId);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => toRows(messages, state.me), [messages, state.me]);
  const players = useMemo(() => new Map(state.players.map((p) => [p.id, p])), [state.players]);
  const memberCount = state.players.filter((p) => !p.left).length;

  // 열려 있으면 새 메시지를 바로 읽음 처리하고 맨 아래로 스크롤
  const effectiveRead = open ? lastId : readId;
  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [open, lastId]);

  const toggle = () => {
    setReadId(lastId);
    setOpen((v) => !v);
  };

  const unread = messages.filter((m) => m.id > effectiveRead && m.playerId !== state.me).length;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      onState(await roomActions.chat(code, token, { text: body }));
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "보내지 못했어요.");
    } finally {
      setSending(false);
    }
  };

  // 구버전 서버(채팅 미지원)면 숨긴다
  if (state.chat === undefined) return null;

  return (
    <div className="pointer-events-none fixed bottom-24 right-3 z-40 flex flex-col items-end gap-2 sm:right-4">
      {open && (
        // 모바일: 화면 전체를 덮는 채팅방 / 데스크톱: 오른쪽 아래 떠 있는 창
        <div className="pointer-events-auto fixed inset-0 z-50 flex h-dvh w-full flex-col overflow-hidden bg-[#b2c7d9] sm:static sm:z-auto sm:h-[36rem] sm:max-h-[calc(100dvh-14rem)] sm:w-96 sm:rounded-2xl lg:h-[40rem] lg:w-[26rem] sm:shadow-2xl sm:ring-1 sm:ring-black/10">
          {/* 상단 바 */}
          <div className="flex items-center justify-between bg-[#a9bdce] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="flex items-baseline gap-1.5">
              <p className="text-base font-bold text-gray-900">대결방 {code}</p>
              <span className="text-base text-gray-600">{memberCount}</span>
            </div>
            <button onClick={toggle} aria-label="채팅 닫기" className="p-1 text-xl leading-none text-gray-700 hover:text-gray-900 sm:p-0 sm:text-lg">
              ✕
            </button>
          </div>

          {/* 공지 */}
          <div className="mx-2 mt-2 flex items-center gap-2 rounded-lg bg-white/95 px-3 py-2 text-xs text-gray-800 shadow-sm">
            <span>📢</span>
            <span className="truncate">환영합니다! 같은 문제로 겨루는 대결방이에요.</span>
          </div>

          {/* 메시지 목록 */}
          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3">
            {rows.length === 0 && (
              <p className="py-10 text-center text-xs text-gray-600">첫 메시지를 보내보세요 👋</p>
            )}
            {rows.map(({ message: m, mine, showSender, showTime }) => {
              const time = showTime && (
                <span className="shrink-0 self-end pb-0.5 text-[10px] leading-none text-gray-600">{formatTime(m.at)}</span>
              );

              // 시스템 안내 (강퇴 등): 가운데 회색 알림
              if (m.playerId === ROOM_SYSTEM_PLAYER_ID) {
                return (
                  <div key={m.id} className="mt-2.5 flex justify-center">
                    <span className="rounded-full bg-black/15 px-3 py-1 text-[11px] text-gray-800">{m.text}</span>
                  </div>
                );
              }

              if (mine) {
                return (
                  <div key={m.id} className={`flex items-end justify-end gap-1.5 ${showSender ? "mt-2.5" : "mt-1"}`}>
                    {time}
                    <span className="max-w-[75%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-[#fee500] px-3 py-1.5 text-sm text-gray-900 shadow-sm">
                      {m.text}
                    </span>
                  </div>
                );
              }

              const player = players.get(m.playerId);
              return (
                <div key={m.id} className={`flex gap-2 ${showSender ? "mt-2.5" : "mt-1"}`}>
                  {/* 묶음의 첫 메시지만 얼굴, 나머지는 자리만 차지 */}
                  <div className="w-9 shrink-0">
                    {showSender &&
                      (player ? (
                        <AvatarPin avatar={normalizeAvatar(player.avatar)} size={36} />
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-300 text-sm">👤</span>
                      ))}
                  </div>
                  <div className="flex min-w-0 flex-col items-start">
                    {showSender && (
                      <span className="mb-1 text-xs text-gray-700">
                        {m.nickname}
                        {player?.id === state.hostId && " 👑"}
                      </span>
                    )}
                    <div className="flex items-end gap-1.5">
                      <span
                        className={`max-w-[65vw] sm:max-w-[15rem] lg:max-w-[17rem] whitespace-pre-wrap break-words rounded-2xl bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm ${
                          showSender ? "rounded-tl-md" : ""
                        }`}
                      >
                        {m.text}
                      </span>
                      {time}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 입력 */}
          <form onSubmit={send} className="flex items-center gap-2 bg-white px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={ROOM_CHAT_MAX_LENGTH}
              placeholder="메시지 입력"
              aria-label="채팅 메시지"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-full bg-gray-100 px-4 py-2 text-base text-gray-900 sm:text-sm outline-none focus:bg-gray-50 focus:ring-2 focus:ring-[#fee500]"
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="shrink-0 rounded-full bg-[#fee500] px-4 py-2 text-sm font-bold text-gray-900 hover:brightness-95 disabled:bg-gray-200 disabled:text-gray-400"
            >
              전송
            </button>
          </form>
          {error && <p className="bg-white px-4 pb-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
      <button
        onClick={toggle}
        aria-label={open ? "채팅 닫기" : "채팅 열기"}
        className={`pointer-events-auto relative h-12 w-12 items-center justify-center rounded-full bg-[#fee500] text-xl shadow-lg hover:brightness-95 ${open ? "hidden sm:flex" : "flex"}`}
      >
        💬
        {!open && unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { roomActions } from "@/lib/api";
import { ROOM_CHAT_MAX_LENGTH, RoomState } from "@/lib/room-types";

interface RoomChatProps {
  code: string;
  token: string;
  state: RoomState;
  onState: (s: RoomState) => void;
  defaultOpen?: boolean;
}

// 대결 방 채팅. 롱 폴링으로 받은 방 상태의 chat 을 그대로 보여준다 (별도 연결 없음).
export default function RoomChat({ code, token, state, onState, defaultOpen = false }: RoomChatProps) {
  const messages = state.chat ?? [];
  const lastId = messages.length > 0 ? messages[messages.length - 1].id : 0;
  const [open, setOpen] = useState(defaultOpen);
  const [readId, setReadId] = useState(lastId);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

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
    <div className="pointer-events-none fixed bottom-24 right-4 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="pointer-events-auto flex h-72 w-72 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/10">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <p className="text-sm font-bold text-gray-900">채팅</p>
            <button onClick={toggle} aria-label="채팅 닫기" className="text-gray-400 hover:text-gray-700">
              ✕
            </button>
          </div>
          <div ref={listRef} className="flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
            {messages.length === 0 && <p className="py-6 text-center text-xs text-gray-400">아직 메시지가 없어요</p>}
            {messages.map((m) => {
              const mine = m.playerId === state.me;
              return (
                <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  {!mine && <span className="text-[11px] text-gray-500">{m.nickname}</span>}
                  <span
                    className={`max-w-[85%] break-words rounded-2xl px-3 py-1.5 text-sm ${
                      mine ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"
                    }`}
                  >
                    {m.text}
                  </span>
                </div>
              );
            })}
          </div>
          <form onSubmit={send} className="flex gap-1.5 border-t border-gray-100 p-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={ROOM_CHAT_MAX_LENGTH}
              placeholder="메시지 입력"
              aria-label="채팅 메시지"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
            >
              전송
            </button>
          </form>
          {error && <p className="px-3 pb-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
      <button
        onClick={toggle}
        aria-label={open ? "채팅 닫기" : "채팅 열기"}
        className="pointer-events-auto relative flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-xl text-white shadow-lg hover:bg-indigo-700"
      >
        💬
        {!open && unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </div>
  );
}

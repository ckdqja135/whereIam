"use client";

import { useEffect, useRef } from "react";
import type { ChallengeLocation, Guess } from "@/lib/api-types";
import type { Avatar } from "@/lib/avatar";
import { getAvatarPin } from "@/lib/avatar-pin";
import { avatarPinHtml, createAnswerMarker } from "@/lib/map-markers";

interface RoundRevealMapProps {
  answer: ChallengeLocation;
  entries: { playerId: string; avatar: Avatar; guess: Guess }[];
}

// 한 라운드의 정답과 모든 참가자의 추측을 한 지도에 표시
export default function RoundRevealMap({ answer, entries }: RoundRevealMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !window.kakao?.maps) return;
    const answerPos = new kakao.maps.LatLng(answer.lat, answer.lng);
    const map = new kakao.maps.Map(containerRef.current, { center: answerPos, level: 9 });
    createAnswerMarker(map, answerPos);

    const bounds = new kakao.maps.LatLngBounds(answerPos, answerPos);
    let hasGuess = false;
    for (const e of entries) {
      if (!e.guess) continue;
      hasGuess = true;
      const pos = new kakao.maps.LatLng(e.guess.lat, e.guess.lng);
      new kakao.maps.CustomOverlay({ position: pos, content: avatarPinHtml(getAvatarPin(e.avatar)), yAnchor: 1, map });
      new kakao.maps.Polyline({
        path: [answerPos, pos],
        strokeWeight: 3,
        strokeColor: "#FF4444",
        strokeOpacity: 0.7,
        strokeStyle: "dashed",
        map,
      });
      bounds.extend(pos);
    }
    if (hasGuess) map.setBounds(bounds, 70, 70, 70, 70);
  }, [answer, entries]);

  return <div ref={containerRef} className="h-full w-full" />;
}

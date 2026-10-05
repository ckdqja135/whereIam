"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Profile } from "@/lib/profile";
import type { RoundResult } from "@/lib/game";
import { MAX_SCORE } from "@/lib/score";
import { getAvatarPin } from "@/lib/avatar-pin";
import { avatarPinHtml, createAnswerMarker } from "@/lib/map-markers";
import AvatarPin from "./avatar/AvatarPin";
import { formatAddress } from "@/lib/address";

interface ResultScreenProps {
  profile: Profile;
  results: RoundResult[];
  title?: string;
  // 결과 목록 아래에 붙는 영역 (챌린지 공유, 순위표 등)
  children?: React.ReactNode;
  actions: React.ReactNode;
}

export default function ResultScreen({ profile, results, title = "게임 결과", children, actions }: ResultScreenProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const maxTotal = MAX_SCORE * results.length;
  const pinSrc = useMemo(() => getAvatarPin(profile.avatar), [profile.avatar]);

  // 모든 라운드의 정답/추측을 한 지도에 표시
  useEffect(() => {
    if (!mapContainerRef.current || !window.kakao?.maps || results.length === 0) return;

    const map = new kakao.maps.Map(mapContainerRef.current, {
      center: new kakao.maps.LatLng(36.5, 127.5),
      level: 13,
    });

    const first = new kakao.maps.LatLng(results[0].answer.lat, results[0].answer.lng);
    const bounds = new kakao.maps.LatLngBounds(first, first);

    results.forEach((r, i) => {
      const answerPos = new kakao.maps.LatLng(r.answer.lat, r.answer.lng);
      createAnswerMarker(map, answerPos, String(i + 1));
      bounds.extend(answerPos);

      if (r.guess) {
        const guessPos = new kakao.maps.LatLng(r.guess.lat, r.guess.lng);
        new kakao.maps.CustomOverlay({ position: guessPos, content: avatarPinHtml(pinSrc), yAnchor: 1, map });
        new kakao.maps.Polyline({
          path: [answerPos, guessPos],
          strokeWeight: 3,
          strokeColor: "#FF4444",
          strokeOpacity: 0.8,
          strokeStyle: "dashed",
          map,
        });
        bounds.extend(guessPos);
      }
    });

    map.setBounds(bounds, 60, 60, 60, 60);
  }, [results, pinSrc]);

  return (
    <div className="flex h-screen flex-col bg-gray-900 md:flex-row">
      <div ref={mapContainerRef} className="h-[40vh] w-full shrink-0 md:h-full md:flex-1" />

      <div className="flex w-full flex-1 flex-col overflow-y-auto bg-white p-6 md:w-96 md:flex-none">
        <div className="flex items-center gap-3">
          <AvatarPin avatar={profile.avatar} size={48} />
          <div>
            <p className="text-sm text-gray-500">{title}</p>
            <p className="font-bold text-gray-900">{profile.nickname}</p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-4xl font-bold tabular-nums text-blue-600">{totalScore.toLocaleString()}</p>
          <p className="mt-1 text-sm text-gray-500">/ {maxTotal.toLocaleString()}점</p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${(totalScore / maxTotal) * 100}%` }} />
          </div>
        </div>

        <ul className="mt-6 divide-y divide-gray-100">
          {results.map((r, i) => (
            <li key={i} className="py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-700">라운드 {i + 1}</span>
                <span className="text-gray-500">{r.distance ? r.distance.formatted : "시간 초과"}</span>
                <span className="w-20 text-right font-bold tabular-nums text-gray-900">{r.score.toLocaleString()}점</span>
              </div>
              {formatAddress(r.address) && (
                <p className="mt-1 truncate text-xs text-gray-500">📍 {formatAddress(r.address)}</p>
              )}
            </li>
          ))}
        </ul>

        {children}

        <div className="mt-auto flex gap-3 pt-6">{actions}</div>
      </div>
    </div>
  );
}

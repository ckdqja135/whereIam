"use client";

import { useEffect, useRef } from "react";
import { avatarPinHtml, createAnswerMarker } from "@/lib/map-markers";

interface MapPaneProps {
  answerLat: number;
  answerLng: number;
  guessLat: number | null;
  guessLng: number | null;
  distanceFormatted: string | null;
  isSubmitted: boolean;
  pinSrc: string;
  onClickPosition: (lat: number, lng: number) => void;
}

export default function MapPane({
  answerLat,
  answerLng,
  guessLat,
  guessLng,
  distanceFormatted,
  isSubmitted,
  pinSrc,
  onClickPosition,
}: MapPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const previewOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const answerMarkerRef = useRef<kakao.maps.Marker | null>(null);
  const guessOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const polylineRef = useRef<kakao.maps.Polyline | null>(null);
  const overlayRef = useRef<kakao.maps.CustomOverlay | null>(null);

  // 클릭 리스너는 한 번만 등록되므로 최신 콜백을 ref로 참조 (제출 후 클릭 무시 등)
  const onClickRef = useRef(onClickPosition);
  useEffect(() => {
    onClickRef.current = onClickPosition;
  });

  const clearResult = () => {
    answerMarkerRef.current?.setMap(null);
    answerMarkerRef.current = null;
    guessOverlayRef.current?.setMap(null);
    guessOverlayRef.current = null;
    polylineRef.current?.setMap(null);
    polylineRef.current = null;
    overlayRef.current?.setMap(null);
    overlayRef.current = null;
  };

  const clearPreview = () => {
    previewOverlayRef.current?.setMap(null);
    previewOverlayRef.current = null;
  };

  // 지도 초기화 + 클릭 이벤트
  useEffect(() => {
    if (!containerRef.current || !window.kakao?.maps) return;

    const center = new kakao.maps.LatLng(36.5, 127.5);
    const map = new kakao.maps.Map(containerRef.current, {
      center,
      level: 13,
    });
    mapRef.current = map;

    kakao.maps.event.addListener(map, "click", (...args: unknown[]) => {
      const mouseEvent = args[0] as { latLng: kakao.maps.LatLng };
      onClickRef.current(mouseEvent.latLng.getLat(), mouseEvent.latLng.getLng());
    });
  }, []);

  // 새 라운드 시작 시 정리 + 지도 초기화
  useEffect(() => {
    if (!mapRef.current || isSubmitted) return;

    clearResult();
    clearPreview();

    mapRef.current.setCenter(new kakao.maps.LatLng(36.5, 127.5));
    mapRef.current.setLevel(13);
  }, [isSubmitted, answerLat, answerLng]);

  // 미리보기 마커 (내 캐릭터 얼굴 핀)
  useEffect(() => {
    if (!mapRef.current || isSubmitted) return;

    if (guessLat === null || guessLng === null) {
      clearPreview();
      return;
    }

    const pos = new kakao.maps.LatLng(guessLat, guessLng);

    if (previewOverlayRef.current) {
      previewOverlayRef.current.setPosition(pos);
    } else {
      previewOverlayRef.current = new kakao.maps.CustomOverlay({
        position: pos,
        content: avatarPinHtml(pinSrc),
        yAnchor: 1,
        map: mapRef.current,
      });
    }
  }, [guessLat, guessLng, isSubmitted, pinSrc]);

  // 제출 결과 표시
  useEffect(() => {
    if (!mapRef.current || !isSubmitted) return;

    const map = mapRef.current;
    clearPreview();
    clearResult();

    const answerPos = new kakao.maps.LatLng(answerLat, answerLng);
    answerMarkerRef.current = createAnswerMarker(map, answerPos);

    // 시간 초과로 추측 없이 제출된 경우: 정답만 보여준다
    if (guessLat === null || guessLng === null) {
      map.setCenter(answerPos);
      map.setLevel(9);
      return;
    }

    const guessPos = new kakao.maps.LatLng(guessLat, guessLng);
    guessOverlayRef.current = new kakao.maps.CustomOverlay({
      position: guessPos,
      content: avatarPinHtml(pinSrc),
      yAnchor: 1,
      map,
    });

    polylineRef.current = new kakao.maps.Polyline({
      path: [answerPos, guessPos],
      strokeWeight: 3,
      strokeColor: "#FF4444",
      strokeOpacity: 0.8,
      strokeStyle: "dashed",
      map,
    });

    if (distanceFormatted) {
      const midLat = (answerLat + guessLat) / 2;
      const midLng = (answerLng + guessLng) / 2;
      overlayRef.current = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(midLat, midLng),
        content: `<div style="padding:6px 12px;background:#333;color:#fff;border-radius:20px;font-size:14px;font-weight:bold;white-space:nowrap;">${distanceFormatted}</div>`,
        yAnchor: 1.5,
        map,
      });
    }

    const bounds = new kakao.maps.LatLngBounds(answerPos, guessPos);
    bounds.extend(answerPos);
    bounds.extend(guessPos);
    map.setBounds(bounds, 80, 80, 80, 80);
  }, [isSubmitted, answerLat, answerLng, guessLat, guessLng, distanceFormatted, pinSrc]);

  // 지도가 보일 때 relayout
  useEffect(() => {
    mapRef.current?.relayout();
  });

  return (
    <div className="h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

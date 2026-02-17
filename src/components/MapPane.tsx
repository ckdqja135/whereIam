"use client";

import { useEffect, useRef } from "react";

interface MapPaneProps {
  answerLat: number;
  answerLng: number;
  guessLat: number | null;
  guessLng: number | null;
  distanceFormatted: string | null;
  isSubmitted: boolean;
  onClickPosition: (lat: number, lng: number) => void;
}

export default function MapPane({
  answerLat,
  answerLng,
  guessLat,
  guessLng,
  distanceFormatted,
  isSubmitted,
  onClickPosition,
}: MapPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const previewMarkerRef = useRef<kakao.maps.Marker | null>(null);
  const resultMarkersRef = useRef<kakao.maps.Marker[]>([]);
  const polylineRef = useRef<kakao.maps.Polyline | null>(null);
  const overlayRef = useRef<kakao.maps.CustomOverlay | null>(null);

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
      const lat = mouseEvent.latLng.getLat();
      const lng = mouseEvent.latLng.getLng();
      onClickPosition(lat, lng);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 새 라운드 시작 시 정리 + 지도 초기화
  useEffect(() => {
    if (!mapRef.current || isSubmitted) return;

    resultMarkersRef.current.forEach((m) => m.setMap(null));
    resultMarkersRef.current = [];
    polylineRef.current?.setMap(null);
    polylineRef.current = null;
    overlayRef.current?.setMap(null);
    overlayRef.current = null;
    previewMarkerRef.current?.setMap(null);
    previewMarkerRef.current = null;

    mapRef.current.setCenter(new kakao.maps.LatLng(36.5, 127.5));
    mapRef.current.setLevel(13);
  }, [isSubmitted, answerLat, answerLng]);

  // 미리보기 마커
  useEffect(() => {
    if (!mapRef.current || isSubmitted) return;

    if (guessLat === null || guessLng === null) {
      previewMarkerRef.current?.setMap(null);
      previewMarkerRef.current = null;
      return;
    }

    const pos = new kakao.maps.LatLng(guessLat, guessLng);

    if (previewMarkerRef.current) {
      previewMarkerRef.current.setPosition(pos);
    } else {
      previewMarkerRef.current = new kakao.maps.Marker({
        position: pos,
        map: mapRef.current,
      });
    }
  }, [guessLat, guessLng, isSubmitted]);

  // 제출 결과 표시
  useEffect(() => {
    if (!mapRef.current || !isSubmitted) return;
    if (guessLat === null || guessLng === null) return;

    const map = mapRef.current;

    previewMarkerRef.current?.setMap(null);
    previewMarkerRef.current = null;
    resultMarkersRef.current.forEach((m) => m.setMap(null));
    resultMarkersRef.current = [];
    polylineRef.current?.setMap(null);
    overlayRef.current?.setMap(null);

    const answerPos = new kakao.maps.LatLng(answerLat, answerLng);
    const guessPos = new kakao.maps.LatLng(guessLat, guessLng);

    const answerMarkerImage = new kakao.maps.MarkerImage(
      "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerRed.png",
      new kakao.maps.Size(28, 40)
    );
    const answerMarker = new kakao.maps.Marker({
      position: answerPos,
      map,
      image: answerMarkerImage,
    });
    const guessMarker = new kakao.maps.Marker({
      position: guessPos,
      map,
    });
    resultMarkersRef.current = [answerMarker, guessMarker];

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
  }, [isSubmitted, answerLat, answerLng, guessLat, guessLng, distanceFormatted]);

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

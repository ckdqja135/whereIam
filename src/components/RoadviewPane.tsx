"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";

interface RoadviewPaneProps {
  panoId: number | null;
  lat: number;
  lng: number;
  isLoading: boolean;
  onActualPosition?: (lat: number, lng: number) => void;
}

export interface RoadviewHandle {
  resetPosition: () => void;
}

const RoadviewPane = forwardRef<RoadviewHandle, RoadviewPaneProps>(
  function RoadviewPane({ panoId, lat, lng, isLoading, onActualPosition }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const roadviewRef = useRef<kakao.maps.Roadview | null>(null);
    const originRef = useRef<{ panoId: number; lat: number; lng: number } | null>(null);

    useImperativeHandle(ref, () => ({
      resetPosition: () => {
        if (!roadviewRef.current || !originRef.current) return;
        const { panoId, lat, lng } = originRef.current;
        const pos = new kakao.maps.LatLng(lat, lng);
        roadviewRef.current.setPanoId(panoId, pos);
      },
    }));

    useEffect(() => {
      if (!containerRef.current || !panoId || isLoading) return;
      if (!window.kakao?.maps) return;

      const position = new kakao.maps.LatLng(lat, lng);

      // 매 라운드마다 originRef를 즉시 업데이트
      originRef.current = { panoId, lat, lng };

      if (!roadviewRef.current) {
        roadviewRef.current = new kakao.maps.Roadview(containerRef.current);
      }

      const rv = roadviewRef.current;
      const handleInit = () => {
        const actualPos = rv.getPosition();
        const actualLat = actualPos.getLat();
        const actualLng = actualPos.getLng();
        // 실제 위치로 originRef 보정
        originRef.current = { panoId, lat: actualLat, lng: actualLng };
        onActualPosition?.(actualLat, actualLng);
      };

      kakao.maps.event.addListener(rv, "init", handleInit);
      rv.setPanoId(panoId, position);

      return () => {
        kakao.maps.event.removeListener(rv, "init", handleInit);
      };
    }, [panoId, lat, lng, isLoading, onActualPosition]);

    return (
      <div className="relative h-full w-full">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900">
            <div className="text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-gray-600 border-t-blue-500" />
              <p className="text-lg text-white">로드뷰를 불러오는 중...</p>
            </div>
          </div>
        )}
        <div ref={containerRef} className="h-full w-full" />
      </div>
    );
  }
);

export default RoadviewPane;

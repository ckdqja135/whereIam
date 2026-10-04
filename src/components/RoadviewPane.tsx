"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";

interface RoadviewPaneProps {
  panoId: number | null;
  lat: number;
  lng: number;
  isLoading: boolean;
  allowMove?: boolean;
  allowPan?: boolean;
  allowZoom?: boolean;
  onActualPosition?: (lat: number, lng: number) => void;
}

export interface RoadviewHandle {
  resetPosition: () => void;
}

const RoadviewPane = forwardRef<RoadviewHandle, RoadviewPaneProps>(
  function RoadviewPane(
    { panoId, lat, lng, isLoading, allowMove = true, allowPan = true, allowZoom = true, onActualPosition },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const roadviewRef = useRef<kakao.maps.Roadview | null>(null);
    const originRef = useRef<{ panoId: number; lat: number; lng: number } | null>(null);
    // 회전/확대 금지일 때 되돌아갈 시점
    const baseViewRef = useRef<{ pan: number; tilt: number; zoom: number } | null>(null);
    const rulesRef = useRef({ allowMove, allowPan, allowZoom });
    useEffect(() => {
      rulesRef.current = { allowMove, allowPan, allowZoom };
    });

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
      baseViewRef.current = null;

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
        const v = rv.getViewpoint();
        baseViewRef.current = { pan: v.pan, tilt: v.tilt, zoom: v.zoom };
        onActualPosition?.(actualLat, actualLng);
      };

      // 이동 금지: 다른 파노라마로 넘어가면 원래 위치로 되돌린다
      const handlePanoChanged = () => {
        const origin = originRef.current;
        if (rulesRef.current.allowMove || !origin) return;
        if (rv.getPanoId() !== origin.panoId) {
          rv.setPanoId(origin.panoId, new kakao.maps.LatLng(origin.lat, origin.lng));
        }
      };

      // 회전/확대 금지: 바뀐 시점을 기준 시점으로 되돌린다
      const handleViewpointChanged = () => {
        const base = baseViewRef.current;
        const { allowPan, allowZoom } = rulesRef.current;
        if (!base || (allowPan && allowZoom)) return;
        const v = rv.getViewpoint();
        const pan = allowPan ? v.pan : base.pan;
        const tilt = allowPan ? v.tilt : base.tilt;
        const zoom = allowZoom ? v.zoom : base.zoom;
        if (pan !== v.pan || tilt !== v.tilt || zoom !== v.zoom) {
          rv.setViewpoint(new kakao.maps.Viewpoint(pan, tilt, zoom));
        }
      };

      kakao.maps.event.addListener(rv, "init", handleInit);
      kakao.maps.event.addListener(rv, "panoid_changed", handlePanoChanged);
      kakao.maps.event.addListener(rv, "viewpoint_changed", handleViewpointChanged);
      rv.setPanoId(panoId, position);

      return () => {
        kakao.maps.event.removeListener(rv, "init", handleInit);
        kakao.maps.event.removeListener(rv, "panoid_changed", handlePanoChanged);
        kakao.maps.event.removeListener(rv, "viewpoint_changed", handleViewpointChanged);
      };
    }, [panoId, lat, lng, isLoading, onActualPosition]);

    // 확대 금지: 휠 입력을 로드뷰에 전달하기 전에 막아 화면이 튀지 않게 한다
    useEffect(() => {
      const el = containerRef.current;
      if (!el || allowZoom) return;
      const block = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
      };
      el.addEventListener("wheel", block, { capture: true, passive: false });
      return () => el.removeEventListener("wheel", block, { capture: true });
    }, [allowZoom]);

    // 이동·회전·확대 모두 금지(NMPZ)면 입력 자체를 막는다
    const frozen = !allowMove && !allowPan && !allowZoom;

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
        {frozen && <div className="absolute inset-0 z-[5]" aria-hidden />}
      </div>
    );
  }
);

export default RoadviewPane;

"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { flagStation } from "@/lib/api";

// 이번 탭에서 신고한 문제. 게임 중에 신고한 문제는 결과 화면에서도 신고한 것으로 보인다
const flaggedPanos = new Set<number>();

interface StationFlagButtonProps {
  panoId: number;
  // overlay: 로드뷰 위 / light: 흰 결과 카드 / dark: 어두운 결과 화면 (대결)
  variant: "overlay" | "light" | "dark";
}

const STYLES = {
  overlay: {
    button: "rounded-full bg-black/60 px-3 py-1 text-[11px] text-white/90 hover:bg-black/75",
    done: "rounded-full bg-black/60 px-3 py-1 text-[11px] text-white/90",
  },
  light: {
    button: "rounded-full border border-gray-200 px-2 py-1 text-[11px] text-gray-500 hover:border-red-300 hover:text-red-500",
    done: "px-2 py-1 text-[11px] text-red-500",
  },
  dark: {
    button: "rounded-full bg-white/10 px-2 py-1 text-[11px] text-white/70 hover:bg-white/20 hover:text-white",
    done: "px-2 py-1 text-[11px] text-red-300",
  },
};

// 지하철역 문제 신고: 로드뷰에서 역 건물이나 역 이름이 바로 보였을 때 (사진 검사가 놓친 것). 신고하면 그 역은 바로 문제에서 빠진다
export default function StationFlagButton({ panoId, variant }: StationFlagButtonProps) {
  const [flagged, setFlagged] = useState(() => flaggedPanos.has(panoId));
  const style = STYLES[variant];
  const flag = () => {
    flaggedPanos.add(panoId);
    setFlagged(true);
    flagStation({ panoId }).catch(() => {});
  };

  if (flagged) {
    return (
      <span className={`shrink-0 font-semibold ${style.done}`}>
        {variant === "overlay" ? "신고했어요. 이 문제는 다시 나오지 않아요" : "신고했어요"}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={flag}
      title="역 건물이나 역 이름이 바로 보였다면 신고해주세요. 그 역은 다시 나오지 않아요"
      className={`flex shrink-0 items-center gap-1 font-semibold ${style.button}`}
    >
      <Flag className="h-3 w-3" aria-hidden />
      {variant === "overlay" ? "역이나 역 이름이 보였어요" : "역이 보였어요"}
    </button>
  );
}

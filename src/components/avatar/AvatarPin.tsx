"use client";

import { useMemo } from "react";
import type { Avatar } from "@/lib/avatar";
import { getAvatarPin } from "@/lib/avatar-pin";

// 순위표/헤더용 원형 캐릭터 얼굴 이미지
export default function AvatarPin({ avatar, size = 32 }: { avatar: Avatar; size?: number }) {
  const src = useMemo(() => getAvatarPin(avatar), [avatar]);
  if (!src) return <span className="inline-block rounded-full bg-gray-300" style={{ width: size, height: size }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt="" className="shrink-0 rounded-full" />;
}

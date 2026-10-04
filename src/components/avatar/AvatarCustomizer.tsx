"use client";

import { useState } from "react";
import {
  Avatar,
  cycleAvatar,
  EYE_STYLES,
  HAIR_COLORS,
  HAIR_STYLES,
  HATS,
  OUTFIT_COLORS,
  PANTS_COLORS,
  randomAvatar,
  SKIN_COLORS,
} from "@/lib/avatar";
import AvatarViewer from "./AvatarViewer";

interface AvatarCustomizerProps {
  avatar: Avatar;
  onChange: (avatar: Avatar) => void;
  dark?: boolean;
}

type PartRow = { key: keyof Avatar; label: string; value: (a: Avatar) => string; swatch?: (a: Avatar) => string };

const PARTS: PartRow[] = [
  { key: "hairStyle", label: "헤어", value: (a) => HAIR_STYLES[a.hairStyle] },
  { key: "hairColor", label: "머리색", value: () => "", swatch: (a) => HAIR_COLORS[a.hairColor] },
  { key: "eyes", label: "눈", value: (a) => EYE_STYLES[a.eyes] },
  { key: "hat", label: "모자", value: (a) => HATS[a.hat] },
  { key: "skin", label: "피부", value: () => "", swatch: (a) => SKIN_COLORS[a.skin] },
  { key: "outfitColor", label: "옷", value: () => "", swatch: (a) => OUTFIT_COLORS[a.outfitColor] },
  { key: "pantsColor", label: "바지", value: () => "", swatch: (a) => PANTS_COLORS[a.pantsColor] },
];

export default function AvatarCustomizer({ avatar, onChange, dark }: AvatarCustomizerProps) {
  const [editing, setEditing] = useState(false);

  const pill = dark
    ? "border border-white/70 text-white hover:bg-white/10"
    : "border border-gray-300 text-gray-700 hover:bg-gray-100";

  return (
    <div className="flex flex-col items-center">
      <AvatarViewer avatar={avatar} className="h-64 w-56" />

      <div className="mt-1 flex gap-2">
        <button type="button" onClick={() => onChange(randomAvatar())} className={`rounded-full px-4 py-1 text-sm font-semibold ${pill}`}>
          🎲 섞기
        </button>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          className={`rounded-full px-4 py-1 text-sm font-semibold ${pill}`}
        >
          {editing ? "닫기" : "꾸미기"}
        </button>
      </div>

      {editing && (
        <div className={`mt-3 grid w-full grid-cols-1 gap-1.5 rounded-xl p-3 sm:grid-cols-2 ${dark ? "bg-black/40" : "bg-gray-50"}`}>
          {PARTS.map((p) => (
            <div key={p.key} className="flex items-center justify-between gap-2">
              <span className={`text-xs font-semibold ${dark ? "text-white/80" : "text-gray-600"}`}>{p.label}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`${p.label} 이전`}
                  onClick={() => onChange(cycleAvatar(avatar, p.key, -1))}
                  className={`h-7 w-7 rounded-full text-sm ${dark ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-gray-700 shadow-sm hover:bg-gray-100"}`}
                >
                  ‹
                </button>
                <span className={`flex w-16 items-center justify-center text-xs ${dark ? "text-white" : "text-gray-800"}`}>
                  {p.swatch ? (
                    <span className="h-4 w-8 rounded-full border border-black/10" style={{ background: p.swatch(avatar) }} />
                  ) : (
                    p.value(avatar)
                  )}
                </span>
                <button
                  type="button"
                  aria-label={`${p.label} 다음`}
                  onClick={() => onChange(cycleAvatar(avatar, p.key, 1))}
                  className={`h-7 w-7 rounded-full text-sm ${dark ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-gray-700 shadow-sm hover:bg-gray-100"}`}
                >
                  ›
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

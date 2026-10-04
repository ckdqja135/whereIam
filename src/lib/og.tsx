import type { ReactNode } from "react";
import { Avatar, HAIR_COLORS, OUTFIT_COLORS, PANTS_COLORS, SKIN_COLORS } from "./avatar";

// Open Graph(카카오톡/슬랙 등 링크 미리보기) 이미지용 공용 조각.
// next/og 의 ImageResponse(Satori)는 flexbox 와 일부 CSS 만 지원하므로 div 와 border-radius 로만 그린다.

export const OG_SIZE = { width: 1200, height: 630 };

// 구글 폰트에서 필요한 글자만 서브셋으로 받는다 (Satori 는 TTF/OTF 만 지원, woff2 불가).
// Node fetch 의 UA 로 요청하면 구글이 truetype 을 돌려준다.
export async function loadKoreanFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const unique = Array.from(new Set(text)).join("");
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@800&text=${encodeURIComponent(unique)}`,
      { signal: AbortSignal.timeout(5000) }
    ).then((r) => r.text());
    const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/);
    if (!src) return null;
    const res = await fetch(src[1], { signal: AbortSignal.timeout(5000) });
    return res.ok ? res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function ogFonts(text: string) {
  const data = await loadKoreanFont(text);
  return data ? [{ name: "NotoSansKR", data, weight: 800 as const, style: "normal" as const }] : [];
}

const DEFAULT_AVATAR: Avatar = { skin: 1, hairStyle: 1, hairColor: 1, eyes: 0, hat: 0, outfitColor: 5, pantsColor: 0 };

// 플랫 SD 캐릭터 (3D 캐릭터와 같은 색 팔레트를 쓴다)
export function OgCharacter({ avatar = DEFAULT_AVATAR, scale = 1 }: { avatar?: Avatar; scale?: number }) {
  const skin = SKIN_COLORS[avatar.skin] ?? SKIN_COLORS[1];
  const hair = HAIR_COLORS[avatar.hairColor] ?? HAIR_COLORS[1];
  const outfit = OUTFIT_COLORS[avatar.outfitColor] ?? OUTFIT_COLORS[5];
  const pants = PANTS_COLORS[avatar.pantsColor] ?? PANTS_COLORS[0];
  const line = "#2b2233";
  const s = (n: number) => n * scale;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: s(300), height: s(330) }}>
      {/* 머리 */}
      <div style={{ display: "flex", position: "relative", width: s(230), height: s(210) }}>
        <div
          style={{
            position: "absolute", left: 0, top: s(14), width: s(230), height: s(196),
            borderRadius: "50%", background: skin, border: `${s(5)}px solid ${line}`,
          }}
        />
        {/* 머리카락 */}
        <div
          style={{
            position: "absolute", left: s(-6), top: 0, width: s(242), height: s(118),
            borderRadius: `${s(121)}px ${s(121)}px ${s(30)}px ${s(30)}px`, background: hair, border: `${s(5)}px solid ${line}`,
          }}
        />
        {/* 눈 */}
        {[s(66), s(138)].map((x) => (
          <div key={x} style={{ display: "flex", position: "absolute", left: x, top: s(112), width: s(26), height: s(36), borderRadius: "50%", background: line }}>
            <div style={{ position: "absolute", left: s(13), top: s(6), width: s(9), height: s(9), borderRadius: "50%", background: "#fff" }} />
          </div>
        ))}
        {/* 볼터치 */}
        {[s(38), s(166)].map((x) => (
          <div key={x} style={{ position: "absolute", left: x, top: s(146), width: s(28), height: s(16), borderRadius: "50%", background: "#ff8fa3", opacity: 0.7 }} />
        ))}
        {/* 입 */}
        <div
          style={{
            position: "absolute", left: s(101), top: s(150), width: s(28), height: s(16),
            borderBottom: `${s(5)}px solid ${line}`, borderRadius: "0 0 50% 50%",
          }}
        />
      </div>
      {/* 몸 */}
      <div style={{ display: "flex", position: "relative", width: s(150), height: s(120), marginTop: s(-8) }}>
        <div
          style={{
            position: "absolute", left: s(10), top: 0, width: s(130), height: s(92),
            borderRadius: `${s(50)}px ${s(50)}px ${s(26)}px ${s(26)}px`, background: outfit, border: `${s(5)}px solid ${line}`,
          }}
        />
        {[s(34), s(84)].map((x) => (
          <div key={x} style={{ position: "absolute", left: x, top: s(84), width: s(32), height: s(34), borderRadius: `0 0 ${s(14)}px ${s(14)}px`, background: pants, border: `${s(5)}px solid ${line}` }} />
        ))}
      </div>
    </div>
  );
}

// 공통 배경 + 좌우 2단 레이아웃
export function OgFrame({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div
      style={{
        display: "flex", width: "100%", height: "100%", padding: "56px 72px",
        background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #111827 100%)",
        color: "#fff", fontFamily: "NotoSansKR",
      }}
    >
      {/* Satori 는 flex: 1 계산이 불안정해서 폭을 명시한다 (1200 - 좌우 패딩 144 - 오른쪽 380) */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 676, paddingRight: 40 }}>{left}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 380, flexShrink: 0 }}>{right}</div>
    </div>
  );
}

export function OgPill({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex", padding: "10px 22px", borderRadius: 999, fontSize: 24,
        background: "rgba(255,255,255,0.14)", border: "2px solid rgba(255,255,255,0.3)", marginRight: 14, marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

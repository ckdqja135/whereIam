import { ImageResponse } from "next/og";
import { OgCharacter, OgFrame, OgPill, OG_SIZE, ogFonts } from "@/lib/og";

// 오늘의 문제 링크 공유 시 미리보기 (날짜 없이: 카카오톡 등이 링크별로 오래 캐시한다)
export const alt = "Where I Am 오늘의 문제";
export const size = OG_SIZE;
export const contentType = "image/png";

const HEADING = "오늘의 문제";
const SUB = "모두 같은 5곳, 여기가 어딜까요?";
const PILLS = ["하루 한 번", "5라운드", "오늘의 순위"];

export default async function Image() {
  const fonts = await ogFonts("WHERE I AM" + HEADING + SUB + PILLS.join(""));

  return new ImageResponse(
    (
      <OgFrame
        left={
          // Satori 는 Fragment 를 레이아웃 노드로 잘못 처리하므로 실제 div 로 감싼다
          <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
            <div style={{ display: "flex", width: "100%", wordBreak: "keep-all", fontSize: 34, color: "#c7d2fe", letterSpacing: 2 }}>WHERE I AM</div>
            <div style={{ display: "flex", width: "100%", wordBreak: "keep-all", fontSize: 92, marginTop: 6, lineHeight: 1.05 }}>{HEADING}</div>
            <div style={{ display: "flex", width: "100%", wordBreak: "keep-all", fontSize: 38, marginTop: 22, color: "#e0e7ff", lineHeight: 1.3 }}>{SUB}</div>
            <div style={{ display: "flex", width: "100%", flexWrap: "wrap", marginTop: 36 }}>
              {PILLS.map((p) => (
                <OgPill key={p}>{p}</OgPill>
              ))}
            </div>
          </div>
        }
        right={<OgCharacter scale={1.15} />}
      />
    ),
    { ...size, fonts }
  );
}

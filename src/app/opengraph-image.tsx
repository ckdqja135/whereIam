import { ImageResponse } from "next/og";
import { OgCharacter, OgFrame, OgPill, OG_SIZE, ogFonts } from "@/lib/og";

// 메인 링크 공유 시 미리보기 이미지 (카카오톡/슬랙 등)
export const alt = "Where I Am - 로드뷰를 보고 대한민국 어디인지 맞혀보세요";
export const size = OG_SIZE;
export const contentType = "image/png";

const TITLE = "Where I Am";
const SUBTITLE = "로드뷰를 보고 대한민국 어디인지 맞혀보세요";
const PILLS = ["카카오 로드뷰", "5라운드", "친구와 챌린지"];

export default async function Image() {
  const fonts = await ogFonts("WHERE I AM" + TITLE + SUBTITLE + PILLS.join(""));

  return new ImageResponse(
    (
      <OgFrame
        left={
          // Satori 는 Fragment 를 레이아웃 노드로 잘못 처리하므로 실제 div 로 감싼다
          <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
            <div style={{ display: "flex", width: "100%", wordBreak: "keep-all", fontSize: 34, color: "#c7d2fe", letterSpacing: 2 }}>WHERE I AM</div>
            <div style={{ display: "flex", width: "100%", wordBreak: "keep-all", fontSize: 92, marginTop: 6, lineHeight: 1.05 }}>{TITLE}</div>
            <div style={{ display: "flex", width: "100%", wordBreak: "keep-all", fontSize: 38, marginTop: 22, color: "#e0e7ff", lineHeight: 1.3 }}>{SUBTITLE}</div>
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

import { ImageResponse } from "next/og";
import { normalizeAvatar } from "@/lib/avatar";
import { timeLimitLabel } from "@/lib/game-settings";
import { fetchChallengeFromBackend } from "@/lib/backend-server";
import { OgCharacter, OgFrame, OgPill, OG_SIZE, ogFonts } from "@/lib/og";

// 챌린지 링크 공유 시 미리보기: 보낸 사람 닉네임 + 그 사람 캐릭터 색 + 게임 설정
export const alt = "Where I Am 도전장";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const challenge = await fetchChallengeFromBackend(id);

  const nickname = challenge?.creator.nickname ?? "친구";
  const avatar = challenge ? normalizeAvatar(challenge.creator.avatar) : undefined;
  const settings = challenge?.settings;
  const pills = settings
    ? [
        timeLimitLabel(settings.timeLimit),
        settings.allowMove ? "이동 허용" : "이동 금지",
        settings.allowPan ? "회전 허용" : "회전 금지",
        settings.allowZoom ? "확대 허용" : "확대 금지",
      ]
    : ["5라운드", "대한민국"];

  const heading = "도전장이 도착했어요!";
  const sub = `${nickname}님이 보낸 5개 장소, 어디일까요?`;
  const fonts = await ogFonts(heading + sub + pills.join("") + "WHERE I AM 챌린지");

  return new ImageResponse(
    (
      <OgFrame
        left={
          // Satori 는 Fragment 를 레이아웃 노드로 잘못 처리하므로 실제 div 로 감싼다
          <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
            <div style={{ display: "flex", width: "100%", wordBreak: "keep-all", fontSize: 30, color: "#c7d2fe", letterSpacing: 2 }}>WHERE I AM 챌린지</div>
            <div style={{ display: "flex", width: "100%", wordBreak: "keep-all", fontSize: 76, marginTop: 8, lineHeight: 1.1 }}>{heading}</div>
            <div style={{ display: "flex", width: "100%", wordBreak: "keep-all", fontSize: 36, marginTop: 22, color: "#e0e7ff", lineHeight: 1.3 }}>{sub}</div>
            <div style={{ display: "flex", width: "100%", flexWrap: "wrap", marginTop: 34 }}>
              {pills.map((p) => (
                <OgPill key={p}>{p}</OgPill>
              ))}
            </div>
          </div>
        }
        right={<OgCharacter avatar={avatar} scale={1.15} />}
      />
    ),
    { ...size, fonts }
  );
}

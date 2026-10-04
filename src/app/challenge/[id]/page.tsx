import type { Metadata } from "next";
import ChallengeController from "@/components/ChallengeController";
import { fetchChallengeFromBackend } from "@/lib/backend-server";
import { timeLimitLabel } from "@/lib/game-settings";

// 공유 미리보기용 제목/설명. 이미지는 같은 폴더의 opengraph-image.tsx 가 자동으로 붙는다.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const challenge = await fetchChallengeFromBackend(id);

  if (!challenge) {
    return {
      title: "도전장이 도착했어요! - Where I Am",
      description: "친구가 보낸 Where I Am 챌린지에 도전해보세요",
    };
  }

  const { nickname } = challenge.creator;
  const { settings } = challenge;
  const rules = [
    timeLimitLabel(settings.timeLimit),
    settings.allowMove ? "이동 허용" : "이동 금지",
    settings.allowPan ? "회전 허용" : "회전 금지",
    settings.allowZoom ? "확대 허용" : "확대 금지",
  ].join(" · ");
  const title = `${nickname}님의 도전장 - Where I Am`;
  const description = `${nickname}님이 보낸 5개 장소, 대한민국 어디일까요? ${rules}`;

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
  };
}

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChallengeController id={id} />;
}

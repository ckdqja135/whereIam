import type { Metadata } from "next";
import ChallengeController from "@/components/ChallengeController";

export const metadata: Metadata = {
  title: "도전장이 도착했어요! - Where I Am",
  description: "친구가 보낸 Where I Am 챌린지에 도전해보세요",
};

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChallengeController id={id} />;
}

import type { Metadata } from "next";
import RoomController from "@/components/room/RoomController";

export const metadata: Metadata = {
  title: "실시간 대결 초대 - Where I Am",
  description: "친구와 같은 5문제로 실시간 대결! 로드뷰를 보고 대한민국 어디인지 맞혀보세요",
};

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RoomController code={code} />;
}

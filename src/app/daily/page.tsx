import type { Metadata } from "next";
import DailyController from "@/components/daily/DailyController";

// 공유 미리보기용 제목/설명. 이미지는 같은 폴더의 opengraph-image.tsx 가 자동으로 붙는다.
// 카카오톡 등은 링크별로 미리보기를 오래 캐시하므로 날짜는 넣지 않는다
const title = "오늘의 문제 - Where I Am";
const description = "모두 같은 5곳, 로드뷰를 보고 대한민국 어디인지 맞혀보세요. 하루 한 번, 오늘의 순위에 도전!";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: "website" },
};

export default function DailyPage() {
  return <DailyController />;
}

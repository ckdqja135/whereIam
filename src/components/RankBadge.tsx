import { Medal } from "lucide-react";

// 1~3위는 금·은·동 메달, 그 아래는 숫자
const MEDAL_COLORS = ["text-yellow-400", "text-gray-300", "text-amber-600"];

export default function RankBadge({ rank, size = 20, numberClassName = "" }: { rank: number; size?: number; numberClassName?: string }) {
  const color = MEDAL_COLORS[rank - 1];
  if (color) return <Medal className={color} width={size} height={size} aria-label={`${rank}위`} />;
  return <span className={numberClassName}>{rank}</span>;
}

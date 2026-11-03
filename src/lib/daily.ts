// 오늘의 문제: 날짜 표시, 공유 문구, 이 브라우저에서 이미 푼 날 기록

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// "2026-11-03" → "11월 3일 (화)"
export function dailyLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일 (${weekday})`;
}

// 라운드 점수 등급 (5000점 만점. 대략 great 16km 안, good 50km 안, ok 120km 안)
export type RoundGrade = "great" | "good" | "ok" | "bad";

export function roundGrade(score: number): RoundGrade {
  if (score >= 4000) return "great";
  if (score >= 2500) return "good";
  if (score >= 1000) return "ok";
  return "bad";
}

// 공유 문구는 카카오톡·디스코드에 붙여넣는 글자라 칸 모양 이모지를 쓴다 (화면은 SVG 칸)
const GRADE_EMOJI: Record<RoundGrade, string> = { great: "🟩", good: "🟨", ok: "🟧", bad: "🟥" };

export function roundEmoji(score: number): string {
  return GRADE_EMOJI[roundGrade(score)];
}

export function dailyShareText(date: string, roundScores: number[], total: number): string {
  return [
    `Where I Am 오늘의 문제 · ${dailyLabel(date)}`,
    `${roundScores.map(roundEmoji).join("")} ${total.toLocaleString()}점`,
    "로드뷰 보고 여기가 어딘지 맞혀보세요!",
  ].join("\n");
}

// 공유: 휴대폰은 공유 창(카카오톡·디스코드 등), 안 되면 클립보드 복사
export async function shareDaily(text: string, url: string): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Where I Am 오늘의 문제", text, url });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      // 공유를 지원하지 않는 환경이면 복사로
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return "copied";
  } catch {
    return "failed";
  }
}

// 이 브라우저에서 그날 남긴 결과 (하루 한 번만 도전)
export interface DailyRecord {
  date: string;
  resultId: string;
  totalScore: number;
  rounds: number[];
  rank: number;
}

const key = (date: string) => `whereiam:daily:${date}`;

export function loadDailyRecord(date: string): DailyRecord | null {
  try {
    const raw = localStorage.getItem(key(date));
    if (!raw) return null;
    const r = JSON.parse(raw) as DailyRecord;
    return r.date === date && Array.isArray(r.rounds) ? r : null;
  } catch {
    return null;
  }
}

export function saveDailyRecord(record: DailyRecord): void {
  try {
    localStorage.setItem(key(record.date), JSON.stringify(record));
  } catch {
    // 무시 (사생활 보호 모드 등)
  }
}

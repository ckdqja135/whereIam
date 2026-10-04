import type { GameSettings } from "./api-types";

export type { GameSettings };

export const DEFAULT_SETTINGS: GameSettings = {
  timeLimit: 120,
  allowMove: true,
  allowPan: true,
  allowZoom: true,
};

export const TIME_LIMIT_OPTIONS = [
  { value: 60, label: "1분" },
  { value: 120, label: "2분" },
  { value: 300, label: "5분" },
  { value: 600, label: "10분" },
  { value: 0, label: "무제한" },
];

export function timeLimitLabel(seconds: number): string {
  if (seconds === 0) return "시간 제한 없음";
  return `${TIME_LIMIT_OPTIONS.find((o) => o.value === seconds)?.label ?? `${seconds}초`} 제한`;
}

const SETTINGS_KEY = "whereiam:settings";

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw) as Partial<GameSettings>;
    return {
      timeLimit: TIME_LIMIT_OPTIONS.some((o) => o.value === p.timeLimit) ? p.timeLimit! : DEFAULT_SETTINGS.timeLimit,
      allowMove: p.allowMove ?? true,
      allowPan: p.allowPan ?? true,
      allowZoom: p.allowZoom ?? true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 무시
  }
}

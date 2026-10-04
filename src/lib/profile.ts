import { Avatar, normalizeAvatar, randomAvatar } from "./avatar";

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 12;

export interface Profile {
  nickname: string;
  avatar: Avatar;
}

export function validateNickname(nickname: string): string | null {
  const trimmed = nickname.trim();
  if (trimmed.length < NICKNAME_MIN) return `닉네임은 ${NICKNAME_MIN}자 이상이어야 합니다.`;
  if (trimmed.length > NICKNAME_MAX) return `닉네임은 ${NICKNAME_MAX}자 이하여야 합니다.`;
  return null;
}

// 로그인 도입 전까지 프로필은 브라우저에만 저장한다.
const STORAGE_KEY = "whereiam:profile";

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { nickname?: unknown; avatar?: unknown };
    if (typeof parsed.nickname !== "string") return null;
    // 이전 버전(이모지 캐릭터)으로 저장된 프로필은 아바타를 새로 뽑아준다
    const avatar = parsed.avatar ? normalizeAvatar(parsed.avatar) : randomAvatar();
    return { nickname: parsed.nickname, avatar };
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // 저장 실패(시크릿 모드 등)는 무시하고 이번 세션에서만 사용
  }
}

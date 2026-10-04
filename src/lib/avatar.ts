// SD 캐릭터 커스터마이즈 데이터. 서버/DB에는 이 JSON 그대로 저장된다.

export const SKIN_COLORS = ["#FFE0C7", "#F9D0B0", "#EDB98A", "#D08B5B", "#AE5D29", "#7A4A2A"];
export const HAIR_COLORS = ["#2B2B2B", "#5A3825", "#A0522D", "#E3B04B", "#F2E3B3", "#D95B5B", "#6C8CD5", "#B48EE0"];
export const OUTFIT_COLORS = ["#FF6B6B", "#FFA94D", "#FFD43B", "#69DB7C", "#38D9A9", "#4DABF7", "#748FFC", "#DA77F2", "#F783AC", "#F8F9FA"];
export const PANTS_COLORS = ["#364FC7", "#495057", "#212529", "#8D6E63", "#2B8A3E", "#C2255C"];

export const HAIR_STYLES = ["숏컷", "단발", "삐죽머리", "포니테일", "똥머리", "긴머리"] as const;
export const EYE_STYLES = ["동글", "반짝", "웃는눈", "졸린눈"] as const;
export const HATS = ["없음", "비니", "야구모자", "고깔모자", "왕관"] as const;

export interface Avatar {
  skin: number;
  hairStyle: number;
  hairColor: number;
  eyes: number;
  hat: number;
  outfitColor: number;
  pantsColor: number;
}

export const AVATAR_LIMITS: Record<keyof Avatar, number> = {
  skin: SKIN_COLORS.length,
  hairStyle: HAIR_STYLES.length,
  hairColor: HAIR_COLORS.length,
  eyes: EYE_STYLES.length,
  hat: HATS.length,
  outfitColor: OUTFIT_COLORS.length,
  pantsColor: PANTS_COLORS.length,
};

const KEYS = Object.keys(AVATAR_LIMITS) as (keyof Avatar)[];

function randInt(n: number): number {
  return Math.floor(Math.random() * n);
}

export function randomAvatar(): Avatar {
  const avatar = {} as Avatar;
  for (const key of KEYS) avatar[key] = randInt(AVATAR_LIMITS[key]);
  // 모자는 절반 확률로 없음
  if (Math.random() < 0.5) avatar.hat = 0;
  return avatar;
}

// 외부(저장소, 서버 응답)에서 들어온 값을 안전한 Avatar로 보정
export function normalizeAvatar(value: unknown): Avatar {
  const src = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const avatar = {} as Avatar;
  for (const key of KEYS) {
    const v = src[key];
    avatar[key] =
      typeof v === "number" && Number.isInteger(v) && v >= 0 && v < AVATAR_LIMITS[key] ? v : 0;
  }
  return avatar;
}

export function avatarKey(avatar: Avatar): string {
  return KEYS.map((k) => avatar[k]).join("-");
}

export function cycleAvatar(avatar: Avatar, key: keyof Avatar, dir: 1 | -1): Avatar {
  const n = AVATAR_LIMITS[key];
  return { ...avatar, [key]: (avatar[key] + dir + n) % n };
}

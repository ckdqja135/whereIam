import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// URL-safe 랜덤 ID (기본 16자, A-Za-z0-9). alphabet 을 넘기면 그 문자들로만 만든다 (256자 이하).
export function generateId(size = 16, alphabet = ALPHABET): string {
  // alphabet 길이의 배수 중 256 이하 최댓값. 이 이상인 바이트는 버려서 문자 분포를 균등하게 맞춘다.
  const limit = 256 - (256 % alphabet.length);
  let id = '';
  while (id.length < size) {
    for (const byte of randomBytes(size * 2)) {
      if (byte >= limit) continue;
      id += alphabet[byte % alphabet.length];
      if (id.length === size) break;
    }
  }
  return id;
}

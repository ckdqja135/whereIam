import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
// 62의 배수 중 256 이하 최댓값. 이 이상인 바이트는 버려서 문자 분포를 균등하게 맞춘다.
const LIMIT = 256 - (256 % ALPHABET.length);

// URL-safe 랜덤 ID (기본 16자, A-Za-z0-9)
export function generateId(size = 16): string {
  let id = '';
  while (id.length < size) {
    for (const byte of randomBytes(size * 2)) {
      if (byte >= LIMIT) continue;
      id += ALPHABET[byte % ALPHABET.length];
      if (id.length === size) break;
    }
  }
  return id;
}

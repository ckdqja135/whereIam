import type { ConfigService } from '@nestjs/config';

// 방 진행/접속 판정에 쓰는 시간 값 (ms).
// 실서비스에서는 기본값을 쓰고, 테스트에서만 환경 변수로 줄여서 빠르게 확인한다.
export interface RoomTimings {
  longPollMs: number; // 롱 폴링 최대 대기 (ROOM_LONGPOLL_MS)
  revealMs: number; // 라운드 결과 공개 후 다음 라운드로 자동 진행까지 (ROOM_REVEAL_MS)
  graceMs: number; // 라운드 제한 시간에 더해 주는 여유 (네트워크 지연 보정, ROOM_GRACE_MS)
  secondMs: number; // 제한 시간 1초의 길이. 테스트에서 60초 제한을 짧게 돌릴 때만 바꾼다 (ROOM_SECOND_MS)
  disconnectMs: number; // 마지막 요청 후 이 시간이 지나면 접속 끊김 (ROOM_DISCONNECT_MS)
  lobbyKickMs: number; // 대기실에서 접속이 끊긴 채 이 시간이 지나면 내보냄 (ROOM_LOBBY_KICK_MS)
  idleMs: number; // 접속 중인 사람이 없는 채 이 시간이 지나면 방 삭제 (ROOM_IDLE_MS)
  finishedTtlMs: number; // 게임이 끝나고 이 시간이 지나면 방 삭제 (ROOM_FINISHED_TTL_MS)
  sweepMs: number; // 접속 상태/방 정리 주기 (ROOM_SWEEP_MS)
}

const DEFAULTS: RoomTimings = {
  longPollMs: 25_000,
  revealMs: 20_000,
  graceMs: 2_000,
  secondMs: 1_000,
  disconnectMs: 40_000,
  lobbyKickMs: 60_000,
  idleMs: 5 * 60_000,
  finishedTtlMs: 30 * 60_000,
  sweepMs: 5_000,
};

const ENV_NAMES: Record<keyof RoomTimings, string> = {
  longPollMs: 'ROOM_LONGPOLL_MS',
  revealMs: 'ROOM_REVEAL_MS',
  graceMs: 'ROOM_GRACE_MS',
  secondMs: 'ROOM_SECOND_MS',
  disconnectMs: 'ROOM_DISCONNECT_MS',
  lobbyKickMs: 'ROOM_LOBBY_KICK_MS',
  idleMs: 'ROOM_IDLE_MS',
  finishedTtlMs: 'ROOM_FINISHED_TTL_MS',
  sweepMs: 'ROOM_SWEEP_MS',
};

export function loadRoomTimings(config: ConfigService): RoomTimings {
  const timings = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof RoomTimings)[]) {
    const raw = config.get<string>(ENV_NAMES[key]);
    if (raw === undefined || raw.trim() === '') continue;
    const value = Number(raw);
    // 0 이상 정수만 받는다 (graceMs 는 0 가능). 이상한 값이면 기본값 유지
    if (Number.isInteger(value) && value >= 0) timings[key] = value;
  }
  return timings;
}

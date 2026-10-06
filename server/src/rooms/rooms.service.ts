import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Avatar, ChallengeLocation, GameSettings, Guess, ItemId } from '../challenges/challenge.types';
import { generateId } from '../challenges/id';
import { MAX_ITEMS_PER_GAME } from '../challenges/items';
import { haversineKm, ROUNDS_PER_GAME, scoreGuesses } from '../challenges/score';
import { CreateRoomDto, JoinRoomDto } from './dto/create-room.dto';
import { RoomStartDto } from './dto/lobby.dto';
import { RoomAttackDto, RoomAwayDto, RoomGuessDto, RoomPositionDto } from './dto/round.dto';
import { loadRoomTimings, RoomTimings } from './room.config';
import {
  ROOM_MAX_PLAYERS,
  ROOM_MIN_PLAYERS,
  ROOM_ATTACK_DURATION_MS,
  ROOM_ATTACKS_PER_ROUND,
  ROOM_SYSTEM_PLAYER_ID,
  RoomAttack,
  RoomChatMessage,
  RoomJoinResponse,
  RoomRoundPlayerResult,
  RoomRoundResult,
  RoomState,
  RoomStatus,
} from './room.types';

// 방 코드: 헷갈리는 문자(I, L, O, 0, 1)를 뺀 6자리
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
// 동시에 존재할 수 있는 방 개수 상한 (메모리 보호)
const MAX_ROOMS = 500;
// 보고된 파노라마 좌표가 저장된 위치에서 이 거리(km) 안일 때만 정답 보정
const POSITION_CORRECTION_KM = 1;
// 채팅: 방마다 최근 메시지만 보관, 한 사람이 너무 빨리 보내지 못하게 간격 제한
const CHAT_HISTORY = 50;
const CHAT_MIN_INTERVAL_MS = 700;

interface Submission {
  guess: Guess;
  items: ItemId[];
}

interface InternalPlayer {
  id: string;
  token: string;
  nickname: string;
  avatar: Avatar;
  ready: boolean;
  left: boolean;
  // 마지막으로 계산한 접속 여부 (바뀔 때 version 을 올리기 위해 저장)
  connected: boolean;
  lastSeen: number;
  // 진행 중인 롱 폴링 요청 수. 기다리는 동안에도 접속 중으로 본다
  polling: number;
  totalScore: number;
  itemsUsed: number;
  // 라운드 진행 중 다른 탭/창으로 나간 횟수 (게임마다 초기화)
  awayCount: number;
  lastChatAt: number;
  // 현재 라운드 제출 (라운드가 끝나면 미제출자는 { guess: null, items: [] } 로 채운다)
  submission: Submission | null;
}

interface Room {
  code: string;
  version: number;
  status: RoomStatus;
  hostId: string;
  settings: GameSettings;
  players: InternalPlayer[]; // 들어온 순서
  round: number;
  locations: ChallengeLocation[];
  corrected: boolean[]; // 라운드별 정답 좌표 보정 여부
  rounds: RoomRoundResult[];
  roundDeadline: number | null;
  revealDeadline: number | null;
  finishedAt: number | null;
  // 마지막으로 접속 중인 사람이 있었던 시각 (아무도 없는 방 정리용)
  lastConnectedAt: number;
  roundTimer: NodeJS.Timeout | null;
  revealTimer: NodeJS.Timeout | null;
  // 롱 폴링 대기자. 상태가 바뀌면 모두 깨운다
  waiters: Set<() => void>;
  chat: RoomChatMessage[];
  nextChatId: number;
  // 방장이 내보낸 사람의 토큰 (같은 토큰으로 다시 들어오거나 계속 조회하지 못하게)
  kickedTokens: Set<string>;
  // 현재 라운드 방해 아이템 기록 (라운드 시작 시 비움)
  attacks: RoomAttack[];
  nextAttackId: number;
}

// 실시간 대결 방. 상태는 메모리에만 있다 (PM2 fork 모드 1개 프로세스 전제, 재시작하면 사라짐).
@Injectable()
export class RoomsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoomsService.name);
  private readonly rooms = new Map<string, Room>();
  private readonly timings: RoomTimings;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(config: ConfigService) {
    this.timings = loadRoomTimings(config);
  }

  onModuleInit() {
    this.sweepTimer = setInterval(() => this.sweep(), Math.max(100, this.timings.sweepMs));
    this.sweepTimer.unref();
  }

  // pm2 reload 등으로 종료될 때 타이머를 모두 정리하고, 기다리던 롱 폴링은 바로 응답시킨다
  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    for (const room of this.rooms.values()) {
      this.clearTimers(room);
      this.wake(room);
    }
  }

  // ───────────── 방 만들기 / 참가 ─────────────

  create(dto: CreateRoomDto): RoomJoinResponse {
    if (this.rooms.size >= MAX_ROOMS) {
      throw new ServiceUnavailableException('지금은 방을 더 만들 수 없습니다. 잠시 후 다시 시도해 주세요');
    }
    let code: string;
    do {
      code = generateId(CODE_LENGTH, CODE_ALPHABET);
    } while (this.rooms.has(code));

    const host = this.newPlayer(dto.player);
    const room: Room = {
      code,
      version: 1,
      status: 'lobby',
      hostId: host.id,
      settings: toSettings(dto.settings),
      players: [host],
      round: 0,
      locations: [],
      corrected: [],
      rounds: [],
      roundDeadline: null,
      revealDeadline: null,
      finishedAt: null,
      lastConnectedAt: Date.now(),
      roundTimer: null,
      revealTimer: null,
      waiters: new Set(),
      chat: [],
      nextChatId: 1,
      kickedTokens: new Set(),
      attacks: [],
      nextAttackId: 1,
    };
    this.rooms.set(code, room);
    return { code, playerId: host.id, token: host.token, state: this.buildState(room, host.id) };
  }

  join(rawCode: string, dto: JoinRoomDto): RoomJoinResponse {
    const room = this.getRoom(rawCode);
    if (room.status !== 'lobby') throw new ConflictException('이미 시작된 방입니다');
    if (room.players.length >= ROOM_MAX_PLAYERS) throw new ConflictException('방이 가득 찼습니다');

    const player = this.newPlayer(dto.player);
    room.players.push(player);
    room.lastConnectedAt = Date.now();
    this.changed(room);
    return { code: room.code, playerId: player.id, token: player.token, state: this.buildState(room, player.id) };
  }

  // ───────────── 상태 조회 (롱 폴링) ─────────────

  // since 가 없거나 현재 version 과 다르면 바로 응답, 같으면 바뀌거나 longPollMs 가 지날 때까지 기다린다
  async getState(rawCode: string, token: string | undefined, since: number | undefined, signal: AbortSignal) {
    const room = this.getRoom(rawCode);
    const player = this.auth(room, token, true);
    if (since === undefined || since !== room.version) return this.buildState(room, player.id);

    player.polling++;
    try {
      await this.waitForChange(room, signal);
    } finally {
      player.polling--;
      player.lastSeen = Date.now();
    }
    // 기다리는 동안 방이 지워졌거나 내보내졌을 수 있으니 다시 확인
    const current = this.getRoom(rawCode);
    const me = this.auth(current, token, true);
    return this.buildState(current, me.id);
  }

  // ───────────── 대기실 ─────────────

  setReady(rawCode: string, token: string | undefined, ready: boolean): RoomState {
    const room = this.getRoom(rawCode);
    const player = this.auth(room, token);
    this.assertStatus(room, 'lobby', '대기실에서만 준비할 수 있습니다');
    if (player.id !== room.hostId && player.ready !== ready) {
      player.ready = ready;
      this.changed(room);
    }
    return this.buildState(room, player.id);
  }

  updateSettings(rawCode: string, token: string | undefined, settings: GameSettings): RoomState {
    const room = this.getRoom(rawCode);
    const player = this.auth(room, token);
    this.assertHost(room, player);
    this.assertStatus(room, 'lobby', '대기실에서만 설정을 바꿀 수 있습니다');

    room.settings = toSettings(settings);
    // 설정이 바뀌면 참가자들이 다시 확인하고 준비하도록 준비 상태를 초기화
    for (const p of room.players) if (p.id !== room.hostId) p.ready = false;
    this.changed(room);
    return this.buildState(room, player.id);
  }

  start(rawCode: string, token: string | undefined, dto: RoomStartDto): RoomState {
    const room = this.getRoom(rawCode);
    const player = this.auth(room, token);
    this.assertHost(room, player);
    this.assertStatus(room, 'lobby', '이미 시작된 방입니다');

    const connected = room.players.filter((p) => !p.left && p.connected);
    if (connected.length < ROOM_MIN_PLAYERS) {
      throw new ConflictException(`${ROOM_MIN_PLAYERS}명 이상 모여야 시작할 수 있어요`);
    }
    if (room.players.some((p) => p.id !== room.hostId && !p.ready)) {
      throw new ConflictException('모든 참가자가 준비해야 시작할 수 있어요');
    }

    room.locations = dto.locations.map(({ lat, lng, panoId }) => ({ lat, lng, panoId }));
    room.corrected = room.locations.map(() => false);
    room.rounds = [];
    room.finishedAt = null;
    for (const p of room.players) {
      p.totalScore = 0;
      p.itemsUsed = 0;
      p.awayCount = 0;
      p.submission = null;
    }
    this.startRound(room, 1);
    return this.buildState(room, player.id);
  }

  // ───────────── 라운드 진행 ─────────────

  // 클라이언트가 실제로 열린 파노라마 좌표를 알려주면 정답 좌표를 그 위치로 보정한다 (라운드당 한 번)
  reportPosition(rawCode: string, token: string | undefined, dto: RoomPositionDto): void {
    const room = this.getRoom(rawCode);
    this.auth(room, token);
    if (room.status !== 'playing' || dto.round !== room.round) return;
    const index = room.round - 1;
    const loc = room.locations[index];
    if (!loc || room.corrected[index]) return;
    if (haversineKm(loc.lat, loc.lng, dto.lat, dto.lng) > POSITION_CORRECTION_KM) return;

    room.locations[index] = { lat: dto.lat, lng: dto.lng, panoId: loc.panoId };
    room.corrected[index] = true;
    this.changed(room);
  }

  guess(rawCode: string, token: string | undefined, dto: RoomGuessDto): RoomState {
    const room = this.getRoom(rawCode);
    const player = this.auth(room, token);
    if (room.status !== 'playing') throw new ConflictException('진행 중인 라운드가 없습니다');
    if (dto.round !== room.round) throw new ConflictException('현재 라운드가 아닙니다');
    if (player.submission) throw new ConflictException('이미 제출했습니다');

    // 알 수 없는 id / 라운드 안 중복은 DTO 에서 400 처리
    const items = [...dto.items];
    if (items.length > 0 && !room.settings.itemMode) {
      throw new BadRequestException('노템 모드에서는 아이템을 사용할 수 없습니다');
    }
    if (player.itemsUsed + items.length > MAX_ITEMS_PER_GAME) {
      throw new BadRequestException(`아이템은 게임당 최대 ${MAX_ITEMS_PER_GAME}개까지 쓸 수 있습니다`);
    }

    player.submission = { guess: dto.guess ? { lat: dto.guess.lat, lng: dto.guess.lng } : null, items };
    player.itemsUsed += items.length;
    this.changed(room);
    if (this.allActiveSubmitted(room)) this.endRound(room);
    return this.buildState(room, player.id);
  }

  // 부정행위 감지: 라운드 진행 중(제출 전) 다른 탭/창으로 나가면 횟수를 올려 모두에게 보여준다
  reportAway(rawCode: string, token: string | undefined, dto: RoomAwayDto): void {
    const room = this.getRoom(rawCode);
    const player = this.auth(room, token);
    if (room.status !== 'playing' || dto.round !== room.round || player.submission) return;
    player.awayCount++;
    this.changed(room);
  }

  chat(rawCode: string, token: string | undefined, rawText: string): RoomState {
    const room = this.getRoom(rawCode);
    const player = this.auth(room, token);
    // 제어 문자 제거, 공백 정리
    const text = rawText.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) throw new BadRequestException('메시지를 입력해 주세요');
    const now = Date.now();
    if (now - player.lastChatAt < CHAT_MIN_INTERVAL_MS) throw new ConflictException('조금 천천히 보내 주세요');
    player.lastChatAt = now;
    this.pushChat(room, player.id, player.nickname, text, now);
    this.changed(room);
    return this.buildState(room, player.id);
  }

  // 방해 아이템: 아이템 모드에서 라운드마다 3번, 아직 제출하지 않은 다른 참가자에게만
  attack(rawCode: string, token: string | undefined, dto: RoomAttackDto): RoomState {
    const room = this.getRoom(rawCode);
    const player = this.auth(room, token);
    if (!room.settings.itemMode) throw new BadRequestException('아이템 모드에서만 방해할 수 있습니다');
    if (room.status !== 'playing') throw new ConflictException('진행 중인 라운드가 없습니다');
    if (dto.round !== room.round) throw new ConflictException('현재 라운드가 아닙니다');
    if (dto.targetId === player.id) throw new BadRequestException('자기 자신은 방해할 수 없습니다');
    const target = room.players.find((p) => p.id === dto.targetId && !p.left);
    if (!target) throw new NotFoundException('참가자를 찾을 수 없습니다');
    if (target.submission) throw new ConflictException('이미 제출한 사람은 방해할 수 없어요');
    const used = room.attacks.filter((a) => a.fromId === player.id).length;
    if (used >= ROOM_ATTACKS_PER_ROUND) {
      throw new ConflictException(`방해 아이템은 라운드마다 ${ROOM_ATTACKS_PER_ROUND}번까지 쓸 수 있어요`);
    }

    const now = Date.now();
    room.attacks.push({
      id: room.nextAttackId++,
      type: dto.type,
      fromId: player.id,
      toId: target.id,
      at: now,
      until: now + ROOM_ATTACK_DURATION_MS[dto.type],
    });
    this.changed(room);
    return this.buildState(room, player.id);
  }

  // 방장이 대기실에서 참가자를 내보낸다
  kick(rawCode: string, token: string | undefined, targetId: string): RoomState {
    const room = this.getRoom(rawCode);
    const player = this.auth(room, token);
    this.assertHost(room, player);
    this.assertStatus(room, 'lobby', '대기실에서만 내보낼 수 있습니다');
    if (targetId === player.id) throw new BadRequestException('자기 자신은 내보낼 수 없습니다');
    const target = room.players.find((p) => p.id === targetId);
    if (!target) throw new NotFoundException('참가자를 찾을 수 없습니다');

    room.players = room.players.filter((p) => p.id !== target.id);
    room.kickedTokens.add(target.token);
    this.pushChat(room, ROOM_SYSTEM_PLAYER_ID, '', `${target.nickname}님이 방에서 내보내졌어요`, Date.now());
    this.changed(room);
    return this.buildState(room, player.id);
  }

  next(rawCode: string, token: string | undefined): RoomState {
    const room = this.getRoom(rawCode);
    const player = this.auth(room, token);
    this.assertHost(room, player);
    this.assertStatus(room, 'reveal', '결과 공개 중에만 다음 라운드로 넘어갈 수 있습니다');
    this.advance(room);
    return this.buildState(room, player.id);
  }

  rematch(rawCode: string, token: string | undefined): RoomState {
    const room = this.getRoom(rawCode);
    const player = this.auth(room, token);
    this.assertHost(room, player);
    this.assertStatus(room, 'finished', '게임이 끝난 뒤에만 다시 할 수 있습니다');

    this.clearTimers(room);
    room.players = room.players.filter((p) => !p.left);
    room.status = 'lobby';
    room.round = 0;
    room.locations = [];
    room.corrected = [];
    room.rounds = [];
    room.roundDeadline = null;
    room.revealDeadline = null;
    room.finishedAt = null;
    for (const p of room.players) {
      p.totalScore = 0;
      p.itemsUsed = 0;
      p.awayCount = 0;
      p.submission = null;
      if (p.id !== room.hostId) p.ready = false;
    }
    this.changed(room);
    return this.buildState(room, player.id);
  }

  leave(rawCode: string, token: string | undefined): void {
    const room = this.getRoom(rawCode);
    const player = this.auth(room, token, true);
    if (player.left) return;

    if (room.status === 'lobby') {
      room.players = room.players.filter((p) => p.id !== player.id);
    } else {
      // 게임 도중에는 결과를 남기기 위해 표시만 한다
      player.left = true;
    }

    if (!room.players.some((p) => !p.left)) {
      this.deleteRoom(room);
      return;
    }
    if (room.hostId === player.id) this.transferHost(room, false);
    this.changed(room);
    if (room.status === 'playing' && this.allActiveSubmitted(room)) this.endRound(room);
  }

  // ───────────── 상태 전환 ─────────────

  private startRound(room: Room, round: number) {
    this.clearTimers(room);
    const now = Date.now();
    room.status = 'playing';
    room.round = round;
    room.revealDeadline = null;
    for (const p of room.players) p.submission = null;
    room.attacks = [];

    const { timeLimit } = room.settings;
    room.roundDeadline = timeLimit > 0 ? now + timeLimit * this.timings.secondMs + this.timings.graceMs : null;
    if (room.roundDeadline !== null) {
      room.roundTimer = setTimeout(() => {
        // 오래된 타이머 방지: 같은 방, 같은 라운드가 아직 진행 중일 때만
        if (this.rooms.get(room.code) !== room || room.status !== 'playing' || room.round !== round) return;
        this.endRound(room);
      }, room.roundDeadline - now);
    }
    this.changed(room);
  }

  // 미제출자는 null 로 처리하고 점수를 매겨 결과 공개 상태로 넘어간다
  private endRound(room: Room) {
    this.clearTimers(room);
    const round = room.round;
    const answer = room.locations[round - 1];
    const results: RoomRoundPlayerResult[] = room.players.map((p) => {
      const submission = p.submission ?? { guess: null, items: [] };
      p.submission = submission;
      // 챌린지와 같은 계산식 (아이템 감점 반영, 0점 미만 없음)
      const [scored] = scoreGuesses([answer], [submission.guess], [submission.items]).rounds;
      p.totalScore += scored.score;
      return {
        playerId: p.id,
        guess: submission.guess,
        distanceKm: scored.distanceKm,
        score: scored.score,
        penalty: scored.penalty,
        items: submission.items,
      };
    });
    room.rounds.push({ round, answer: { ...answer }, results });

    const now = Date.now();
    room.status = 'reveal';
    room.roundDeadline = null;
    room.revealDeadline = now + this.timings.revealMs;
    room.revealTimer = setTimeout(() => {
      if (this.rooms.get(room.code) !== room || room.status !== 'reveal' || room.round !== round) return;
      this.advance(room);
    }, this.timings.revealMs);
    this.changed(room);
  }

  // 결과 공개 → 다음 라운드 또는 게임 종료
  private advance(room: Room) {
    if (room.round < ROUNDS_PER_GAME) {
      this.startRound(room, room.round + 1);
      return;
    }
    this.clearTimers(room);
    room.status = 'finished';
    room.roundDeadline = null;
    room.revealDeadline = null;
    room.finishedAt = Date.now();
    this.changed(room);
  }

  // ───────────── 접속 상태 / 방 정리 ─────────────

  private sweep() {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      let dirty = false;
      for (const p of room.players) {
        const connected = this.isConnected(p, now);
        if (connected !== p.connected) {
          p.connected = connected;
          dirty = true;
        }
        if (connected && !p.left) room.lastConnectedAt = now;
      }

      if (room.status === 'lobby') {
        // 대기실에서 오래 끊긴 사람은 내보낸다
        const before = room.players.length;
        room.players = room.players.filter((p) => this.isConnected(p, now) || now - p.lastSeen <= this.timings.lobbyKickMs);
        if (room.players.length !== before) {
          if (room.players.length === 0) {
            this.deleteRoom(room);
            continue;
          }
          if (!room.players.some((p) => p.id === room.hostId)) this.transferHost(room, false);
          dirty = true;
        }
      } else {
        // 게임 중 방장이 끊기면 접속 중인 사람에게 넘긴다 (다음 라운드/다시 하기 진행용)
        const host = room.players.find((p) => p.id === room.hostId);
        if (!host || host.left || !host.connected) dirty = this.transferHost(room, true) || dirty;
      }

      if (room.status === 'finished' && room.finishedAt !== null && now - room.finishedAt > this.timings.finishedTtlMs) {
        this.deleteRoom(room);
        continue;
      }
      if (now - room.lastConnectedAt > this.timings.idleMs) {
        this.deleteRoom(room);
        continue;
      }

      if (dirty) this.changed(room);
      // 남은 사람이 모두 제출했다면 (누군가 끊긴 경우) 라운드 종료
      if (room.status === 'playing' && this.allActiveSubmitted(room)) this.endRound(room);
    }
  }

  private isConnected(p: InternalPlayer, now: number): boolean {
    return p.polling > 0 || now - p.lastSeen < this.timings.disconnectMs;
  }

  // 나가지 않았고 접속 중인 사람이 모두 제출했는지
  private pushChat(room: Room, playerId: string, nickname: string, text: string, at: number) {
    room.chat.push({ id: room.nextChatId++, playerId, nickname, text, at });
    if (room.chat.length > CHAT_HISTORY) room.chat.splice(0, room.chat.length - CHAT_HISTORY);
  }

  private allActiveSubmitted(room: Room): boolean {
    const active = room.players.filter((p) => !p.left && p.connected);
    return active.length > 0 && active.every((p) => p.submission !== null);
  }

  // 먼저 들어온 순서대로, 나가지 않은 (requireConnected 면 접속 중인) 사람에게 방장을 넘긴다. 바뀌었으면 true
  private transferHost(room: Room, requireConnected: boolean): boolean {
    const next = room.players.find((p) => !p.left && (!requireConnected || p.connected));
    if (!next || next.id === room.hostId) return false;
    room.hostId = next.id;
    return true;
  }

  private deleteRoom(room: Room) {
    this.clearTimers(room);
    if (this.rooms.get(room.code) === room) this.rooms.delete(room.code);
    // 기다리던 롱 폴링은 깨워서 404 로 응답시킨다
    this.wake(room);
  }

  // ───────────── 공통 ─────────────

  private newPlayer(info: { nickname: string; avatar: Avatar }): InternalPlayer {
    const a = info.avatar;
    return {
      id: generateId(12),
      token: generateId(32),
      nickname: info.nickname,
      avatar: {
        skin: a.skin,
        hairStyle: a.hairStyle,
        hairColor: a.hairColor,
        eyes: a.eyes,
        hat: a.hat,
        outfitColor: a.outfitColor,
        pantsColor: a.pantsColor,
      },
      ready: false,
      left: false,
      connected: true,
      lastSeen: Date.now(),
      polling: 0,
      totalScore: 0,
      itemsUsed: 0,
      awayCount: 0,
      lastChatAt: 0,
      submission: null,
    };
  }

  private getRoom(rawCode: string): Room {
    const room = this.rooms.get(rawCode.trim().toUpperCase());
    if (!room) throw new NotFoundException('방을 찾을 수 없습니다');
    return room;
  }

  // X-Player-Token 으로 플레이어를 찾고 접속 시각을 갱신한다.
  // 게임 도중 나간 사람은 상태 조회/나가기만 할 수 있다 (allowLeft)
  private auth(room: Room, token: string | undefined, allowLeft = false): InternalPlayer {
    if (token && room.kickedTokens.has(token)) throw new ForbiddenException('방장이 방에서 내보냈어요');
    const player = token ? room.players.find((p) => p.token === token) : undefined;
    if (!player) throw new ForbiddenException('이 방의 참가자가 아닙니다');
    if (player.left && !allowLeft) throw new ForbiddenException('이미 방을 나갔습니다');

    const now = Date.now();
    player.lastSeen = now;
    if (!player.left) room.lastConnectedAt = now;
    if (!player.connected) {
      player.connected = true;
      this.changed(room);
    }
    return player;
  }

  private assertHost(room: Room, player: InternalPlayer) {
    if (room.hostId !== player.id) throw new ForbiddenException('방장만 할 수 있습니다');
  }

  private assertStatus(room: Room, status: RoomStatus, message: string) {
    if (room.status !== status) throw new ConflictException(message);
  }

  private changed(room: Room) {
    room.version++;
    this.wake(room);
  }

  private wake(room: Room) {
    const waiters = [...room.waiters];
    room.waiters.clear();
    for (const done of waiters) done();
  }

  private waitForChange(room: Room, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) return resolve();
      const done = () => {
        clearTimeout(timer);
        room.waiters.delete(done);
        signal.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, this.timings.longPollMs);
      room.waiters.add(done);
      signal.addEventListener('abort', done, { once: true });
    });
  }

  private clearTimers(room: Room) {
    if (room.roundTimer) clearTimeout(room.roundTimer);
    if (room.revealTimer) clearTimeout(room.revealTimer);
    room.roundTimer = null;
    room.revealTimer = null;
  }

  // 요청한 플레이어 기준 상태. 진행 중에는 다른 사람의 추측을 절대 내보내지 않는다 (제출 여부만)
  private buildState(room: Room, me: string): RoomState {
    const showLocation = room.status === 'playing' || room.status === 'reveal';
    return {
      code: room.code,
      version: room.version,
      status: room.status,
      me,
      hostId: room.hostId,
      settings: { ...room.settings },
      players: room.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        avatar: { ...p.avatar },
        isHost: p.id === room.hostId,
        ready: p.id === room.hostId || p.ready,
        connected: p.connected,
        left: p.left,
        totalScore: p.totalScore,
        submitted: p.submission !== null,
        itemsUsed: p.itemsUsed,
        awayCount: p.awayCount,
      })),
      round: room.round,
      totalRounds: ROUNDS_PER_GAME,
      location: showLocation ? { ...room.locations[room.round - 1] } : null,
      roundDeadline: room.roundDeadline,
      revealDeadline: room.revealDeadline,
      serverNow: Date.now(),
      rounds: room.rounds,
      chat: room.chat,
      attacks: room.status === 'playing' ? room.attacks : [],
    };
  }
}

// DTO 인스턴스를 순수 객체로. itemMode 는 항상 boolean 으로 저장 (없으면 노템)
function toSettings(s: GameSettings): GameSettings {
  return {
    timeLimit: s.timeLimit,
    allowMove: s.allowMove,
    allowPan: s.allowPan,
    allowZoom: s.allowZoom,
    itemMode: s.itemMode ?? false,
  };
}

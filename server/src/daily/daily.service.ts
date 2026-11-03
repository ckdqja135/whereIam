import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Avatar, ChallengeLocation, GameSettings, Guess, LeaderboardEntry, PlayerInfo, RoundScore } from '../challenges/challenge.types';
import { generateId } from '../challenges/id';
import { scoreGuesses } from '../challenges/score';
import { DatabaseService } from '../database/database.service';
import { QuizPoolService } from '../quiz/quiz-pool.service';
import type {
  DailyFinishResponse,
  DailyGuessResponse,
  DailyInfoResponse,
  DailyLeaderboardResponse,
  DailyRoundStartResponse,
  DailyStartResponse,
} from './daily.types';

export const DAILY_ROUNDS = 5;
// 모두 같은 규칙: 라운드당 2분, 이동·회전·확대 허용, 아이템 없음
export const DAILY_SETTINGS: GameSettings = {
  timeLimit: 120,
  allowMove: true,
  allowPan: true,
  allowZoom: true,
  itemMode: false,
  gameType: 'classic',
};
// 제한 시간이 지난 뒤에도 이만큼은 받아준다 (네트워크 지연)
const GRACE_MS = 5_000;
// 한 판은 메모리에만 둔다 (재시작하면 사라짐). 2시간 지나면 만료, 동시에 보관하는 수 상한
const SESSION_TTL_MS = 2 * 60 * 60_000;
const MAX_SESSIONS = 5000;
const LEADERBOARD_LIMIT = 50;
const KST_OFFSET_MS = 9 * 60 * 60_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface DailySession {
  date: string;
  locations: ChallengeLocation[];
  startedAt: (number | null)[]; // 라운드를 연 시각
  scores: (RoundScore | null)[]; // 답한 라운드의 점수
  finished: boolean;
  expiresAt: number;
}

interface ResultRow {
  id: string;
  nickname: string;
  avatar: string;
  total_score: number;
  created_at: string;
}

// 한국 시간 기준 날짜 "YYYY-MM-DD"
export function kstDate(now = Date.now()): string {
  return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// 오늘의 문제. 날짜별 5곳은 그날 처음 요청이 왔을 때 지역 퀴즈 문제 풀(정확한 파노라마 좌표)에서 골라 DB 에 고정한다.
@Injectable()
export class DailyService {
  // Map 은 넣은 순서를 지키고 TTL 이 모두 같으므로 앞쪽일수록 오래된 판이다
  private readonly sessions = new Map<string, DailySession>();

  constructor(
    private readonly database: DatabaseService,
    private readonly quizPool: QuizPoolService,
  ) {}

  private get db() {
    return this.database.db;
  }

  info(): DailyInfoResponse {
    const date = kstDate();
    return { date, rounds: DAILY_ROUNDS, settings: { ...DAILY_SETTINGS }, players: this.playerCount(date) };
  }

  start(): DailyStartResponse {
    const date = kstDate();
    const locations = this.locationsFor(date); // 문제 풀이 덜 모였으면 503

    const now = Date.now();
    this.prune(now);
    while (this.sessions.size >= MAX_SESSIONS) {
      const oldest = this.sessions.keys().next().value;
      if (oldest === undefined) break;
      this.sessions.delete(oldest);
    }
    let sessionId: string;
    do {
      sessionId = generateId(16);
    } while (this.sessions.has(sessionId));
    this.sessions.set(sessionId, {
      date,
      locations,
      startedAt: locations.map(() => null),
      scores: locations.map(() => null),
      finished: false,
      expiresAt: now + SESSION_TTL_MS,
    });
    return { sessionId, date, rounds: locations.length, settings: { ...DAILY_SETTINGS } };
  }

  // 라운드를 연다. 앞 라운드에 모두 답해야 하고, 같은 라운드를 다시 열면 처음 연 시각 그대로 (제한 시간을 늘릴 수 없음)
  startRound(sessionId: string, round: number): DailyRoundStartResponse {
    const session = this.getSession(sessionId);
    const i = this.roundIndex(session, round);
    if (session.scores.slice(0, i).some((s) => s === null)) throw new ConflictException('앞 라운드를 먼저 풀어주세요');
    if (session.startedAt[i] === null) session.startedAt[i] = Date.now();
    const started = session.startedAt[i]!;
    const { timeLimit } = DAILY_SETTINGS;
    return {
      panoId: session.locations[i].panoId,
      deadline: timeLimit > 0 ? started + timeLimit * 1000 : null,
      serverNow: Date.now(),
    };
  }

  // 라운드당 한 번. 제한 시간(+여유)이 지나서 내면 위치를 안 찍은 것으로 친다
  guess(sessionId: string, round: number, guess: Guess): DailyGuessResponse {
    const session = this.getSession(sessionId);
    const i = this.roundIndex(session, round);
    const started = session.startedAt[i];
    if (started === null) throw new ConflictException('라운드를 먼저 시작해주세요');
    if (session.scores[i] !== null) throw new ConflictException('이미 답한 라운드예요');

    const { timeLimit } = DAILY_SETTINGS;
    const late = timeLimit > 0 && Date.now() > started + timeLimit * 1000 + GRACE_MS;
    const location = session.locations[i];
    const [scored] = scoreGuesses([location], [late ? null : guess]).rounds;
    session.scores[i] = scored;
    return { score: scored.score, distanceKm: scored.distanceKm, answer: { lat: location.lat, lng: location.lng }, late };
  }

  // 5라운드를 모두 마친 판만, 한 번만 순위에 남긴다
  finish(sessionId: string, player: PlayerInfo): DailyFinishResponse {
    const session = this.getSession(sessionId);
    if (session.finished) throw new ConflictException('이미 결과를 남겼어요');
    if (session.scores.some((s) => s === null)) throw new ConflictException('모든 라운드를 풀어야 결과를 남길 수 있어요');
    const rounds = session.scores as RoundScore[];
    const totalScore = rounds.reduce((sum, r) => sum + r.score, 0);
    const resultId = generateId(16);
    const avatar: Avatar = { ...player.avatar };

    this.db
      .prepare(
        `INSERT INTO daily_results (id, date, nickname, avatar, rounds, total_score, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(resultId, session.date, player.nickname, JSON.stringify(avatar), JSON.stringify(rounds), totalScore, new Date().toISOString());
    session.finished = true;

    // 같은 점수면 먼저 남긴 사람이 앞 (챌린지와 같은 규칙)
    const { cnt } = this.db
      .prepare('SELECT COUNT(*) AS cnt FROM daily_results WHERE date = ? AND total_score >= ? AND id != ?')
      .get(session.date, totalScore, resultId) as { cnt: number };
    return { resultId, totalScore, rounds, rank: cnt + 1, players: this.playerCount(session.date) };
  }

  leaderboard(date: string): DailyLeaderboardResponse {
    if (!DATE_PATTERN.test(date)) throw new BadRequestException('날짜 형식이 올바르지 않습니다');
    const rows = this.db
      .prepare(
        `SELECT id, nickname, avatar, total_score, created_at FROM daily_results
         WHERE date = ? ORDER BY total_score DESC, created_at ASC LIMIT ?`,
      )
      .all(date, LEADERBOARD_LIMIT) as ResultRow[];
    const entries: LeaderboardEntry[] = rows.map((r) => ({
      resultId: r.id,
      player: { nickname: r.nickname, avatar: JSON.parse(r.avatar) as Avatar },
      totalScore: r.total_score,
      createdAt: r.created_at,
    }));
    return { date, entries, players: this.playerCount(date) };
  }

  // ───────────── 내부 ─────────────

  // 그날의 5곳. 없으면 지금 골라서 저장 (동시에 두 요청이 와도 먼저 저장된 것 하나만 쓴다)
  private locationsFor(date: string): ChallengeLocation[] {
    const select = this.db.prepare('SELECT locations FROM daily_challenges WHERE date = ?');
    let row = select.get(date) as { locations: string } | undefined;
    if (!row) {
      const picked = this.quizPool.pickLocations(DAILY_ROUNDS);
      this.db
        .prepare('INSERT OR IGNORE INTO daily_challenges (date, locations, created_at) VALUES (?, ?, ?)')
        .run(date, JSON.stringify(picked), new Date().toISOString());
      row = select.get(date) as { locations: string };
    }
    return JSON.parse(row.locations) as ChallengeLocation[];
  }

  private playerCount(date: string): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM daily_results WHERE date = ?').get(date) as { n: number }).n;
  }

  private getSession(sessionId: string): DailySession {
    const session = this.sessions.get(sessionId);
    if (!session || session.expiresAt <= Date.now()) {
      if (session) this.sessions.delete(sessionId);
      throw new NotFoundException('오늘의 문제를 찾을 수 없어요. 처음부터 다시 시작해주세요');
    }
    return session;
  }

  private roundIndex(session: DailySession, round: number): number {
    if (!Number.isInteger(round) || round < 1 || round > session.locations.length) {
      throw new BadRequestException('없는 라운드입니다');
    }
    return round - 1;
  }

  // 만료된 판 정리 (앞쪽부터 만료되지 않은 판이 나올 때까지)
  private prune(now: number) {
    for (const [id, session] of this.sessions) {
      if (session.expiresAt > now) break;
      this.sessions.delete(id);
    }
  }
}

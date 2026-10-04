import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type {
  ChallengeLocation,
  ChallengeResponse,
  GameSettings,
  Guess,
  LeaderboardResponse,
  PlayerInfo,
  SubmitResultResponse,
} from './challenge.types';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { SubmitResultDto } from './dto/submit-result.dto';
import { generateId } from './id';
import { scoreGuesses } from './score';

const LEADERBOARD_LIMIT = 100;

interface ChallengeRow {
  id: string;
  creator_nickname: string;
  creator_avatar: string;
  settings: string;
  locations: string;
  created_at: string;
}

interface ResultRow {
  id: string;
  nickname: string;
  avatar: string;
  total_score: number;
  created_at: string;
}

@Injectable()
export class ChallengesService {
  constructor(private readonly database: DatabaseService) {}

  private get db() {
    return this.database.db;
  }

  create(dto: CreateChallengeDto): { id: string } {
    const locations: ChallengeLocation[] = dto.locations.map(({ lat, lng, panoId }) => ({ lat, lng, panoId }));
    if (dto.creatorGuesses) this.assertGuessCount(dto.creatorGuesses, locations.length);

    const id = generateId();
    const createdAt = new Date().toISOString();
    const settings: GameSettings = {
      timeLimit: dto.settings.timeLimit,
      allowMove: dto.settings.allowMove,
      allowPan: dto.settings.allowPan,
      allowZoom: dto.settings.allowZoom,
    };

    // 챌린지 + (있다면) 만든 사람 결과를 한 트랜잭션으로 저장
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO challenges (id, creator_nickname, creator_avatar, settings, locations, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          dto.creator.nickname,
          JSON.stringify(toPlayerInfo(dto.creator).avatar),
          JSON.stringify(settings),
          JSON.stringify(locations),
          createdAt,
        );
      if (dto.creatorGuesses) {
        this.insertResult(id, locations, toPlayerInfo(dto.creator), dto.creatorGuesses, createdAt);
      }
    })();

    return { id };
  }

  findOne(id: string): ChallengeResponse {
    const row = this.getChallengeRow(id);
    return {
      id: row.id,
      creator: { nickname: row.creator_nickname, avatar: JSON.parse(row.creator_avatar) },
      settings: JSON.parse(row.settings),
      locations: JSON.parse(row.locations),
      createdAt: row.created_at,
    };
  }

  submitResult(challengeId: string, dto: SubmitResultDto): SubmitResultResponse {
    const challenge = this.getChallengeRow(challengeId);
    const locations: ChallengeLocation[] = JSON.parse(challenge.locations);
    this.assertGuessCount(dto.guesses, locations.length);

    return this.db.transaction(() =>
      this.insertResult(challengeId, locations, toPlayerInfo(dto.player), dto.guesses, new Date().toISOString()),
    )();
  }

  leaderboard(challengeId: string): LeaderboardResponse {
    this.getChallengeRow(challengeId);
    const rows = this.db
      .prepare(
        `SELECT id, nickname, avatar, total_score, created_at FROM results
         WHERE challenge_id = ?
         ORDER BY total_score DESC, created_at ASC, rowid ASC
         LIMIT ?`,
      )
      .all(challengeId, LEADERBOARD_LIMIT) as ResultRow[];

    return {
      entries: rows.map((r) => ({
        resultId: r.id,
        player: { nickname: r.nickname, avatar: JSON.parse(r.avatar) },
        totalScore: r.total_score,
        createdAt: r.created_at,
      })),
    };
  }

  // 결과 저장 후 순위 계산. 반드시 트랜잭션 안에서 호출할 것.
  private insertResult(
    challengeId: string,
    locations: ChallengeLocation[],
    player: PlayerInfo,
    guesses: Guess[],
    createdAt: string,
  ): SubmitResultResponse {
    const { rounds, totalScore } = scoreGuesses(locations, guesses);
    const resultId = generateId();
    const cleanGuesses: Guess[] = guesses.map((g) => (g ? { lat: g.lat, lng: g.lng } : null));

    this.db
      .prepare(
        `INSERT INTO results (id, challenge_id, nickname, avatar, guesses, rounds, total_score, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        resultId,
        challengeId,
        player.nickname,
        JSON.stringify(player.avatar),
        JSON.stringify(cleanGuesses),
        JSON.stringify(rounds),
        totalScore,
        createdAt,
      );

    // 방금 넣은 결과가 가장 늦은 제출이므로, 점수가 같거나 높은 기존 결과 수 + 1 = 순위
    // (동점이면 먼저 제출한 사람이 위)
    const { cnt } = this.db
      .prepare(`SELECT COUNT(*) AS cnt FROM results WHERE challenge_id = ? AND total_score >= ? AND id != ?`)
      .get(challengeId, totalScore, resultId) as { cnt: number };

    return { resultId, totalScore, rounds, rank: cnt + 1 };
  }

  private getChallengeRow(id: string): ChallengeRow {
    const row = this.db.prepare(`SELECT * FROM challenges WHERE id = ?`).get(id) as ChallengeRow | undefined;
    if (!row) throw new NotFoundException('챌린지를 찾을 수 없습니다');
    return row;
  }

  private assertGuessCount(guesses: Guess[], expected: number) {
    if (guesses.length !== expected) {
      throw new BadRequestException(`guesses 길이는 라운드 수(${expected})와 같아야 합니다`);
    }
  }
}

// DTO 인스턴스를 순수 객체로 (DB에 키 순서가 일정한 JSON 으로 저장되도록)
function toPlayerInfo(p: PlayerInfo): PlayerInfo {
  const a = p.avatar;
  return {
    nickname: p.nickname,
    avatar: {
      skin: a.skin,
      hairStyle: a.hairStyle,
      hairColor: a.hairColor,
      eyes: a.eyes,
      hat: a.hat,
      outfitColor: a.outfitColor,
      pantsColor: a.pantsColor,
    },
  };
}

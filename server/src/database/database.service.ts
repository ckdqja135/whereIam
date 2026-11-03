import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// better-sqlite3 래퍼. 동기 API 라서 별도 커넥션 풀 없이 인스턴스 하나만 쓴다.
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  readonly db: Database.Database;

  constructor(config: ConfigService) {
    const dbPath = resolve(config.get<string>('DB_PATH') || './data/whereiam.db');
    mkdirSync(dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    // WAL: 읽기와 쓰기가 서로 막지 않도록
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
    this.logger.log(`SQLite 열림: ${dbPath}`);
  }

  // 테이블이 없으면 생성 (ORM 없이 단순하게)
  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS challenges (
        id               TEXT PRIMARY KEY,
        creator_nickname TEXT NOT NULL,
        creator_avatar   TEXT NOT NULL, -- Avatar JSON
        settings         TEXT NOT NULL, -- GameSettings JSON
        locations        TEXT NOT NULL, -- ChallengeLocation[] JSON
        created_at       TEXT NOT NULL  -- ISO 문자열
      );

      CREATE TABLE IF NOT EXISTS results (
        id           TEXT PRIMARY KEY,
        challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
        nickname     TEXT NOT NULL,
        avatar       TEXT NOT NULL, -- Avatar JSON
        guesses      TEXT NOT NULL, -- Guess[] JSON
        rounds       TEXT NOT NULL, -- RoundScore[] JSON
        total_score  INTEGER NOT NULL,
        created_at   TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_results_leaderboard
        ON results (challenge_id, total_score DESC, created_at ASC);

      -- 4지선다 퀴즈 문제 풀. 좌표는 로드뷰가 실제로 열린 파노라마 좌표, 지역은 서버가 카카오 REST API 로 확인한 값
      CREATE TABLE IF NOT EXISTS quiz_pool (
        pano_id    INTEGER PRIMARY KEY,
        lat        REAL,
        lng        REAL,
        r1         TEXT NOT NULL,              -- 시·도
        r2         TEXT NOT NULL,              -- 시·군·구 ("성남시 분당구" → "성남시"), 없으면 ''
        bad        INTEGER NOT NULL DEFAULT 0, -- 1: 보고된 좌표가 달라 문제에서 뺌
        created_at TEXT                        -- ISO 문자열
      );

      CREATE INDEX IF NOT EXISTS idx_quiz_pool_region ON quiz_pool (bad, r1, r2);
    `);
  }

  onApplicationShutdown() {
    if (this.db.open) {
      this.db.close();
      this.logger.log('SQLite 닫힘');
    }
  }
}

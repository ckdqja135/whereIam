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

      -- 지하철역 퀴즈. 역 목록은 서버가 카카오 장소 검색(지하철역 SW8)으로 모으고, 같은 이름의 가까운 역(환승역)은 하나로 합친다.
      -- 출입구 바로 앞 로드뷰(pano_*)는 브라우저가 찾아서 보태고, 서버가 사진을 검사해서(출입구가 안 보이는 방향, 다리 밑·터널,
      -- 역 이름 글자) 안 맞으면 다음 출입구에서 다시 찾는다
      CREATE TABLE IF NOT EXISTS stations (
        id              TEXT PRIMARY KEY,           -- 카카오 장소 id (합친 역은 id 가 가장 작은 것)
        name            TEXT NOT NULL,              -- "강남역"
        lines           TEXT NOT NULL,              -- "수도권2호선,신분당선"
        city            TEXT NOT NULL,              -- 보기를 고르는 도시 묶음 (capital / busan / daegu / gwangju / daejeon / other)
        lat             REAL NOT NULL,
        lng             REAL NOT NULL,
        pano_id         INTEGER UNIQUE,             -- 역 바로 앞 로드뷰, 아직 없으면 NULL
        pano_lat        REAL,
        pano_lng        REAL,
        pano_cube       TEXT,                       -- 로드뷰 사진 경로 ("2026/06/9152477/2_103458_9152477_20260605061034")
        pano_heading    REAL,                       -- 사진 앞면의 방향 (0 = 북쪽, 시계 방향)
        exits           TEXT,                       -- 역의 출입구 좌표들 JSON [[lat, lng], …] (카카오 장소 검색 "지하철출구", 무작위 순서)
        exit_try        INTEGER NOT NULL DEFAULT 0, -- 지금 로드뷰를 찾는 출입구 (exits 의 순번). 로드뷰가 안 맞으면 다음 출입구로
        exit_lat        REAL,                       -- 지금 로드뷰를 찾는 출입구 좌표 (exits[exit_try])
        exit_lng        REAL,
        exit_checked_at TEXT,                       -- 출입구를 찾아본 시각 (못 찾았으면 exit_lat 이 NULL)
        pano_checked_at TEXT,                       -- 어느 출입구에서도 쓸 로드뷰가 없다고 확인한 시각 (다시 찾기 전 대기용)
        view_pan        REAL,                       -- 문제 시작 방향 (출입구들을 등진 쪽, 사진 검사 때 정함)
        view_range      REAL,                       -- 시작 방향에서 좌우로 돌릴 수 있는 각도
        checked         INTEGER NOT NULL DEFAULT 0, -- 1: 사진 검사를 마침 (bad = 0 인 것만 문제로 낸다)
        check_version   INTEGER NOT NULL DEFAULT 0, -- 통과한 사진 검사 방법 (station-photo-check.service.ts 의 CHECK_VERSION 보다 낮으면 다시 검사)
        bad             INTEGER NOT NULL DEFAULT 0, -- 0이 아니면 문제에서 뺌. 1: 보고된 좌표가 다름, 2: 사진에 역 이름이 보임, 3: 플레이어 신고,
                                                    -- 4: 다리 밑·터널 같은 곳, 5: 출입구가 안 보이는 방향이 없음, 6: 건물 없이 논밭·숲만 보임
                                                    -- (2·4·5·6 은 모든 출입구에서 그랬을 때)
        updated_at      TEXT NOT NULL               -- 역 목록에서 마지막으로 확인한 시각 (ISO)
      );

      CREATE INDEX IF NOT EXISTS idx_stations_pano ON stations (bad, pano_id);

      -- 사진 검사에서 떨어진 역 로드뷰 (같은 역에 다시 보태지 않도록)
      CREATE TABLE IF NOT EXISTS station_rejected_panos (
        station_id TEXT NOT NULL,
        pano_id    INTEGER NOT NULL,
        reason     INTEGER NOT NULL, -- stations.bad 와 같은 번호
        created_at TEXT NOT NULL,
        PRIMARY KEY (station_id, pano_id)
      );

      -- 오늘의 문제: 날짜(한국 시간)별 5곳. 그날 처음 요청이 오면 지역 퀴즈 문제 풀(quiz_pool)에서 골라 고정한다
      CREATE TABLE IF NOT EXISTS daily_challenges (
        date       TEXT PRIMARY KEY, -- "2026-11-03" (한국 시간)
        locations  TEXT NOT NULL,    -- ChallengeLocation[] JSON (정확한 파노라마 좌표)
        created_at TEXT NOT NULL
      );

      -- 오늘의 문제 결과 (점수는 서버가 라운드마다 매긴 것)
      CREATE TABLE IF NOT EXISTS daily_results (
        id          TEXT PRIMARY KEY,
        date        TEXT NOT NULL,
        nickname    TEXT NOT NULL,
        avatar      TEXT NOT NULL,    -- Avatar JSON
        rounds      TEXT NOT NULL,    -- RoundScore[] JSON
        total_score INTEGER NOT NULL,
        created_at  TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_daily_results_board ON daily_results (date, total_score DESC, created_at ASC);

      -- 서버 내부 상태 (역 목록을 마지막으로 모은 시각 등)
      CREATE TABLE IF NOT EXISTS app_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // 출입구 기준 지하철역 로드뷰 (이전 DB 에는 칸이 없다)
    this.addColumn('stations', 'pano_heading', 'REAL');
    this.addColumn('stations', 'exit_lat', 'REAL');
    this.addColumn('stations', 'exit_lng', 'REAL');
    this.addColumn('stations', 'exit_checked_at', 'TEXT');
    this.addColumn('stations', 'exits', 'TEXT');
    this.addColumn('stations', 'exit_try', 'INTEGER NOT NULL DEFAULT 0');
    this.addColumn('stations', 'view_pan', 'REAL');
    this.addColumn('stations', 'view_range', 'REAL');
    this.addColumn('stations', 'check_version', 'INTEGER NOT NULL DEFAULT 0');
    // 로드뷰 고르는 방법이 바뀌면 모은 로드뷰를 한 번 비우고 다시 모은다 (플레이어가 신고한 역은 그대로 뺀다).
    // 2: 역 중심 근처(뚝방길·다리 밑 등) → 출입구 앞. 3: 출입구 하나 → 모든 출입구를 피하는 방향, 다리 밑·터널 검사
    const version = this.db.prepare("SELECT value FROM app_meta WHERE key = 'stations_pano_version'").get() as
      | { value: string }
      | undefined;
    if (version?.value !== '3') {
      this.db.transaction(() => {
        this.db.exec(`
          UPDATE stations SET pano_id = NULL, pano_lat = NULL, pano_lng = NULL, pano_cube = NULL, pano_heading = NULL,
                              pano_checked_at = NULL, exits = NULL, exit_try = 0, exit_lat = NULL, exit_lng = NULL,
                              exit_checked_at = NULL, view_pan = NULL, view_range = NULL, checked = 0, bad = 0
            WHERE bad != 3;
          DELETE FROM station_rejected_panos;
          INSERT INTO app_meta (key, value) VALUES ('stations_pano_version', '3')
            ON CONFLICT(key) DO UPDATE SET value = excluded.value;
        `);
      })();
    }
  }

  private addColumn(table: string, column: string, type: string) {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((c) => c.name === column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }

  onApplicationShutdown() {
    if (this.db.open) {
      this.db.close();
      this.logger.log('SQLite 닫힘');
    }
  }
}

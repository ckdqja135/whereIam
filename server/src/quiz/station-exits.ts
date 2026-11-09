import type Database from 'better-sqlite3';
import { shuffle } from './quiz-question';

// 지하철역의 출입구 돌려 쓰기. 역마다 출입구 좌표들(stations.exits)을 무작위 순서로 두고, 지금 출입구(exit_try) 앞의 로드뷰가
// 없거나 사진 검사에서 떨어지거나 플레이어가 신고하면 다음 출입구에서 다시 찾는다

export type ExitPoint = [lat: number, lng: number];

// station_rejected_panos.reason: 플레이어 신고 (stations.bad 의 3 과 같은 번호)
const FLAGGED = 3;

export function shuffledExits(exits: { lat: number; lng: number }[]): ExitPoint[] {
  return shuffle(exits.map((e): ExitPoint => [e.lat, e.lng]));
}

export function parseExits(json: string | null): ExitPoint[] {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (e): e is ExitPoint => Array.isArray(e) && e.length === 2 && Number.isFinite(e[0]) && Number.isFinite(e[1]),
    );
  } catch {
    return [];
  }
}

// 다음 출입구로 넘어가고 로드뷰를 비운다. 남은 출입구가 없으면 아무것도 바꾸지 않고 false
export function moveToNextExit(db: Database.Database, stationId: string): boolean {
  const row = db.prepare('SELECT exits, exit_try FROM stations WHERE id = ?').get(stationId) as
    | { exits: string | null; exit_try: number }
    | undefined;
  if (!row) return false;
  const exits = parseExits(row.exits);
  const next = row.exit_try + 1;
  if (next >= exits.length) return false;
  db.prepare(
    `UPDATE stations SET exit_try = ?, exit_lat = ?, exit_lng = ?, pano_id = NULL, pano_lat = NULL, pano_lng = NULL,
            pano_cube = NULL, pano_heading = NULL, view_pan = NULL, view_range = NULL, checked = 0
     WHERE id = ?`,
  ).run(next, exits[next][0], exits[next][1], stationId);
  return true;
}

// 플레이어 신고 ("역이 보였어요"): 역은 문제에 그대로 두고 사진만 바꾼다. 그 로드뷰는 기록해 두고(다시 쓰지 않게) 다음 출입구에서 새로 찾고,
// 마지막 출입구였으면 첫 출입구로 돌아가 기록된 로드뷰를 피해 그 근처의 다른 로드뷰를 찾는다 (브라우저가 todo 의 exclude 를 피한다).
// 출입구 목록이 없는 예전 역은 출입구부터 다시 찾는다
export function replaceFlaggedPano(db: Database.Database, stationId: string, panoId: number | null): void {
  db.transaction(() => {
    if (panoId !== null) {
      db.prepare(
        `INSERT INTO station_rejected_panos (station_id, pano_id, reason, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(station_id, pano_id) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at`,
      ).run(stationId, panoId, FLAGGED, new Date().toISOString());
    }
    db.prepare('UPDATE stations SET bad = 0, pano_checked_at = NULL WHERE id = ?').run(stationId);
    if (moveToNextExit(db, stationId)) return;
    db.prepare(
      `UPDATE stations SET exit_try = 0,
              exit_lat = COALESCE(json_extract(exits, '$[0][0]'), exit_lat), exit_lng = COALESCE(json_extract(exits, '$[0][1]'), exit_lng),
              exit_checked_at = CASE WHEN exits IS NULL THEN NULL ELSE exit_checked_at END,
              pano_id = NULL, pano_lat = NULL, pano_lng = NULL, pano_cube = NULL, pano_heading = NULL,
              view_pan = NULL, view_range = NULL, checked = 0
       WHERE id = ?`,
    ).run(stationId);
  })();
}

// 사진 검사에서 떨어진 로드뷰: 기록해 두고 다음 출입구로. 마지막 출입구였으면 그 역은 문제에서 뺀다 (bad = reason).
// 검사하는 사이 로드뷰가 바뀌었으면(cube 가 다르면) 아무것도 하지 않는다. 다음 출입구로 넘어갔으면 true
export function rejectStationPano(db: Database.Database, stationId: string, cube: string, reason: number): boolean {
  return db.transaction(() => {
    const row = db.prepare('SELECT pano_id FROM stations WHERE id = ? AND pano_cube = ?').get(stationId, cube) as
      | { pano_id: number | null }
      | undefined;
    if (!row || row.pano_id === null) return false;
    db.prepare(
      `INSERT INTO station_rejected_panos (station_id, pano_id, reason, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(station_id, pano_id) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at`,
    ).run(stationId, row.pano_id, reason, new Date().toISOString());
    if (moveToNextExit(db, stationId)) return true;
    db.prepare('UPDATE stations SET checked = 1, bad = ? WHERE id = ?').run(reason, stationId);
    return false;
  })();
}

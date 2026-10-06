# whereIam 서버

whereIam(카카오 로드뷰 기반 국내 위치 맞히기 게임)의 백엔드입니다.
NestJS 11 + SQLite(`better-sqlite3`)로 동작하며, 챌린지 생성/조회, 결과 제출(점수는 서버가 계산), 리더보드,
실시간 대결 방(2~4인, 롱 폴링, 메모리 저장)을 제공합니다.

- 프론트(Next.js)는 Vercel, 이 서버는 개인 리눅스 서버에서 PM2로 실행합니다.
- DB는 파일 하나(SQLite)라 별도 DB 설치가 필요 없습니다. 테이블은 서버 시작 시 자동 생성됩니다.

## API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/health` | `{ ok: true }` |
| POST | `/challenges` | 챌린지 생성 → `201 { id }` (`creatorGuesses` 가 있으면 만든 사람 결과도 등록) |
| GET | `/challenges/:id` | 챌린지 조회 (없으면 404) |
| POST | `/challenges/:id/results` | 결과 제출 → `{ resultId, totalScore, rounds, rank }` |
| GET | `/challenges/:id/leaderboard` | 점수 내림차순(동점이면 먼저 제출한 순) 상위 100개 |

요청/응답 타입은 `src/challenges/challenge.types.ts` 에 있고, 프론트의 `src/lib/api-types.ts` 와 항상 같게 유지해야 합니다.
점수 공식(`src/challenges/score.ts`)도 프론트의 `src/lib/score.ts`, `src/lib/haversine.ts` 와 동일해야 합니다.

### 실시간 대결 방 (2~4인)

WebSocket 대신 **롱 폴링**을 씁니다 (Vercel 서버 사이드 프록시를 거쳐도 동작).
방 만들기/참가 응답의 `token` 을 이후 모든 요청의 `X-Player-Token` 헤더로 보내야 합니다 (없거나 틀리면 403).
타입은 `src/rooms/room.types.ts` 에 있고, 프론트의 `src/lib/room-types.ts` 와 항상 같게 유지해야 합니다.

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| POST | `/rooms` | 방 만들기 `{ player, settings }` → `201 { code, playerId, token, state }`. 만든 사람이 방장 |
| POST | `/rooms/:code/join` | 참가 `{ player }` → `201 { code, playerId, token, state }`. 없는 방 404, 시작된 방/4명 가득 409 |
| GET | `/rooms/:code/state?since=<version>` | 방 상태. `since` 가 없거나 현재 version 과 다르면 즉시, 같으면 바뀔 때까지(최대 25초) 기다렸다 응답 |
| POST | `/rooms/:code/ready` | `{ ready }` 준비 토글 (대기실) |
| POST | `/rooms/:code/settings` | `{ settings }` 설정 변경 (방장, 대기실). 참가자 준비 상태 초기화 |
| POST | `/rooms/:code/start` | `{ locations: [5개] }` 게임 시작 (방장, 2명 이상 접속, 참가자 모두 준비) |
| POST | `/rooms/:code/position` | `{ round, lat, lng }` 실제 로드뷰 좌표 보고 → 1km 이내면 그 라운드 정답 보정 (204) |
| POST | `/rooms/:code/guess` | `{ round, guess, items }` 라운드 제출. 남은 사람이 모두 제출하면 라운드 종료 |
| POST | `/rooms/:code/next` | 다음 라운드 / 마지막이면 종료 (방장, 결과 공개 중). 20초 뒤에는 자동 진행 |
| POST | `/rooms/:code/rematch` | 같은 방에서 다시 하기 → 대기실 (방장, 게임 종료 후). 나간 사람은 정리 |
| POST | `/rooms/:code/leave` | 나가기 (204). 대기실이면 제거, 게임 중이면 결과는 남기고 표시만. 방장이면 다음 사람에게 넘김 |

- 진행 중에는 다른 사람의 추측이 응답에 절대 포함되지 않습니다 (제출 여부만). 점수는 라운드가 끝날 때 서버가 계산합니다.
- 라운드 제한 시간에는 네트워크 지연을 고려해 2초 여유가 붙습니다 (`roundDeadline` 에 포함). 시간이 지나면 미제출자는 0점.
- 40초 동안 요청이 없으면 접속 끊김으로 봅니다(롱 폴링 대기 중에는 접속 중). 대기실에서 60초 끊기면 내보내고,
  게임 중 방장이 끊기면 접속 중인 사람에게 방장을 넘깁니다. 아무도 접속하지 않은 방은 5분, 끝난 방은 30분 뒤 삭제됩니다.
- 동시에 존재하는 방은 최대 500개입니다 (초과 시 503).

> **방 상태는 메모리에만 있습니다.** 서버를 재시작(`pm2 reload`/`restart`, 배포)하면 진행 중인 방이 모두 사라집니다.
> 업데이트는 게임이 진행 중이지 않을 때 하세요. 같은 이유로 PM2 는 반드시 fork 모드 1개로 실행해야 합니다.

Rate limit: IP당 전체 60회/분(API별), 챌린지 생성·결과 제출·방 만들기는 10회/분, 방 참가는 20회/분.
방 상태 조회(롱 폴링)는 rate limit 에서 제외됩니다.

## 환경 변수 (`.env`)

`.env.example` 을 복사해서 사용합니다.

| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `PORT` | `4000` | 서버 포트 (외부에 직접 열지 말 것) |
| `HOST` | `127.0.0.1` | 바인딩 주소. 프록시 뒤에서만 접근하도록 기본은 로컬 전용 |
| `CORS_ORIGINS` | (없음) | 허용할 프론트 origin, 쉼표 구분. 예: `https://whereiam.vercel.app,http://localhost:3000` |
| `DB_PATH` | `./data/whereiam.db` | SQLite 파일 경로. 디렉터리가 없으면 자동 생성 |
| `PROXY_SECRET` | (없음) | 프론트 프록시 전용 공유 비밀키. 설정하면 `/health` 외 모든 요청에 `X-Proxy-Secret` 헤더가 일치해야 한다 (프록시 방식에서 사용) |

테스트용으로만 방 타이밍을 줄일 수 있습니다 (모두 ms, 운영에서는 설정하지 말 것):
`ROOM_LONGPOLL_MS`(25000), `ROOM_REVEAL_MS`(20000), `ROOM_GRACE_MS`(2000), `ROOM_SECOND_MS`(제한 시간 1초의 길이, 1000),
`ROOM_DISCONNECT_MS`(40000), `ROOM_LOBBY_KICK_MS`(60000), `ROOM_IDLE_MS`(300000), `ROOM_FINISHED_TTL_MS`(1800000), `ROOM_SWEEP_MS`(5000).

## 로컬 개발

```bash
cd server
cp .env.example .env
npm install
npm run start:dev   # http://localhost:4000
```

## 서버 준비물

- **Node.js 20 이상** (22 LTS 권장)
- **PM2**: `npm install -g pm2`
- `better-sqlite3` 는 네이티브 모듈입니다. 보통은 미리 빌드된 바이너리를 내려받지만,
  OS/아키텍처에 맞는 바이너리가 없으면 소스에서 빌드하므로 빌드 도구가 필요합니다.
  - Ubuntu/Debian: `sudo apt install -y build-essential python3`
  - RHEL/Rocky 계열: `sudo dnf groupinstall "Development Tools" && sudo dnf install python3`

## 배포 (최초 1회)

```bash
git clone <이 저장소 URL> whereIam
cd whereIam/server
cp .env.example .env          # CORS_ORIGINS 등 수정
npm ci
npm run build
pm2 start ecosystem.config.js
pm2 save                      # 현재 프로세스 목록 저장
pm2 startup                   # 출력되는 명령을 그대로 실행하면 재부팅 시 자동 시작
```

> PM2는 반드시 **fork 모드, 인스턴스 1개**로 실행합니다(`ecosystem.config.js` 에 설정됨).
> 실시간 대결 방 상태를 메모리에 두기 때문에 cluster 모드로 여러 개 띄우면 방 정보가 갈라집니다.

DB 파일은 기본적으로 `server/data/whereiam.db` 에 생기며 git 에는 포함되지 않습니다. 백업은 이 파일(및 `-wal`, `-shm`)을 복사하면 됩니다.

## 업데이트

```bash
cd whereIam
git pull
cd server
npm ci
npm run build
pm2 reload whereiam-server
```

로그 확인: `pm2 logs whereiam-server`

## 프론트에서 연결하는 두 가지 방법

### 방법 1. 프론트 프록시 (권장, 도메인/인증서 불필요)

브라우저는 Vercel 의 `/api/backend/...` 만 호출하고, Next.js 라우트(`src/app/api/backend/[...path]/route.ts`)가
Vercel 서버에서 이 서버로 대신 요청합니다. 서버 간 통신이라 이 서버가 `http://IP:포트` 여도 됩니다.

1. 비밀키 생성: `openssl rand -hex 32`
2. 이 서버 `.env`: `PROXY_SECRET=<비밀키>`, 포트를 외부에서 접근 가능하게(`HOST=0.0.0.0`, 방화벽/도커 포트 매핑) → `pm2 restart whereiam-server`
3. Vercel 환경 변수:
   - `NEXT_PUBLIC_API_URL=/api/backend`
   - `BACKEND_URL=http://<서버 공인 IP>:<포트>`
   - `BACKEND_PROXY_SECRET=<비밀키>`
   → Redeploy
4. 확인: `curl https://<Vercel 도메인>/api/backend/health` → `{"ok":true}`

비밀키 덕분에 포트가 열려 있어도 프록시 외의 직접 호출은 401 로 거부됩니다. 단, Vercel ↔ 서버 구간은 평문 HTTP 입니다
(현재 오가는 데이터는 닉네임·좌표·점수뿐). `CORS_ORIGINS` 는 이 방식에서는 쓰이지 않습니다.
실시간 대결 방은 WebSocket 이 아닌 롱 폴링(최대 25초 대기)이라 이 방식에서도 동작합니다.
단, 프록시 라우트의 실행 시간 제한(Vercel `maxDuration`)이 30초 이상이어야 합니다.

### 방법 2. HTTPS 로 직접 노출

브라우저가 이 서버를 직접 호출하는 구성입니다. Vercel 에 올라간 프론트 페이지는 HTTPS 입니다. 브라우저는 HTTPS 페이지에서 `http://<서버 IP>:4000` 같은
HTTP 주소를 호출하면 **mixed content** 로 차단합니다. 따라서 API 서버도 반드시 HTTPS 도메인으로 노출해야 합니다.

가장 간단한 방법은 [Caddy](https://caddyserver.com/) 를 리버스 프록시로 두는 것입니다. Caddy 는 Let's Encrypt 인증서를 자동으로 발급/갱신합니다.

1. **도메인 준비**: 도메인이 없다면 [DuckDNS](https://www.duckdns.org/) 같은 무료 서브도메인(예: `whereiam-api.duckdns.org`)을 만들고 서버 공인 IP 를 연결합니다.
   보유한 도메인이 있다면 `api.example.com` 의 A 레코드를 서버 IP 로 지정합니다.
2. **Caddy 설치** 후 `/etc/caddy/Caddyfile`:

   ```caddyfile
   api.example.com {
       reverse_proxy localhost:4000
   }
   ```

   `sudo systemctl reload caddy`

3. **방화벽/보안 그룹**: 80, 443 포트만 열고, **4000 포트는 외부에 열지 않습니다** (Caddy 를 통해서만 접근).

   ```bash
   sudo ufw allow 80
   sudo ufw allow 443
   # 4000 은 열지 않음
   ```

4. **Vercel 환경 변수**: Vercel 프로젝트 설정에서 `NEXT_PUBLIC_API_URL=https://api.example.com` 을 추가하고 재배포합니다.
5. 서버 `.env` 의 `CORS_ORIGINS` 에 Vercel 도메인(예: `https://whereiam.vercel.app`)이 들어있는지 확인합니다.

서버는 `trust proxy` 가 켜져 있어 Caddy/Nginx 가 넘겨주는 `X-Forwarded-For` 로 실제 클라이언트 IP 를 보고 rate limit 을 적용합니다.
(프록시 없이 4000 포트를 직접 노출하면 이 헤더를 위조할 수 있으므로, 그 점에서도 4000 은 닫아두어야 합니다.)

확인: `curl https://api.example.com/health` → `{"ok":true}`

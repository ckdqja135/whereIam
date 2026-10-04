# whereIam 서버

whereIam(카카오 로드뷰 기반 국내 위치 맞히기 게임)의 백엔드입니다.
NestJS 11 + SQLite(`better-sqlite3`)로 동작하며, 챌린지 생성/조회, 결과 제출(점수는 서버가 계산), 리더보드를 제공합니다.

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

Rate limit: IP당 전체 60회/분, 챌린지 생성·결과 제출은 10회/분.

## 환경 변수 (`.env`)

`.env.example` 을 복사해서 사용합니다.

| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `PORT` | `4000` | 서버 포트 (외부에 직접 열지 말 것) |
| `HOST` | `127.0.0.1` | 바인딩 주소. 프록시 뒤에서만 접근하도록 기본은 로컬 전용 |
| `CORS_ORIGINS` | (없음) | 허용할 프론트 origin, 쉼표 구분. 예: `https://whereiam.vercel.app,http://localhost:3000` |
| `DB_PATH` | `./data/whereiam.db` | SQLite 파일 경로. 디렉터리가 없으면 자동 생성 |

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
> 앞으로 실시간 방 상태를 메모리에 둘 예정이라 cluster 모드로 여러 개 띄우면 방 정보가 갈라집니다.

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

## HTTPS 설정 (필수)

Vercel 에 올라간 프론트 페이지는 HTTPS 입니다. 브라우저는 HTTPS 페이지에서 `http://<서버 IP>:4000` 같은
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

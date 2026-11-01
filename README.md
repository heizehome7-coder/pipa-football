# PIPA · FOOTBALL GAME  — UPDATE 4

> 버전 표시는 `src/version.ts`의 `GAME_VERSION` 하나로 관리 (다음 큰 업데이트 때 숫자만 올리기)

모바일 세로 화면 중심의 3D 축구 웹게임 (페널티킥 · 프리킥).
React + TypeScript + Three.js, 외부 에셋 없이 전부 절차적(procedural) 로우폴리 3D.

## 실행

```bash
npm install
npm run dev            # http://localhost:5173  (같은 Wi-Fi의 폰에서는 표시되는 Network 주소로 접속)
npm run build          # dist/        — 일반 배포용
npm run build:single   # dist-single/ — index.html 한 파일 (어디서나 더블클릭/업로드로 실행)
```

## 온라인 (1단계: 접속 → 대결 신청 → 매칭)

로그인 → **혼자서**(기존 페널티킥/프리킥 그대로) / **온라인**(ONLINE LOBBY).
로그인한 순간부터 실시간 presence가 켜지므로, 싱글플레이 메뉴에 있어도 대결 신청을 받을 수 있습니다.

| 실행 방식 | 실시간 백엔드 |
|---|---|
| claude.ai에 게시된 페이지 | 아티팩트 `room` 기능 (로그인한, 페이지를 공유받은 사람끼리) |
| `npm run online` (빌드 + 서버) / Render | 내장 WebSocket 서버 `server/realtime-server.mjs` → http://localhost:8787 (온라인 경기까지) |
| 파일로 직접 열기 | 온라인 비활성 (안내 표시) |

- 프로토콜: `src/online/LobbyClient.ts` — 각 클라이언트가 presence 하나(닉네임·상태·보낸 신청·답변·매치)를 공유
- 상태: `online` / `in_lobby` / `pending` / `in_match`, 신청: `pending` / `accepted` / `rejected` / `cancelled` / `expired`(30초)
- 동시 신청 → 먼저 만들어진 신청 하나로 합쳐짐, 끊긴 사용자는 목록·신청·매치에서 자동 정리
- 매치 ID = 신청 ID, 매치 전용 방(`pipa-m-<id>`)에 두 사람이 입장 → 다음 단계 온라인 경기에 사용

## 선수 & 스쿼드 (UPDATE 4) — `src/players/`

- 선수 20명(필드 15 + GK 5) DB: `players.ts` — 이름·포지션·국가·등번호·외형. **능력치 없음** (UPDATE 5 예정, 모든 선수 같은 물리/조작)
- 첫 로그인(이 기기에 스쿼드 없음) → **BUILD YOUR SQUAD**: 키커 5명 + GK 1명 → MY SQUAD(순서 ▲▼, ⭐ 프리킥 키커) → SAVE SQUAD
- 홈: 혼자서 / 온라인 / **SQUAD** (언제든 변경) · 저장: 이 기기 `localStorage` (`pipa.squad.v1.<닉네임>`:
  `penaltyOrder`, `selectedPlayers`, `goalkeeperId`, `freeKickTakerId`)
- 혼자서 PENALTY → **SELECT KICKER**(내 5명 중 선택) / FREE KICK → 지정한 프리킥 키커 / 등장 시 이름 표시(약 1.7초)
- 온라인: `match:join`에 스쿼드 id만 전송 → 서버가 state에 포함 → 각자 자기 순서대로 키커, 상대는 자기 GK
- 카드: PIPA 전용 세로형 카드(SVG 일러스트 아바타·그린 국기) — 실사 사진/외부 이미지 사용 안 함
- 3D: 헤어스타일·수염·피부톤·키/체형(키커만)·등번호/이름 — 외형만 바뀌고 충돌체·타이밍은 그대로
  (GK 체형은 고정 → 선방 범위 동일, 온라인 판정 결정성 유지)

## 선수 능력 & 애니메이션 (UPDATE 5)
- 필드 능력 7종(POWER/ACCURACY/CURVE/KNUCKLE/LOW SHOT/FREE KICK/COMPOSURE), GK 능력 7종(REFLEX/DIVING/REACH/POSITIONING/PENALTY READ/LOW SAVE/HIGH SAVE) — `src/players/players.ts`
- 능력은 작은 보정(유저 입력 ~70%, 선수 ~30%) — `src/players/abilities.ts` (속도·회전 배율, 결정론적 조준 오차, 무회전)
- 스페셜은 버튼 없이 슛 모양으로 자동 발동 (감아차기 +20~35% 회전, 호날두 무회전 = 별도 물리 프로필: 작은 불규칙 흔들림)
- 11단계 킥 모션 + 슛 타입별 변형(drive/instep/outside/knuckle/low), 왼발 선수는 좌우 반전 — `src/game/entities/Player.ts`
- GK: 6방향 블렌딩 다이브, 능력 반영(팔 길이/이동 거리), 선방·실점 리액션 — `Goalkeeper.ts`
- 선수별 골 세리머니 15종 + 실패(SAVE/MISS/POST/CROSSBAR) 리액션 — `reactions.ts`; 리액션 중 입력 잠금(~2초)
- 카드 앞면 OVR + POWER/ACCURACY/CURVE, 상세에 전체 능력 + SPECIAL ABILITY. 등 이름 크기 확대

## 온라인 페널티킥 경기 (2단계)

MATCH FOUND → **[준비하기]** (둘 다) → 3·2·1·KICK OFF → 10라운드(각자 5번) → MATCH RESULT

- **서버가 결정**(`server/matches.mjs`): roomId(`pipa_match_<id>`), 준비 상태, 시작 시각(`startAt`), 첫 키커(랜덤),
  라운드·역할 교대·점수·슛 횟수·판정·최종 승자. 클라이언트는 의도만 보냄 (점수를 직접 올릴 수 없음)
- **슛 1번 = 메시지 1개**: 그린 3D 경로 + 파워 → 서버 `shot:start {경로, runStart(서버 시각), seed}` →
  두 폰이 같은 서버 시각에 같은 결정적 시뮬레이션으로 재생 (공 좌표를 프레임마다 보내지 않음)
- **골키퍼 화면 (UPDATE 3)**: 키커와 같은 방향에서 골대 정면 — 골대 전체(폭 약 78%, 양 포스트·크로스바 여백 포함), 골키퍼 정면, 앞쪽에 공·키커.
  화면 왼쪽으로 스와이프 = 화면 왼쪽으로 다이빙 (두 사람 모두 같은 화면 방향)
- **슛 전송**: 초기 속도 + 스핀 + 파워 (약 100바이트)
- **판정**: 서버가 같은 시뮬레이션(`src/online/match/penaltyRound.ts`를 빌드 때 `server/judge.gen.mjs`로 번들)으로
  슛 + 골키퍼 다이빙을 재생해 GOAL/SAVE/MISS 결정 → `round:result`를 두 사람에게 동시에 전송
- **골키퍼(사람)**: 스와이프 ←/→ 다이빙 · ↖/↗ 위 구석 · ↑ 점프 · ↓ 낮게 · 짧은 좌우 = 낮게 / PC는 방향키(↑+←/→ 동시 = 위 구석)
  - 킥 전에 고르면 그 방향으로 고정(키커에게는 숨김), 킥 순간에 몸을 던짐. 한 번 고르면 변경 불가
  - 킥 이후 입력은 그 시점에 다이빙 (반응 속도 그대로). 네트워크 지연을 넘는 과거 시각은 서버가 보정
- 슛 제한시간 25초(안 차면 MISS), 결과 2.6초 표시 후 역할 교대, 동점은 DRAW (`MATCH_RULES.suddenDeath`로 확장 예정)
- 경기 중 한쪽이 끊기면 즉시 "상대방의 연결이 종료되었습니다." + [온라인 로비로 돌아가기]
- claude.ai에 게시된 페이지(서버 없음)에서는 1단계 매칭 화면까지만 동작

## 테스트

```bash
npm run sim                                   # 헤드리스 물리/판정 시뮬레이션 (브라우저 불필요)
npm run build:single && python3 scripts/e2e.py  # 싱글플레이 모바일 E2E
npm run test:lobby                            # 온라인 프로토콜 (여러 클라이언트, 가짜 시계)
npm run online & python3 scripts/online-e2e.py  # 브라우저 3개 실시간 E2E (WebSocket 서버)
npm run test:match                            # 서버 권한 경기 로직 (가짜 시계, 10라운드·판정·끊김·스쿼드)
npm run server & python3 scripts/squad-e2e.py # UPDATE 4 스쿼드 흐름 (카드·순서·저장·선수 등장)
PIPA_SLOW_TEST=1 npm run server & python3 scripts/match-e2e.py  # 브라우저 2개로 온라인 경기 전체
python3 scripts/artifact-room-e2e.py          # claude.ai room 어댑터 E2E (계약 스탠드인)
```

## 조작 (슛 경로 직접 그리기)

1. 공(또는 공 주변)을 누른다
2. 누른 채로 원하는 **슛 경로를 그린다** → 골드 트레일로 실시간 표시
3. 손을 떼면 **실제 물리로 계산한 비행 경로**가 흰색 점선으로 표시되고, 키커가 차는 순간 공이 그대로 날아간다

## 공 물리 (UPDATE 3 + 커브 개선) — `src/game/physics/BallPhysics.ts`

그린 선은 레일이 아니라 **의도**다. 화면 스트로크에서 네 가지를 **따로** 읽는다 (`input/strokeReader.ts`):

| 스트로크 특징 | → 슛 |
|---|---|
| 골문 위 끝 지점 | 조준 (방향·도착 높이) |
| 좌우로 휜 정도 (주된 휨 1개, S자는 큰 쪽만) | 사이드스핀 3단계: 약 / 중 / 강 |
| 끝점보다 위로 솟은 정도 | 로빙(높이) — 없으면 낮게/중간으로 깔리는 직선 슛 |
| 그리는 속도 | 파워 |

- **슛 프로필** (`shotProfile`): STRAIGHT / CURLED(오른발 인프런트, 왼쪽으로 감김) / OUTSIDE_FOOT(아웃프런트, 오른쪽으로 감김)
  — 키커 발동작도 프로필에 맞춰 바뀜. 휨과 높이는 서로 섞이지 않음 (커브를 그려도 공이 뜨지 않음)
- **물리** (`simulateBallPhysics`, 1/480초 고정 스텝): 중력 · 가벼운 2차 공기저항(전진 속도 유지) ·
  Magnus 측면힘 `a = spin × v` (빠를수록·회전 클수록 강하게, 상한 있음) · 스핀 감쇠 · 바닥 바운드
  - 수직 Magnus 없음 → 다시 떠오르지 않음, 급커브·U턴·S자 불가
  - 모드별: 페널티 `curveMultiplier 0.8 · maxApex 3.0` / 프리킥 `1.0 · 4.6` / 온라인 = 페널티와 동일
  - 최저 속도 상향(페널티 17, 프리킥 19 m/s) → 천천히 그려도 위로 떴다 뚝 떨어지지 않고 앞으로 진행
- 흰색 점선 = 같은 시뮬레이션 그대로 (실제 비행과 일치) · 골대·크로스바 실제 원기둥 충돌
- 결정적(+−×÷√만 사용) → 두 폰과 서버의 판정이 같음

## 구조

```
src/
  App.tsx                       화면 전환 (로그인 → 모드 선택 → 게임)
  screens/                      LoginScreen · ModeSelectScreen · GameScreen
  components/                   GameHUD · ResultBanner
  game/
    core/        types · config(경기장 규격, 모드별 튜닝, 카메라) · math(시드 RNG)
    physics/     ShotModel      그린 경로(3D 스플라인)를 따라가는 비행 + 공기저항
    input/       SwipeController (pointer events, 스크롤 차단) · strokeReader (그린 경로 → 3D 궤적)
    entities/    Humanoid(관절 리그/포즈) · Player(키커) · Goalkeeper · DefensiveWall · Ball
    world/       Stadium(관중석·광고판·잔디) · Goal(골대·네트 출렁임)
    render/      Trajectory (골드 트레일 · 흰색 점선) · cameraFraming (카메라 구도/FOV)
    KickGame.ts  렌더러와 무관한 시뮬레이션/판정 (aim → runup → flight → result)
    PenaltyGame.ts · FreeKickGame.ts
    GameView.ts  WebGL 렌더러, 카메라 프레이밍(FOV 자동 계산), 루프, 입력 연결
    session/     MatchSession   ← 온라인 PvP 확장 지점
```

### PvP 확장 포인트

- 슛 하나는 `ShotInput {points(3D 경로), power}` + 위치 + RNG 시드로 **완전히 재현**됩니다
  (고정 1/120s 스텝 시뮬레이션). 서버가 같은 입력으로 결과를 검증/재생할 수 있습니다.
- `MatchSession` 인터페이스의 `LocalSession`을 `OnlineSession`(WebSocket 등)으로 교체하면
  턴 교대·상대 슛 수신을 붙일 수 있습니다. `KickGame`은 Node에서도 돌아갑니다(`scripts/sim.ts`).

### 튜닝 위치

- 카메라 구도/골대 화면 비율: `core/config.ts` → `camera` (골대 너비 비율로 FOV를 자동 계산)
- 슛 속도·드로잉 속도 감도: `core/config.ts` → `minSpeed/maxSpeed/swipeSpeedMin/Max`
- 골키퍼 난이도: `core/config.ts` → `keeper`
  - 페널티킥(예측형): `guessCorrect`(읽은 방향대로 다이빙 확률), `guessCentre`(중앙 잔류), `leadMax`(접촉 직전 판단 시점), `readNoise`
  - 프리킥(반응형): `reactionMin/Max`(빠른 공 ↔ 느린 공 반응 지연), `stepRange/stepSpeed`(사이드 스텝), `readNoise`(공 궤적 인지 오차)
  - 공통: `diveBase/diveScale`(다이빙 소요 시간), `maxHipTravel`(최대 이동 거리)

### 골키퍼 AI (`entities/Goalkeeper.ts`)

- **PENALTY — 예측형**: 도움닫기 중 긴장 자세만, 발이 공에 닿는 순간(최대 0.05초 전) 키커의 몸 방향·상체 기울기만 보고 방향 결정.
  약 70~80%는 맞는 방향, 나머지는 반대 방향/중앙 잔류. 서 있던 키퍼만 실제 공을 보고 한 번 손을 뻗을 수 있음.
- **FREE KICK — 반응형**: 슛 전에는 중앙 준비 자세. 슛 후 180~350ms 반응 지연(빠른 공일수록 짧게) 뒤
  실제 공의 위치·속도·측정된 휨/낙하만으로 골문 도착점을 20회/초 갱신 → 사이드 스텝 → 남은 시간에 맞춰 점프/다이빙.
  사용자가 그린 경로 데이터는 사용하지 않음.

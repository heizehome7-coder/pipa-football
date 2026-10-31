# PIPA · FOOTBALL GAME

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
| `npm run online` (빌드 + 서버) | 내장 WebSocket 서버 `server/realtime-server.mjs` → http://localhost:8787 |
| 파일로 직접 열기 | 온라인 비활성 (안내 표시) |

- 프로토콜: `src/online/LobbyClient.ts` — 각 클라이언트가 presence 하나(닉네임·상태·보낸 신청·답변·매치)를 공유
- 상태: `online` / `in_lobby` / `pending` / `in_match`, 신청: `pending` / `accepted` / `rejected` / `cancelled` / `expired`(30초)
- 동시 신청 → 먼저 만들어진 신청 하나로 합쳐짐, 끊긴 사용자는 목록·신청·매치에서 자동 정리
- 매치 ID = 신청 ID, 매치 전용 방(`pipa-m-<id>`)에 두 사람이 입장 → 다음 단계 온라인 경기에 사용

## 테스트

```bash
npm run sim                                   # 헤드리스 물리/판정 시뮬레이션 (브라우저 불필요)
npm run build:single && python3 scripts/e2e.py  # 싱글플레이 모바일 E2E
npm run test:lobby                            # 온라인 프로토콜 (여러 클라이언트, 가짜 시계)
npm run online & python3 scripts/online-e2e.py  # 브라우저 3개 실시간 E2E (WebSocket 서버)
python3 scripts/artifact-room-e2e.py          # claude.ai room 어댑터 E2E (계약 스탠드인)
```

## 조작 (슛 경로 직접 그리기)

1. 공(또는 공 주변)을 누른다
2. 누른 채로 원하는 **슛 경로를 그린다** → 골드 트레일로 실시간 표시
3. 손을 떼면 최종 궤적이 **흰색 점선**으로 표시되고, 키커가 차는 순간 공이 그 경로를 따라 날아간다
   (공이 출발하면 점선은 사라짐)

- 경로 **모양**: 직선 → 직선 슛 · 왼쪽/오른쪽으로 휘면 그 방향으로 감기는 슛 · 높게 볼록 → 로빙
- 그리는 **속도**: 빠르게 → 강한 슛 · 천천히 → 느린 슛 (모양과 별도로 계산)
- 골대까지 못 미친 짧은 경로는 마지막 진행 방향으로 이어서 낮은 슛이 됨
- 결과 표시 후 화면 탭 = 다음 슛

### 2D 스트로크 → 3D 궤적 변환 (`input/strokeReader.ts`)

1. 원시 포인트를 호 길이 기준으로 재샘플링 + 가벼운 스무딩(떨림 제거, 휨은 유지)
2. 시작점을 공에 맞추고, 끝점은 카메라 광선으로 골대 평면(z=0)에 투영
3. 원근 보정 재샘플링 후, 각 점이 놓인 카메라 광선 위에서
   `P(s) = 전진·s + 옆휨(스핀) + 높이(중력 포물선 1개)` 형태의 비행 곡선을 최소제곱으로 맞춤
   → 공의 3D 경로를 화면에 투영하면 손으로 그린 선과 겹친다 (테스트 기준 오차 ≈5px)
4. 결과 곡선은 Catmull-Rom 스플라인으로 만들어 공이 그대로 따라간다
   (자동 포물선·자동 사이드스핀 없음, 공기저항만 속도에 반영)

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

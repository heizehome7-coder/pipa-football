# PIPA · FOOTBALL GAME  — UPDATE 10 · SEASON 1

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
- 골 세리머니: 모든 선수 공통 "두 손 들고 환호" + 실패(SAVE/MISS/POST/CROSSBAR) 리액션 — `reactions.ts`; 리액션 중 입력 잠금(~2초)
- 카드 앞면 OVR + POWER/ACCURACY/CURVE, 상세에 전체 능력 + SPECIAL ABILITY. 등 이름 크기 확대

## UPDATE 10 — EVOLUTION & SEASON 1 (`GAME_VERSION = 10`, 화면 표시 "UPDATE 10" + 별도 "SEASON 1")
- **HOME**: 혼자서 · 온라인 · SQUAD · TRANSFER MARKET · **EVOLUTION** · **진화 재료 상점** · PACKS · EVENT CENTER · **WEEKLY MISSIONS** · RANKING · **MATCH STATISTICS** · 개발자 모드
- **시즌** (`src/progress/season.ts`, `SEASON = 1`): 계정마다 처음 읽힐 때 한 번만 지난 시즌 온라인 전적을 `seasonHistory`에 보관하고 0부터 시작(`data.season` 저장 → 재시작해도 다시 초기화 안 됨). 초기화 대상은 온라인 전적과 승리 랭킹뿐 — MP · FV · 선수 · 스쿼드 · 진화 · 재료 · 팩 · 토큰 · 거래 · 레벨/XP · 출석 · 계정 유지, MP 랭킹 유지
- **수비수 이적시장 제외**: 주 포지션 CB/LB/RB/LWB/RWB 35명은 구매·판매 등록·팩 불가(`isBuyable`, `packPool`). 이미 가진 카드·스쿼드는 그대로, 서버 시작 시 열려 있던 수비수 판매 등록은 자동 취소 후 원래 주인에게 반환. playerId 변경 없음
- **신규 선수 50명** (총 250명, 판매 215명): PIPA ORIGINAL 9명(송인우 · 조현선 · 박승호 · 박사하 GK 162 cm · 김태인 ICON · 박준혁 · 이윤호 CHIP SHOT ONLY · 최건우 · 한동연 — 게임 오리지널 선수, 실제 프로 선수 아님, 카드에 "PIPA ORIGINAL") · 현역 31명 · ICON 10명. 새 특수능력 9종(`TWO_FOOT_CURL_MASTER`, `THUNDER_STRIKE`, `UNSTABLE_CANNON`, `SMALL_FLYING_KEEPER`, `ICON_POWER_DRIVE`, `SILK_FINESSE`, `CHIP_SHOT_ONLY`, `WILD_POWER`, `WILD_LEFT_CURL`)이 실제 슛/다이빙에 적용. 박사하는 162/188 크기로 그려지고 충돌도 같은 크기(빠른 다이빙·높이 도약, 대신 높은 공 리치는 짧음)
- **수비벽 키 랜덤** 165~200 cm: 몸 전체 비율 그대로 크기 조절, 충돌 = 보이는 몸. 온라인은 라운드 시드(`roundSeed`)로 두 폰·서버 판정이 같은 벽
- **진화 재료 상점**: OVR 130/135/140/145/150 = 50M/120M/250M/500M/900M MP 또는 150/300/600/1,200/2,200 FV(한 번에 한 화폐). 재료는 별도 인벤토리, 거래 불가(UNTRADEABLE)
- **EVOLUTION** (`src/progress/evolution.ts`): +0 → +12, 기본 확률 90/80/70/60/50/38/28/18/10/5/2/0.75 %. 재료 OVR < 선수 ×0.6~0.85 · 같음 ×1.1 · 높음 ×1.2~1.3, 최대 95 %, +10부터는 좋은 재료로도 기본 확률보다 쉬워지지 않음. 재료는 성공/실패 상관없이 소모, 실패해도 단계 유지. OVR +3/단계(~+9), +6/단계(+10~+12). +10 SPECIAL PERFORMANCE BOOST · +11 ELITE EVOLUTION BOOST · +12 MAX EVOLUTION. 결과는 서버 crypto 난수, nonce로 중복 방지. 진화 레벨은 카드에 저장(무료 스타터는 `starterEvo`), 진화 카드는 판매 불가
  - 실제 성능: 슛(속도·정확도·회전·너클, 물리 한계 유지) · GK(도약·이동·리치·반응·체공). 카드 "+N", +10↑ 빛, +12 MAX 테두리, 키커/GK 소개 · 골 카드 · HUD 표시. 온라인은 서버가 가진 진화 레벨만 사용(`squad.evo`), `validShotFor`가 진화 레벨까지 검사
- **온라인 이모티콘**: 🔥 💀 🤫 🤯 😃 ⚽️ 💔 동 EZ · 약 2초 표시 · 3초 쿨다운(서버도 검사) · 무음 · "상대 이모티콘 숨기기"
- **WEEKLY MISSIONS** (매주 월요일 00:00 KST 초기화, `src/progress/missions.ts`): PERFECT SHOOTOUT 120 FV · PLAY 5 MIN 50 FV(실제 플레이 시간만, 서버가 보고 간격 검사) · 온라인 3판 30 FV · 10골 20,000,000 MP · 프리킥 1승 50 FV. 주마다 1번 CLAIM
- **MATCH STATISTICS**: 모든 유저의 이번 시즌 온라인 전적(TOTAL / PENALTY / FREE KICK · 경기 · 승/패/무 · 승률), 닉네임 검색, 조회 전용
- 홍 나와라 뚝딱 1회 100 FV · 10회 1,000 FV(확률·보상 그대로) · 감자의 제왕 20라운드(규칙·비용·보상 그대로)
- **버그 수정**: 닉네임 `constructor`/`__proto__` 가입 시 500 오류 → 예약어 거부 + 저장소 null-prototype · 즐겨찾기/홍 등급/팩 종류에 프로토타입 키를 넣으면 통과되던 문제 → 자기 키만 허용 · nonce를 다른 기능에 재사용 가능 → 기능별 nonce · 옆으로도 높이도 벗어난 공이 "크로스바 위로" → "골대 밖"
- API: `/api/evo/buy {ovr, currency, nonce}`, `/api/evo/evolve {cardKey, materialId, nonce}`, `/api/missions/state|play|claim`, `/api/stats {q, board}`
- 테스트: `npx tsx scripts/update10-test.ts`, `node scripts/update10-server-test.mjs`, `python3 scripts/update10-e2e.py`

## UPDATE 9.5 — 버그 수정 & 작은 기능 (`GAME_VERSION = 9.5`, 화면 표시 "UPDATE 9.5")
- **버그 수정**: HOME PACKS 숫자 = PLAYER + GOOD + LEGEND 팩 합계(이전엔 PLAYER PACK만) · "CLUB TBA" 6명 클럽 지정(권창훈 JEJU SK · 홍현석 FC MIDTJYLLAND · 이동경 ULSAN HD · 이동준 JEONBUK HYUNDAI · 스가와라 WERDER BREMEN · 무코코 FC COPENHAGEN, 2026년 11월 기준) · GK 조이스틱이 느린 폰(긴 프레임)에서도 실제 경과 시간만큼 이동(최대 1초 프레임까지)
- **골대 약간 축소**: 7.32 × 2.44 m → 7.14 × 2.38 m(약 −2.5 %, `FIELD` 한 곳) · 온라인 GK 라인 ±2.92 m
- **온라인 GK 조이스틱 — 키커 런업 중에도 이동**: 상대가 슛을 그린 뒤 달려오는 동안에도 좌우 이동 가능. 단 범위는 가운데 ±1.4 m(슛 순간 서 있던 곳까지는 허용)로 제한, 걷는 속도 제한(서버 검사), 발–공 접촉 0.22초 전에 서버가 위치를 고정(`keeper:lock`)하고 두 폰에 같은 값을 보냄 → 두 폰 재생과 서버 판정이 같은 위치에서 다이빙
- **관심 선수(★)**: 이적시장 카드·상세의 ☆/★, `★ 관심` 필터(검색·정렬과 함께), 계정에 저장(`/api/favorites`) → 다른 기기에서도 동일, 최대 60명
- **감자의 제왕 기록**: 내 최고 점수 · 플레이 횟수 · 최근 기록(점수·보상·시간), 최고 기록 경신 표시(서버가 판정 `newBest`)
- **개발자 모드 · FV · 토큰 · 팩 지급** (`/api/dev/grant-items`): FV(1~100,000) · 동/은/금/홍 토큰(1~100) · GOOD / LEGEND PACK(1~100), 확인 창(현재 → 지급 후), 개발자 로그(GRANT_FV …), 유저 화면에 바로 반영, 유저 목록에 FV·토큰·팩 표시
- 테스트: `node scripts/update95-server-test.mjs`, `python3 scripts/update95-e2e.py` (+ `match-test` 런업 이동·잠금)

## UPDATE 9 — EVENT CENTER & PLAYER BALANCE
- **HOME**: 혼자서 · 온라인 · SQUAD · TRANSFER MARKET · PACKS · **EVENT CENTER** · RANKING · 개발자 모드. `GAME_VERSION = 9`
- **EVENT CENTER** (`src/screens/EventCenterScreen.tsx`, 숫자·확률은 `src/progress/events.ts` 한 곳). 모든 결과는 서버(`server/accounts.mjs`)가 crypto 난수로 정하고 FV 차감·결과·토큰/MP/카드를 **한 번의 저장**으로 처리(계정 잠금). 같은 요청의 재전송(nonce)은 같은 답만 돌려줌 → 새로고침·여러 탭·연타로 중복 수령 불가
  - **홍 나와라 뚝딱**: 1회 50 FV · 10회 500 FV(독립 추첨 10번). 동 50 % · 은 30 % · 금 15 % · 홍 5 %(보정·확정 없음). 박이 흔들림 → 열림 → 등급 색 빛(홍 = 붉은빛+금색), SKIP, 무음. 토큰 `hong{bronze,silver,gold,red}` 서버 저장. 교환소(1개씩): 동 20,000,000 MP · 은 50,000,000 MP · 금 LEGEND PACK ×1 · 홍 TOP LEGEND(펠레·마라도나·호나우두 나자리우·호나우지뉴·지단 20 %씩)
  - **감자의 제왕**: 50 FV(START 때 서버 차감) · 8구멍(4×2) · 12라운드 × 1초. 1~4R 일반(+1), 5R~ 빨간(−1), 8R~ 썩은(−2), 같은 구멍 중복 없음, 점수 = max(0, 점수 + 점) · 10~12점 GOOD PLAYER PACK · 6~9점 30,000,000 MP · 0~5점 10,000,000 MP(정확히 1번). 서버 세션(sessionId·라운드별 감자·점수·클릭 기록·시작 시각·상태)이 감자를 정하고, 터치 `{sessionId, round, holeId}`를 서버 시계(+450 ms 지연 허용)로 검사. 같은 감자 2번·지난/미래 라운드·종료 후 터치는 무효. 게임 도중 새로고침하면 서버 시계대로 이어지고, 끝까지 안 보고 나가도 다음 접속 때 보상이 1번 정산됨
  - API: `/api/events/state`, `/api/events/hong/draw {count, nonce}`, `/api/events/hong/exchange {grade, nonce}`, `/api/events/potato/start|tap|finish`
- **팩 3종** (`src/progress/packs.ts`, 개봉 연출 공유): PLAYER PACK(기존) · GOOD PLAYER PACK(1억~4억 50 % · 4억~8억 30 % · 8억~14억 15 % · 14억~20억 5 %, 1억 미만 없음) · LEGEND PACK(12억~14억 55 % · 14억~17억 30 % · 17억~20억 15 %). 구간은 [이상, 미만)(마지막만 이하), 구간 안에서는 몸값이 낮을수록 확률↑(1/가격), 빈 구간은 비율대로 재분배. `/api/packs/open {kind: player|good|legend}`
- **팩 연출 시간**: COUNTRY 1.8 s · POSITION 1.5 s · CLUB/ICON 1.8 s, 각 단계 페이드 인 → 정지 → 페이드 아웃, SKIP 유지. 클럽 정보가 확실하지 않은 선수는 "CLUB TBA"
- **이름 한국어화**: 모든 화면(카드·스쿼드·이적시장·팩·골 카드·키커 배너)에 한국어 이름(`nameKo`), 유니폼 등 이름만 영어. playerId 변경 없음
- **이적시장 검색**: 한글/영어/대소문자/악센트 무시(`matchesSearch`), 필터·정렬과 함께 동작, 결과 없음 안내, 무료 스타터 안내
- **신규 선수 50명**: 한국/저가 20 · 해외 20 · ICON 10 → 이적시장 200명
- **레프 야신**(99/99/99/99/98/99/99, BLACK SPIDER): `BLACK_SPIDER` 설정(`Goalkeeper.ts`)이 실제 다이빙에 적용 — 빠른 도약·비행, 수평·수직 리치(손끝 콜라이더), 체공 +22 %, AI 반응, 공중 캐치. 방향·타이밍이 맞으면 상단 구석까지 닿고, 반대 방향/늦은 입력/완벽한 구석 강슛은 실점
- **무료 스타터 GK 너프**(쿠르투아·노이어·알리송): 표시 능력치를 낮춤(능력치가 곧 실제 다이빙 속도·리치·AI 반응 → 표시 = 실제 성능)
- **SPECIAL 강화**: 특수능력마다 한 가지 강점을 더 분명하게(전 능력 동시 강화 없음). 호날두 KNUCKLE DRIVE — 발동 파워 0.64(이전 0.72) + 거의 직선인 빠른 스트로크(약한 커브)도 너클로 인식, 너클 강도 최대 1.35(다른 선수 ≤ 1), 90°꺾임·U턴 없음. 메시·호나우지뉴·살라·야말·손흥민·네이마르·더 브라위너 감아차기 회전 효율↑·오차↓(한 방향으로만 부드럽게). 펠레 97/99/96/92/98/95/99 KING OF FOOTBALL(강하게 차도 오차 최소, 자동 조준 없음)
- **온라인 검증**: 서버가 그 라운드의 실제 키커(`roundTaker` — 양쪽 화면과 같은 규칙)를 정하고 `validShotFor`로 그 선수의 능력·특수능력이 낼 수 있는 최고 속도·회전·너클을 넘는 슛을 거부 → 능력치 999·특수능력 강제 발동 불가
- 테스트: `npx tsx scripts/update9-test.ts`, `node scripts/update9-server-test.mjs`, `python3 scripts/update9-e2e.py`

## UPDATE 8 — PLAYER PACK & ONLINE GAMEPLAY
- **선수 DB 하나**: `src/players/players.ts`(+ `market.ts` 데이터, `clubs.ts` 클럽) — `primaryPosition`, `club`, `isIcon`, `tradeable`, 가격·능력치·특수능력. 팩과 이적시장이 같은 레코드를 씀. 신규 50명(현역 30 · ICON 18 · 김인직 ICON ST · 허신 LIVERPOOL ST) → 이적시장 150명
- **PLAYER PACK** (`src/progress/packs.ts` 확률 설정 한 곳, `/api/packs/open`): 서버가 팩 확인 → 1개 차감 → 거래 가능 선수 풀(스타터 제외) → crypto 가중 추첨 → 카드 저장 → 결과 반환. 새로고침해도 다시 뽑을 수 없음. 확률: 10M~150M 45% · ~400M 30% · ~800M 17% · ~1.4B 6% · 그 이상(최고 ICON) 2%
- **카드 인스턴스**: `cards[{id, playerId, source}]` (중복 가능, `owned`는 그 playerId 목록). 같은 선수 2장 보유 가능, 한 스쿼드에 같은 선수 2명은 불가, 스쿼드에 쓰는 1장 외 여분은 판매 가능, 판매 취소 시 같은 카드 id로 복귀
- **팩 개봉 연출**(무음): OPEN → 빛/파티클 → COUNTRY → POSITION(대표 1개) → CLUB 또는 ICON(PIPA 자체 엠블럼) → 큰 PLAYER CARD. 티어별 글로우(그린 → 블루/퍼플 → 골드 → 프리미엄 골드+화이트), 0.5초 뒤 SKIP. CSS 파티클만 사용(영상 없음)
- **일일 로그인** DAY 6/7 → `unopenedPacks` → PACKS의 AVAILABLE ×N
- **개발자 모드 · PACK 지급** (`/api/dev/grant-packs`, 1~100개, 개발자 토큰, 로그 GRANT_PACKS, 유저 화면에 바로 반영)
- **사운드 전부 삭제**(킥/그물/관중/토글/AudioContext). GOAL 진동(45ms)은 유지
- **온라인 GK 조이스틱**(왼쪽 아래, 좌↔우만): 골라인을 따라 x만 이동(z 고정), ±3.0 m(포스트 − 몸 여유)로 서버가 clamp, 약 12 Hz 전송, 키커 화면에 셔플 애니메이션으로 표시. 슛 순간 위치가 고정되어(`shot.keeperX`) 서버 판정·양쪽 재생이 같은 위치에서 다이빙(다이빙 방향은 서 있는 위치 기준). PENALTY·FREE KICK 모두
- **온라인 FREE KICK 밸런스**: 수비벽 +4 % 폭(+1 % 높이, 위치·인원 그대로) · GK 다이빙 시작 +0.14 s(체중 이동이 더 보이고 최종 리치는 그대로, PENALTY는 변경 없음) · 감아차기가 일찍 휨(사이드 포스가 처음 1.3배에서 서서히 줄어듦 → 비행 60 %에서 방향 변화의 76 %, 이전 66 %; 총 휘는 양은 거의 같음, 후반에 반대로 꺾이지 않음, 점선 미리보기 = 실제 궤적, 너클은 그대로)
- 테스트: `node scripts/update8-test.mjs`, `npx tsx scripts/update8-physics-test.ts`, `npx tsx scripts/fk-balance-exp.ts`, `python3 scripts/update8-e2e.py`

## UPDATE 7 핫픽스 — 골키퍼 다이빙 리워크 & USER SQUADS (버전 표기는 UPDATE 7 유지)
- **다이빙** (`src/game/entities/Goalkeeper.ts` → `DIVE`, `updateDive`): READY → 체중 이동·사이드 로드 → 반대발 푸시오프 → 이륙 → 풀 익스텐션 → 체공(hang) → 착지. 엉덩이는 속도 곡선(초반 빠르게, 뻗을수록 감속)과 포물선으로 날아감(목표 지점 lerp 아님). LOW / MID / HIGH × 좌우 미러 포즈, 두 손을 함께 뻗음
- **리치**: 보이는 손 = 충돌 위치(UPDATE 6의 보이지 않는 장갑 스트레치 제거). 리치는 실제 팔 길이(풀 스트레치에서 팔이 눈에 보이게 늘어남)와 몸 이동량. 위팔에도 충돌체 추가(머리와 팔뚝 사이 구멍 제거). 표준 GK 측면 도달 2.95 → 3.26 m(+10.6 %), 낮은 다이빙 1.74 → 1.91 m(+9.8 %), 착지 0.81 → 1.04 s
- **사람 키퍼(온라인)**: 방향·타이밍은 선택 그대로. 다이빙 "깊이"만 키커의 발 방향(커브 제외)으로 일부 보정 — 코너 방향을 골라도 가까운 공을 지나쳐 날아가지 않음. 슛 순간(−0.12 ~ +0.07 s)에 고르면 내부 퍼펙트 보너스(빠른 푸시오프, 약간 긴 이동). 늦은 입력은 여전히 실패, 미리 고른 방향은 바꿀 수 없음
- **스탯**: DIVING(푸시오프·속도·체공), REACH(팔 길이·이동량), LOW/HIGH SAVE(높이별 이동량), REFLEX(AI 반응, 사람은 아주 조금), POSITIONING·PENALTY READ(AI만). 무작위 세이브 없음 — 이동량에 ±1.2 %의 아주 작은 실행 오차만
- **특수능력**: LONG REACH(쿠르투아, 측면 이동 +1.5 %), HIGH REACH(돈나룸마, 높은 다이빙 +4 %), LOW SAVE(알리송, 낮은 다이빙 빠른 푸시·+3.5 %), POSITION MASTER(노이어, 안정적인 출발·AI 판단), PENALTY SPECIALIST(마르티네스, AI 예측)
- **레프 야신**: 99/99/99/99/97/99/98 + **BLACK SPIDER**(가속 +10 %, 풀 스트레치 손 리치 +8 %, 높은 다이빙 +7 %, 체공 +8 %). 중간 속도 슛이 두 손 사이로 오면 공중 캐치(`BLACK SPIDER 공중 캐치!`), 강슛·손끝 접촉은 펀칭. 무적 아님
- 측정(`npx tsx scripts/keeper-dive-exp.ts`, 방향 맞춤 기준 세이브율): UPDATE 7 46.7 % → 라야 58 · 표준 59 · 마이냥 60 · 알리송 61 · 쿠르투아/돈나룸마 62 · 야신 64 %. 반대 방향 ~10 %(변화 없음), 늦은 다이빙 36~43 %. 강한 코너 슛: 표준 0 % · 최상위 17~21 % · 야신 24 %
- 싱글플레이 프리킥 AI는 같은 다이빙을 쓰되 판단 오차(`readNoise` 0.7 → 1.0)로 기존 난이도 유지(on-target 세이브 ~46 % → ~44 %)
- **개발자 모드 · USER SQUADS** (`/api/dev/squad`, 개발자 토큰 필수, 읽기 전용): 닉네임 검색(부분 일치 → 목록), 서버에 저장된 스쿼드만(폰의 localStorage는 절대 안 씀) — 승부차기 1~5번 · GK · 프리킥 키커를 선수 카드(이름 · OVR · 포지션 · 특수능력)로, 보유 선수 보기
- 테스트: `npx tsx scripts/keeper-hotfix-test.ts`, `python3 scripts/hotfix-e2e.py`

## UPDATE 7 — RANKING & PROGRESSION
- 밸런스 숫자는 전부 `src/progress/progression.ts` 한 곳 (서버도 같은 파일을 번들해서 사용)
- **랭킹** (`/api/ranking`): MP · PENALTY WINS · FREE KICK WINS, TOP 100 + MY RANK. 동률: 승률 → 경기 수 → 최근 승리. 경기 결과·구매·지급이 생기면 서버가 `ranking:changed`를 3초에 한 번까지만 알리고, 열려 있는 랭킹 화면이 스스로 갱신
- **프로필** (`/api/profile`): 레벨, MP, FV, 모드별 전적
- **레벨/XP**: 정상 종료된 온라인 경기만 (승 120 · 무 80 · 패 60 XP), 경기당 1번(`results` 키). 구간별 XP 곡선, 최대 LV 50(MAX LEVEL). 결과 화면에 +XP / LEVEL UP! / NEW REWARD
- **FV**: MP와 별개 재화. 5레벨마다 CLAIM으로 받음(자동 지급 아님), `claimedLevelRewards`로 중복 방지
- **일일 로그인** (`/api/daily/claim`): 서버 날짜(한국 시간) 기준 하루 1번, DAY 1~5 MP · DAY 6/7 PLAYER PACK(`unopenedPacks`만 +1, 팩 열기는 다음 업데이트). 하루 건너뛰면 DAY 1
- **선수 판매**: MY PLAYERS → SELL PLAYER (가치의 80~120%) → LISTED. 실제로 팔릴 때만 70% 지급(수수료 30%). 스타터 UNTRADEABLE, 스쿼드 사용 중이면 판매 불가, CANCEL LISTING, 자기 매물 구매 불가. 구매 시 같은 선수의 유저 매물(최저가 → 먼저 등록 순)을 시스템 카드보다 먼저 체결. 구매자·판매자·매물은 한 트랜잭션(PostgreSQL BEGIN/COMMIT). 판매자에게 실시간 알림, 오프라인이면 다음 접속 때
- **사운드** (`src/audio/sound.ts`): 킥(발이 공에 닿는 프레임), 그물(GOAL만), 관중 함성(GOAL, 약 3초) — 모두 코드로 합성(외부 음원·다운로드 없음), 첫 터치 후 미리 생성. 🔊 SOUND / 🔇 MUTED (기기에 저장). 온라인은 각 폰이 서버의 슛을 재생하며 같은 순간에 소리
- **골 진동**: GOAL에만 45ms (휴대폰만, 미지원 브라우저는 무시)
- 개발자 모드 최근 접속자에 LV · XP · MP · FV · 승부차기/프리킥 승 · 출석 연속일 표시
- 테스트: `node scripts/account-test.mjs`, `DEVELOPER_CODE=… PIPA_TEST_DB=… node scripts/pg-market-check.mjs`, `python3 scripts/update7-e2e.py`

## UPDATE 6 추가 패치 — DEVELOPER MODE & 득점 선수 카드 (버전 표기는 UPDATE 6 유지)
- **DEVELOPER MODE** (홈 메뉴 → 개발자 코드 → DEVELOPER DASHBOARD) — `src/screens/DeveloperScreen.tsx`, 서버 `server/accounts.mjs`
  - 코드는 서버만 확인: Render 환경변수 `DEVELOPER_CODE`가 있으면 그 값, 없으면 서버 코드 안의 salt+scrypt 해시와 비교 (코드 원문은 저장소·브라우저 어디에도 없음). 틀리면 "인증이 되지 않았습니다.", 6번 틀리면 10분 잠금
  - 성공 시 2시간짜리 개발자 토큰 발급 → `/api/dev/users`, `/api/dev/grant`, `/api/dev/log` 모두 토큰을 서버가 다시 확인
  - 최근 접속자 100명 (lastLoginAt / lastSeenAt, 서버 시간, KST `YYYY-MM-DD HH:mm`, ONLINE/OFFLINE, 닉네임 검색)
  - 유저 전적: TOTAL / PENALTY / FREE KICK — 승·패·무, 경기 수, 승률. 서버가 정상 종료된 경기만 경기(matchId#게임)당 한 번 기록 (`results` = resultRecorded)
  - MP 관리: 유저 선택 → 현재 MP → 지급 MP 입력 → 확인창 → 서버가 검증(양의 정수, 최대 1,000억) 후 지급 → 접속 중이면 `wallet:update`로 즉시 반영. 모든 지급은 개발자 로그(`devlog.json` / 테이블 `pipa_dev_log`)에 GRANT_MP·대상·금액·시간 기록
- **득점 선수 카드**: GOAL일 때만 화면 왼쪽에서 득점 선수 카드가 슬라이드 인 → 약 2.3초 → 슬라이드 아웃 (`src/components/GoalCard.tsx`). OVR·포지션·POWER/ACC/CURVE/FK·SPECIAL, SPECIAL별 테두리(피네스·파워·화려함·스피드), LEGEND 골드. 온라인은 서버 결과의 `playerId`로 양쪽에 같은 카드
- 카메라: 왼발 키커가 프리킥 위치에 따라 화면 밖으로 살짝 나가던 문제 수정 (키커 전체가 보이도록 화각 자동 보정)

## UPDATE 6 — TRANSFER MARKET & ONLINE FREE KICK
- **MP 재화**: 서버(계정 DB)에만 저장 — `server/accounts.mjs` (`mp`, `owned`, `rewards`). 신규 0 MP
- **보상**: 온라인 PENALTY SHOOTOUT 승리 +10,000,000 MP. 서버가 경기 결과를 확인하고 지급, 경기(matchId#게임번호)당 1번만 (`server/matches.mjs` reward 훅). 패배/무승부/싱글/프리킥 대결 0 — 상수 `REWARDS` (`src/online/match/protocol.ts`)
- **TRANSFER MARKET**: 100명 (현역 65 + 레전드 35) — `src/players/market.ts`. 기존 15명 스타터는 판매 제외, 기존 5명(더 브라위너·레반도프스키·브루노·돈나룸마·E.마르티네스)은 같은 레코드에 가격만 추가. 필터 ALL/FW/MF/DF/GK/LEGEND, 정렬 가격/이름, BUY → 확인창 → 서버 구매 (`/api/market/buy`, 가격은 서버 카탈로그). SELL/TRADE/AUCTION은 아직 없음
- **SQUAD**: 보유 선수(스타터 + 구매)만 선택 가능, 서버가 미보유 선수 스쿼드를 거부. UPDATE 6 이전 계정은 이미 스쿼드에 있던 시장 선수를 계속 보유
- **ONLINE**: PENALTY SHOOTOUT / FREE KICK DUEL 선택 → 같은 로비·대결 신청·서버 매치 재사용. 프리킥은 각자의 FREE KICK TAKER, 상대의 GK를 사람이 조작, 4–5명 수비벽, 결과 GOAL/SAVE/MISS/BLOCKED/POST/CROSSBAR, 같은 쌍(1·2라운드 …)은 같은 위치
- **키퍼 reach 소폭 증가**: 팔 +4%, 장갑 +3 cm, 다이브 거리 +4.5%, 손끝 스트레치, 사람 키퍼 다이브 목표 옆 +6%/아래 +4.5%/위 +2% (반응·예측·시작 타이밍은 그대로). 손끝에 닿으면 바깥/위로 쳐냄
- 테스트: `node scripts/account-test.mjs`, `npm run test:match`, `python3 scripts/update6-e2e.py`, `npx tsx scripts/keeper-reach-exp.ts`

## 계정 (닉네임 중복 방지 + 계정 저장) — `server/accounts.mjs`
- 처음 쓰는 닉네임 + 비밀번호(4자 이상) → 계정 생성. 같은 닉네임(대소문자·전각 무시)은 비밀번호가 맞아야만 사용 가능
- 서버에 저장: 닉네임, 비밀번호(scrypt 해시), 로그인 토큰(sha256), 스쿼드. 자동 로그인(이 기기), 다른 기기에서 로그인해도 스쿼드 유지
- 로비 표시 이름은 서버가 토큰으로 확인한 계정 닉네임으로 고정 (다른 사람 닉네임 사칭 불가)
- 저장소: `DATABASE_URL`(PostgreSQL, 예: Neon 무료) → 영구 / 없으면 JSON 파일(`server/data`, Render 무료는 재시작 때 초기화)
- claude.ai 버전은 서버가 없어 기기 저장만 됨
- 테스트: `node scripts/account-test.mjs` (PIPA_TEST_DB=postgres://… 로 DB 모드도 테스트)

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

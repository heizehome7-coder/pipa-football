/**
 * UPDATE 4 — the 20 original players (+ UPDATE 6: 95 market players from ./market). The same list ships with every copy of the
 * game, so online only the ids travel over the network.
 *
 * NO ratings: every player plays with exactly the same physics and controls.
 * `look` is purely cosmetic (hair, beard, skin, height, build) so players can be told
 * apart in 3D and on their cards. Stats come in UPDATE 5+.
 */
import { HEIGHT_CM, MARKET_EXISTING_PRICES, MARKET_NEW, MARKET_ORDER, ORIGINAL_IDS, STARTER_IDS, type MarketCountry } from './market';
import { CLUB, PRIMARY_POSITION } from './clubs';

export type PlayerRole = 'FW' | 'MF' | 'DF' | 'GK';
export type CountryCode = MarketCountry;
export type HairStyle = 'bald' | 'buzz' | 'short' | 'sidepart' | 'fringe' | 'quiff' | 'spiky' | 'twists' | 'curly' | 'afro' | 'bun' | 'swept';
export type Beard = 'none' | 'stubble' | 'full';

export interface PlayerLook {
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  beard: Beard;
  /** body scale (kickers only — keepers keep the standard body so saves never change) */
  height: number;
  build: number;
}

/** UPDATE 5: field-player abilities (1–99) — small gameplay modifiers (user skill ≈ 70 %, player ≈ 30 %) */
export interface FieldStats {
  power: number;
  accuracy: number;
  curve: number;
  knuckle: number;
  lowShot: number;
  freeKick: number;
  composure: number;
}
/** UPDATE 11 patch: DEFENDER STATS (separate from the shooting stats) — every field player has them */
export interface DefStats {
  tackle: number;
  interception: number;
  marking: number;
  strength: number;
  positioning: number;
  pace: number;
}
export const DEF_STAT_LABELS: [keyof DefStats, string][] = [
  ['tackle', 'TACKLE'], ['interception', 'INTERCEPTION'], ['marking', 'MARKING'], ['strength', 'STRENGTH'], ['positioning', 'POSITIONING'], ['pace', 'PACE'],
];
export interface GkStats {
  reflex: number;
  diving: number;
  reach: number;
  positioning: number;
  lowSave: number;
  highSave: number;
  penaltyRead: number;
}
export type SpecialId =
  | 'POWER_BURST' | 'FINESSE_MASTER' | 'KNUCKLE_DRIVE' | 'LOW_DISGUISE' | 'LEFT_CURL' | 'TWO_FOOT_FINESSE'
  | 'PENALTY_PRECISION' | 'POWER_FINISH' | 'QUICK_LOW_CURL' | 'BALANCED_FINISH' | 'CONTROLLED_DRIVE'
  | 'LEFT_FINESSE' | 'DRIVEN_CURVE' | 'CLINICAL_FINISH' | 'SET_PIECE_CONTROL'
  | 'LONG_REACH' | 'POSITION_MASTER' | 'LOW_SAVE' | 'HIGH_REACH' | 'PENALTY_SPECIALIST' | 'BLACK_SPIDER'
  | 'KOREAN_LEGEND' | 'RED_FINISHER' | 'KING_OF_FOOTBALL'
  // UPDATE 10 — PIPA ORIGINALS
  | 'TWO_FOOT_CURL_MASTER' | 'THUNDER_STRIKE' | 'UNSTABLE_CANNON' | 'SMALL_FLYING_KEEPER' | 'ICON_POWER_DRIVE'
  | 'SILK_FINESSE' | 'CHIP_SHOT_ONLY' | 'WILD_POWER' | 'WILD_LEFT_CURL'
  // UPDATE 11
  | 'PRECISION_MASTER' | 'OUTSIDE_POWER' | 'GALLOPING_CANNON' | 'BOX_BOMBER' | 'FREE_KICK_ARTIST' | 'MAESTRO_CURL' | 'MAGIC_LEFT'
  // UPDATE 11 patch
  | 'TOE_POKE_SPECIALIST' | 'DEFENSIVE_WALL' | 'ONE_FOOT_FINESSE' | 'CHAOTIC_CANNON';

export const SPECIALS: Record<SpecialId, { name: string; desc: string }> = {
  POWER_BURST: { name: 'POWER BURST', desc: '빠르고 곧은 강한 스트로크에서 더 빠른 슛' },
  FINESSE_MASTER: { name: 'FINESSE MASTER', desc: '부드러운 곡선에서 가장 자연스럽고 강한 인프런트 감아차기' },
  KNUCKLE_DRIVE: { name: 'KNUCKLE DRIVE', desc: '강하고 곧은 슛이 무회전 너클로 흔들리며 날아감' },
  LOW_DISGUISE: { name: 'LOW DISGUISE', desc: '낮은 궤적에서 정교하고 빠른 땅볼 슛' },
  LEFT_CURL: { name: 'LEFT CURL', desc: '왼발 인프런트 커브 컨트롤 보너스' },
  TWO_FOOT_FINESSE: { name: 'TWO-FOOT FINESSE', desc: '좌우 어느 방향 감아차기도 같은 품질' },
  PENALTY_PRECISION: { name: 'PENALTY PRECISION', desc: '페널티에서 강하게 차도 오차가 매우 적음' },
  POWER_FINISH: { name: 'POWER FINISH', desc: '빠른 스트로크에서 최고 수준의 슛 속도' },
  QUICK_LOW_CURL: { name: 'QUICK LOW CURL', desc: '낮게 빠르게 구석으로 감기는 슛' },
  BALANCED_FINISH: { name: 'BALANCED FINISH', desc: '약점 없는 안정적인 올라운드 슛' },
  CONTROLLED_DRIVE: { name: 'CONTROLLED DRIVE', desc: '곧은 중거리·낮은/중간 슛 정확도 보너스' },
  LEFT_FINESSE: { name: 'LEFT FINESSE', desc: '왼발 감아차기가 강하고 부드럽게 휨' },
  DRIVEN_CURVE: { name: 'DRIVEN CURVE', desc: '강한 파워 + 커브에도 정확도 유지, 프리킥 특화' },
  CLINICAL_FINISH: { name: 'CLINICAL FINISH', desc: '페널티·낮은 마무리에서 매우 정확' },
  SET_PIECE_CONTROL: { name: 'SET PIECE CONTROL', desc: '페널티·프리킥 궤적 컨트롤과 정확도' },
  LONG_REACH: { name: 'LONG REACH', desc: '높은 코너와 먼 구석에 가장 강함' },
  POSITION_MASTER: { name: 'POSITION MASTER', desc: '좋은 준비 위치와 안정적인 다이빙 시작' },
  LOW_SAVE: { name: 'LOW SAVE', desc: '낮은 슛에 강함' },
  HIGH_REACH: { name: 'HIGH REACH', desc: '상단 코너 슛에 강함' },
  PENALTY_SPECIALIST: { name: 'PENALTY SPECIALIST', desc: 'AI 모드에서 페널티 방향 예측력 최고' },
  KING_OF_FOOTBALL: { name: 'KING OF FOOTBALL', desc: '정확도·파워·감아차기·낮은 슛 모두 최상급, 강하게 차도 원하는 곳으로' },
  KOREAN_LEGEND: { name: 'KOREAN LEGEND', desc: '강하고 정확한 ST 마무리 · 파워 슛 속도와 낮은 슛 정확도 보너스' },
  RED_FINISHER: { name: 'RED FINISHER', desc: '빠르고 강한 ST 마무리, 강하게 차도 흔들림이 적음' },
  // UPDATE 10
  TWO_FOOT_CURL_MASTER: { name: 'TWO-FOOT CURL MASTER', desc: '양발 모두 부드럽게 한 방향으로 감기는 최상급 감아차기 · 강한 직선 슛은 약함' },
  THUNDER_STRIKE: { name: 'THUNDER STRIKE', desc: '강하고 빠른 직선 슛 특화 · 최대 파워에서 공이 강하게 뻗음' },
  UNSTABLE_CANNON: { name: 'UNSTABLE CANNON', desc: '최고 수준의 강슛 · 풀파워일수록 목표에서 벗어날 위험' },
  SMALL_FLYING_KEEPER: { name: 'SMALL FLYING KEEPER', desc: '162cm의 작은 키, 폭발적인 순발력과 점프 · 높은 공의 정적 도달 범위는 불리' },
  ICON_POWER_DRIVE: { name: 'ICON POWER DRIVE', desc: '강력한 중거리 파워슛 · 프리킥 제어는 약함' },
  SILK_FINESSE: { name: 'SILK FINESSE', desc: '부드럽고 매우 정교하게 감기는 기술적인 구석 슛' },
  CHIP_SHOT_ONLY: { name: 'CHIP SHOT ONLY', desc: '모든 슛이 포물선을 그리는 칩슛으로 날아감' },
  WILD_POWER: { name: 'WILD POWER', desc: '강한 속도의 슛 · 풀파워에서 정확도 하락' },
  WILD_LEFT_CURL: { name: 'WILD LEFT CURL', desc: '매우 강력한 왼발 감아차기 · 강하게 감을수록 조금 빗나갈 위험' },
  // UPDATE 11 patch
  TOE_POKE_SPECIALIST: { name: 'TOE POKE SPECIALIST', desc: '발끝으로 밀어 차는 낮고 빠른 직선 슛 · 아웃프런트 능숙 · 슛 파워는 매우 약함' },
  DEFENSIVE_WALL: { name: 'DEFENSIVE WALL', desc: '수비 전문 · 패스 차단과 슬라이딩 태클에 강함 · 슈팅은 매우 약함' },
  ONE_FOOT_FINESSE: { name: 'ONE-FOOT FINESSE', desc: '왼발로만 차는 예리한 감아차기 · 오른발은 깁스' },
  CHAOTIC_CANNON: { name: 'CHAOTIC CANNON', desc: '엄청난 강슛 · 작은 너클성 흔들림 · 일반 감아차기는 약함' },
  // UPDATE 11
  PRECISION_MASTER: { name: 'PRECISION MASTER', desc: '슛 파워는 약하지만 원하는 곳으로 매우 정교하게 · 낮은 구석 슛과 정확한 감아차기에 강함' },
  OUTSIDE_POWER: { name: 'OUTSIDE POWER', desc: '오른발 아웃프런트 강슛 특화 · 바깥으로 휘는 궤적에서 빠르고 강하게 휨, 정확도는 낮음' },
  GALLOPING_CANNON: { name: 'GALLOPING CANNON', desc: '전설의 왼발 대포알 · 곧은 강슛이 빠르고 정확하게 뻗음' },
  BOX_BOMBER: { name: 'BOX BOMBER', desc: '골문 앞 마무리의 달인 · 낮은 슛과 페널티가 매우 정확' },
  FREE_KICK_ARTIST: { name: 'FREE KICK ARTIST', desc: '프리킥 감아차기 최상급 · 벽을 넘어 구석으로 정확하게 휨' },
  MAESTRO_CURL: { name: 'MAESTRO CURL', desc: '우아하고 정확한 감아차기와 칩슛 · 세트피스 정확도 보너스' },
  MAGIC_LEFT: { name: 'MAGIC LEFT', desc: '부드러운 왼발 · 낮고 정교한 감아차기로 구석을 찌름' },
  BLACK_SPIDER: { name: 'BLACK SPIDER', desc: '폭발적인 다이빙과 긴 손끝 리치, 높은 체공 · 중간 속도 슛은 공중에서 잡아냄' },
};

export interface PlayerDef {
  id: string;
  name: string;
  nameKo: string;
  /** two lines on the card */
  first: string;
  last: string;
  /** printed on the back of the shirt */
  shirt: string;
  number: string;
  positions: string[];
  role: PlayerRole;
  country: CountryCode;
  look: PlayerLook;
  /** UPDATE 5 */
  stats?: FieldStats;
  gk?: GkStats;
  special: SpecialId;
  /** strong foot (left-footers curl the other way with the instep); Son is two-footed */
  foot: 'R' | 'L' | 'B';
  /** UPDATE 6: free starter (never sold) vs TRANSFER MARKET player */
  starter: boolean;
  /** market price in MP (market players only) */
  price?: number;
  /** retired legend (market filter LEGEND) */
  legend?: boolean;
  /** UPDATE 8: ICON card (retired legend or PIPA custom icon) — shows ICON instead of a club */
  isIcon: boolean;
  /** UPDATE 8: current club (./clubs.ts), null for ICONS */
  club: string | null;
  /** UPDATE 8: the ONE position shown in a pack reveal */
  primaryPosition: string;
  /** UPDATE 8: can be sold / bought / pulled from packs (free starters: false) */
  tradeable: boolean;
  /** UPDATE 9: Korean display name on two card lines (e.g. 리오넬 / 메시) — the shirt stays English */
  koFirst: string;
  koLast: string;
  /** UPDATE 10: a PIPA ORIGINAL character (not a real footballer) */
  original?: boolean;
  /** UPDATE 10: real height in cm where it changes play (박사하 162 cm) */
  heightCm?: number;
  /** UPDATE 11 patch: defending + pace (field players) */
  def?: DefStats;
  /** UPDATE 11 patch: OUTSIDE FOOT (장영광 97) */
  outsideFoot?: number;
  /** UPDATE 11 patch: a cast on the right leg (이주성 — he only kicks with the left) */
  rightCast?: boolean;
  /** UPDATE 11 patch: his signature skill move (MATCH) */
  skillMove: SkillMoveId;
  /** UPDATE 10: a defender by main position (CB/LB/RB/LWB/RWB) — no longer sold on the market */
  defender?: boolean;
}

export const COUNTRY_NAME: Record<CountryCode, string> = {
  FRA: 'FRANCE',
  ARG: 'ARGENTINA',
  POR: 'PORTUGAL',
  BRA: 'BRAZIL',
  ESP: 'SPAIN',
  KOR: 'KOREA',
  ENG: 'ENGLAND',
  NOR: 'NORWAY',
  EGY: 'EGYPT',
  BEL: 'BELGIUM',
  POL: 'POLAND',
  GER: 'GERMANY',
  ITA: 'ITALY',
  CRO: 'CROATIA',
  URU: 'URUGUAY',
  NGA: 'NIGERIA',
  SWE: 'SWEDEN',
  GEO: 'GEORGIA',
  COL: 'COLOMBIA',
  NED: 'NETHERLANDS',
  DEN: 'DENMARK',
  ECU: 'ECUADOR',
  HUN: 'HUNGARY',
  MAR: 'MOROCCO',
  CAN: 'CANADA',
  SVN: 'SLOVENIA',
  SUI: 'SWITZERLAND',
  CZE: 'CZECHIA',
  URS: 'SOVIET UNION',
  NIR: 'N. IRELAND',
  CIV: 'IVORY COAST',
  CMR: 'CAMEROON',
  SRB: 'SERBIA',
  TUR: 'TÜRKIYE',
  JPN: 'JAPAN',
  GUI: 'GUINEA',
  BUL: 'BULGARIA',
  UKR: 'UKRAINE',
  USA: 'USA',
  MEX: 'MEXICO',
  SEN: 'SENEGAL',
  WAL: 'WALES',
  GAB: 'GABON',
};

const p = (
  id: string, name: string, nameKo: string, first: string, last: string, shirt: string, number: string,
  positions: string[], role: PlayerRole, country: CountryCode, look: PlayerLook,
): PlayerDef => ({ id, name, nameKo, first, last, shirt, number, positions, role, country, look, special: 'BALANCED_FINISH', foot: 'R', starter: true, isIcon: false, club: null, primaryPosition: positions[0], tradeable: false, koFirst: '', koLast: nameKo, skillMove: 'BODY_FEINT' });

const L = (skin: number, hair: number, hairStyle: HairStyle, beard: Beard = 'none', height = 1, build = 1): PlayerLook => ({ skin, hair, hairStyle, beard, height, build });

export const PLAYERS: PlayerDef[] = [
  p('mbappe', 'Kylian Mbappé', '킬리안 음바페', 'KYLIAN', 'MBAPPÉ', 'MBAPPE', '10', ['ST', 'LW'], 'FW', 'FRA', L(0x7a4f35, 0x1a1410, 'bald', 'none', 1.0, 0.98)),
  p('messi', 'Lionel Messi', '리오넬 메시', 'LIONEL', 'MESSI', 'MESSI', '10', ['RW', 'CAM'], 'FW', 'ARG', L(0xe2b08a, 0x3b2618, 'short', 'full', 0.92, 1.0)),
  p('ronaldo', 'Cristiano Ronaldo', '크리스티아누 호날두', 'CRISTIANO', 'RONALDO', 'RONALDO', '7', ['ST'], 'FW', 'POR', L(0xc8916a, 0x15110e, 'quiff', 'none', 1.05, 1.07)),
  p('neymar', 'Neymar Jr.', '네이마르 주니오르', 'NEYMAR', 'JR.', 'NEYMAR JR', '10', ['LW', 'CAM'], 'FW', 'BRA', L(0xb57e57, 0xc9a35a, 'spiky', 'stubble', 0.98, 0.9)),
  p('yamal', 'Lamine Yamal', '라민 야말', 'LAMINE', 'YAMAL', 'YAMAL', '19', ['RW'], 'FW', 'ESP', L(0x9a6646, 0x161210, 'curly', 'none', 0.99, 0.88)),
  p('son', 'Son Heung-min', '손흥민', 'SON', 'HEUNG-MIN', 'SON', '7', ['LW', 'ST'], 'FW', 'KOR', L(0xe8c09a, 0x14110f, 'fringe', 'none', 1.0, 0.98)),
  p('kane', 'Harry Kane', '해리 케인', 'HARRY', 'KANE', 'KANE', '9', ['ST'], 'FW', 'ENG', L(0xefc6a2, 0x8a6a45, 'sidepart', 'none', 1.03, 1.06)),
  p('haaland', 'Erling Haaland', '엘링 홀란', 'ERLING', 'HAALAND', 'HAALAND', '9', ['ST'], 'FW', 'NOR', L(0xf1cdb0, 0xd8b56a, 'bun', 'none', 1.1, 1.14)),
  p('vinicius', 'Vinícius Júnior', '비니시우스 주니오르', 'VINÍCIUS', 'JÚNIOR', 'VINICIUS JR', '7', ['LW'], 'FW', 'BRA', L(0x6e4530, 0x1b1410, 'twists', 'none', 1.0, 0.92)),
  p('bellingham', 'Jude Bellingham', '주드 벨링엄', 'JUDE', 'BELLINGHAM', 'BELLINGHAM', '10', ['CAM', 'CM'], 'MF', 'ENG', L(0x7f5236, 0x15110e, 'buzz', 'none', 1.03, 1.03)),
  p('rodri', 'Rodri', '로드리', 'RODRIGO', 'RODRI', 'RODRI', '16', ['CM', 'CDM'], 'MF', 'ESP', L(0xe0b08a, 0x4a3020, 'swept', 'stubble', 1.05, 1.04)),
  p('salah', 'Mohamed Salah', '모하메드 살라', 'MOHAMED', 'SALAH', 'SALAH', '11', ['RW'], 'FW', 'EGY', L(0xa0694a, 0x1c1410, 'afro', 'full', 0.96, 1.0)),
  p('debruyne', 'Kevin De Bruyne', '케빈 더 브라위너', 'KEVIN', 'DE BRUYNE', 'DE BRUYNE', '7', ['CAM', 'CM'], 'MF', 'BEL', L(0xf3cfb3, 0xc8925a, 'short', 'stubble', 1.0, 1.0)),
  p('lewandowski', 'Robert Lewandowski', '로베르트 레반도프스키', 'ROBERT', 'LEWANDOWSKI', 'LEWANDOWSKI', '9', ['ST'], 'FW', 'POL', L(0xecc5a0, 0x5a4030, 'sidepart', 'none', 1.04, 1.02)),
  p('bruno', 'Bruno Fernandes', '브루노 페르난데스', 'BRUNO', 'FERNANDES', 'B. FERNANDES', '8', ['CAM'], 'MF', 'POR', L(0xd9a77f, 0x2a1c14, 'short', 'stubble', 0.99, 0.98)),
  p('courtois', 'Thibaut Courtois', '티보 쿠르투아', 'THIBAUT', 'COURTOIS', 'COURTOIS', '1', ['GK'], 'GK', 'BEL', L(0xe9c19c, 0x2e2018, 'swept', 'stubble')),
  p('neuer', 'Manuel Neuer', '마누엘 노이어', 'MANUEL', 'NEUER', 'NEUER', '1', ['GK'], 'GK', 'GER', L(0xf0c8a6, 0xd8c08a, 'short', 'none')),
  p('alisson', 'Alisson Becker', '알리송 베케르', 'ALISSON', 'BECKER', 'ALISSON', '1', ['GK'], 'GK', 'BRA', L(0xe0b48e, 0x3a2a1c, 'sidepart', 'full')),
  p('donnarumma', 'Gianluigi Donnarumma', '잔루이지 돈나룸마', 'GIANLUIGI', 'DONNARUMMA', 'DONNARUMMA', '1', ['GK'], 'GK', 'ITA', L(0xe4b58e, 0x161210, 'short', 'stubble')),
  p('martinez', 'Emiliano Martínez', '에밀리아노 마르티네스', 'EMILIANO', 'MARTÍNEZ', 'MARTINEZ', '23', ['GK'], 'GK', 'ARG', L(0xdcab84, 0x1f1712, 'buzz', 'full')),
];

// ── UPDATE 5 abilities (PIPA base balance) ────────────────────────────────
const F = (power: number, accuracy: number, curve: number, knuckle: number, lowShot: number, freeKick: number, composure: number): FieldStats =>
  ({ power, accuracy, curve, knuckle, lowShot, freeKick, composure });
const G = (reflex: number, diving: number, reach: number, positioning: number, lowSave: number, highSave: number, penaltyRead: number): GkStats =>
  ({ reflex, diving, reach, positioning, lowSave, highSave, penaltyRead });
const ABILITIES: Record<string, { stats?: FieldStats; gk?: GkStats; special: SpecialId; foot?: 'R' | 'L' | 'B' }> = {
  mbappe: { stats: F(95, 90, 84, 84, 92, 82, 92), special: 'POWER_BURST' },
  messi: { stats: F(84, 98, 99, 70, 96, 99, 99), special: 'FINESSE_MASTER', foot: 'L' },
  ronaldo: { stats: F(99, 93, 88, 99, 90, 95, 97), special: 'KNUCKLE_DRIVE' },
  neymar: { stats: F(84, 95, 97, 75, 99, 95, 93), special: 'LOW_DISGUISE' },
  yamal: { stats: F(86, 92, 96, 73, 93, 90, 90), special: 'LEFT_CURL', foot: 'L' },
  son: { stats: F(94, 95, 95, 85, 95, 89, 96), special: 'TWO_FOOT_FINESSE', foot: 'B' },
  kane: { stats: F(94, 98, 88, 83, 94, 89, 99), special: 'PENALTY_PRECISION' },
  haaland: { stats: F(99, 92, 79, 88, 95, 75, 95), special: 'POWER_FINISH', foot: 'L' },
  vinicius: { stats: F(88, 91, 93, 70, 96, 82, 89), special: 'QUICK_LOW_CURL' },
  bellingham: { stats: F(91, 93, 87, 80, 92, 83, 96), special: 'BALANCED_FINISH' },
  rodri: { stats: F(91, 95, 85, 88, 89, 86, 97), special: 'CONTROLLED_DRIVE' },
  salah: { stats: F(91, 95, 98, 72, 96, 89, 96), special: 'LEFT_FINESSE', foot: 'L' },
  debruyne: { stats: F(96, 96, 97, 92, 91, 98, 97), special: 'DRIVEN_CURVE' },
  lewandowski: { stats: F(95, 98, 87, 80, 97, 85, 99), special: 'CLINICAL_FINISH' },
  bruno: { stats: F(92, 95, 94, 89, 90, 97, 97), special: 'SET_PIECE_CONTROL' },
  // UPDATE 9: the three free starter keepers a little weaker (shown stats = real performance)
  courtois: { gk: G(93, 93, 95, 93, 90, 95, 90), special: 'LONG_REACH' },
  neuer: { gk: G(92, 92, 92, 96, 91, 92, 89), special: 'POSITION_MASTER' },
  alisson: { gk: G(95, 93, 91, 94, 95, 91, 92), special: 'LOW_SAVE' },
  donnarumma: { gk: G(97, 97, 99, 93, 94, 99, 92), special: 'HIGH_REACH' },
  martinez: { gk: G(96, 95, 95, 94, 97, 95, 99), special: 'PENALTY_SPECIALIST' },
};
for (const pl of PLAYERS) {
  const a = ABILITIES[pl.id];
  if (!a) continue;
  pl.stats = a.stats;
  pl.gk = a.gk;
  pl.special = a.special;
  pl.foot = a.foot ?? 'R';
}

// ── UPDATE 6: TRANSFER MARKET ────────────────────────────────────────────
const STARTERS = new Set<string>(STARTER_IDS);
for (const pl of PLAYERS) {
  pl.starter = STARTERS.has(pl.id);
  if (!pl.starter) pl.price = MARKET_EXISTING_PRICES[pl.id];
}
/** UPDATE 10: defender positions (the market stops selling these) */
export const DEF_POSITIONS = ['CB', 'LB', 'RB', 'LWB', 'RWB'];

/** UPDATE 11 patch: skill moves (MATCH · 질주/개인기 double tap) */
export type SkillMoveId = 'BODY_FEINT' | 'STEPOVER' | 'ELASTICO' | 'BURST' | 'SIDE_STEP' | 'QUICK_TURN' | 'KNOCK_ON' | 'RAINBOW' | 'DRAG_BACK';
export const SKILL_MOVES: Record<SkillMoveId, { name: string; ko: string }> = {
  BODY_FEINT: { name: 'BODY FEINT', ko: '바디 페인트 · 빠른 방향 전환' },
  STEPOVER: { name: 'STEPOVER', ko: '스텝오버' },
  ELASTICO: { name: 'ELASTICO', ko: '엘라스티코' },
  BURST: { name: 'EXPLOSIVE BURST', ko: '폭발적인 순간 가속' },
  SIDE_STEP: { name: 'SIDE STEP', ko: '빠른 사이드 스텝' },
  QUICK_TURN: { name: 'QUICK TURN', ko: '빠른 방향 전환' },
  KNOCK_ON: { name: 'KNOCK ON', ko: '치고 달리기' },
  RAINBOW: { name: 'RAINBOW FLICK', ko: '레인보우' },
  DRAG_BACK: { name: 'DRAG BACK', ko: '드래그 백' },
};
const SIGNATURE_SKILL: Record<string, SkillMoveId> = {
  messi: 'BODY_FEINT', ronaldo: 'STEPOVER', neymar: 'ELASTICO', mbappe: 'BURST', vinicius: 'SIDE_STEP', son: 'QUICK_TURN',
  ronaldinho: 'ELASTICO', kimdongmin: 'KNOCK_ON', songinwoo: 'RAINBOW', yamal: 'BODY_FEINT', salah: 'QUICK_TURN',
  haaland: 'KNOCK_ON', kane: 'DRAG_BACK', bellingham: 'BODY_FEINT', rodri: 'DRAG_BACK', zidane: 'BODY_FEINT',
};
const roleOf = (pos: string): PlayerRole =>
  pos === 'GK' ? 'GK' : DEF_POSITIONS.includes(pos) ? 'DF' : ['ST', 'CF', 'LW', 'RW'].includes(pos) ? 'FW' : 'MF';
for (const r of MARKET_NEW) {
  const [skin, hair, hairStyle, beard, height, build] = r.look;
  PLAYERS.push({
    ...p(r.id, r.name, r.nameKo, r.first, r.last, r.shirt, r.number, r.positions, roleOf(r.positions[0]), r.country, L(skin, hair, hairStyle, beard, height, build)),
    stats: r.stats,
    gk: r.gk,
    special: r.special,
    foot: r.foot,
    starter: false,
    price: r.price,
    legend: r.legend,
  });
}

// ── UPDATE 8: one central record per player (pack + market read the same fields) ──
/** a stable 0…1 from a player id (no randomness at run time) */
function idHash(id: string, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}
const FAST: Record<string, number> = { mbappe: 97, vinicius: 95, son: 90, salah: 90, yamal: 88, haaland: 89, neymar: 89, ronaldo: 88, messi: 85, kimdongmin: 86 };
const DEF_OVERRIDE: Record<string, DefStats> = {
  hanyujun: { tackle: 86, interception: 84, marking: 87, strength: 82, positioning: 84, pace: 72 },
};
/** defending stats: real defenders high, midfielders middle, forwards low (stable per player) */
function defStatsFor(pl: PlayerDef): DefStats {
  const r = (k: number) => idHash(pl.id, k);
  const pos = pl.positions[0];
  const base = pl.defender ? 82 : pos === 'CDM' ? 76 : pl.role === 'MF' ? 62 : 40;
  const spread = pl.defender ? 12 : 14;
  const v = (k: number, add = 0) => Math.round(Math.min(97, base + add + (r(k) - 0.35) * spread));
  const pace = FAST[pl.id] ?? Math.round(Math.min(94, (pl.role === 'FW' ? 82 : pl.role === 'MF' ? 76 : 75) + (r(9) - 0.4) * 14 + (['POWER_BURST', 'SPEED_DRIBBLE'].includes(pl.special) ? 5 : 0)));
  return { tackle: v(1), interception: v(2), marking: v(3), strength: v(4, pl.look.build > 1.02 ? 5 : 0), positioning: v(5), pace };
}
function skillFor(pl: PlayerDef): SkillMoveId {
  const pos = pl.positions[0];
  const pick = (a: SkillMoveId[]) => a[Math.floor(idHash(pl.id, 77) * a.length)];
  if (pl.role === 'GK' || pl.defender) return 'DRAG_BACK';
  if (['LW', 'RW'].includes(pos)) return pick(['STEPOVER', 'SIDE_STEP', 'BODY_FEINT', 'ELASTICO']);
  if (['ST', 'CF'].includes(pos)) return pick(['KNOCK_ON', 'BURST', 'DRAG_BACK', 'STEPOVER']);
  return pick(['BODY_FEINT', 'QUICK_TURN', 'DRAG_BACK', 'RAINBOW']);
}

for (const pl of PLAYERS) {
  pl.isIcon = !!pl.legend;
  pl.club = pl.isIcon ? null : CLUB[pl.id] ?? null;
  pl.primaryPosition = PRIMARY_POSITION[pl.id] ?? pl.positions[0];
  pl.tradeable = !pl.starter;
  // UPDATE 9: 리오넬 메시 → 리오넬 / 메시 · 손흥민 → 손흥민 (one word stays one line)
  const sp = pl.nameKo.lastIndexOf(' ');
  pl.koFirst = sp > 0 ? pl.nameKo.slice(0, sp) : '';
  pl.koLast = sp > 0 ? pl.nameKo.slice(sp + 1) : pl.nameKo;
  // UPDATE 10
  pl.original = ORIGINAL_IDS.includes(pl.id);
  if (HEIGHT_CM[pl.id]) pl.heightCm = HEIGHT_CM[pl.id];
  pl.defender = DEF_POSITIONS.includes(pl.positions[0]);
  // UPDATE 11 patch: defending / pace + signature skill move
  if (pl.role !== 'GK') pl.def = DEF_OVERRIDE[pl.id] ?? defStatsFor(pl);
  pl.skillMove = SIGNATURE_SKILL[pl.id] ?? skillFor(pl);
  if (pl.id === 'jangyounggwang') pl.outsideFoot = 97;
  if (pl.id === 'leejusung') pl.rightCast = true;
}

/** UPDATE 9: search by Korean or English name (spaces / accents / case ignored) */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .replace(/[^0-9a-z\u3131-\u318e\uac00-\ud7a3]/gi, '')
    .toLowerCase();
export function matchesSearch(p: PlayerDef, q: string): boolean {
  const k = fold(q);
  if (!k) return true;
  return [p.nameKo, p.name, p.shirt, `${p.first} ${p.last}`, p.id].some((x) => fold(x).includes(k));
}

/** OVR: plain average of the seven abilities (no position weighting) */
/** the average of the player's own abilities (shooting / keeping; defenders mostly defending) */
export function statOvr(p: PlayerDef) {
  const v = p.stats ? Object.values(p.stats) : p.gk ? Object.values(p.gk) : [];
  const shoot = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  if (p.defender && p.def) {
    const d = p.def;
    return Math.round(0.75 * ((d.tackle + d.interception + d.marking + d.strength + d.positioning) / 5) + 0.25 * shoot);
  }
  return Math.round(shoot);
}
/**
 * OVR shown on the card (= base OVR). UPDATE 11 patch: TRANSFER MARKET players are rated
 * 135–150 (normal 135–140 · good 141–145 · elite 146–148 · top ICONS 149–150) from their
 * price and abilities; free starters keep their own rating. Evolution adds on top of it
 * (effective OVR = base + evolution bonus — never capped at 150).
 */
export function ovr(p: PlayerDef) {
  return BASE_OVR[p.id] ?? statOvr(p);
}

export const FIELD_STAT_LABELS: [keyof FieldStats, string][] = [
  ['power', 'POWER'], ['accuracy', 'ACCURACY'], ['curve', 'CURVE'], ['knuckle', 'KNUCKLE'],
  ['lowShot', 'LOW SHOT'], ['freeKick', 'FREE KICK'], ['composure', 'COMPOSURE'],
];
export const GK_STAT_LABELS: [keyof GkStats, string][] = [
  ['reflex', 'REFLEX'], ['diving', 'DIVING'], ['reach', 'REACH'], ['positioning', 'POSITIONING'],
  ['lowSave', 'LOW SAVE'], ['highSave', 'HIGH SAVE'], ['penaltyRead', 'PENALTY READ'],
];

// UPDATE 10 fix: a null-prototype map, so "constructor" / "__proto__" are never mistaken for players
export const PLAYER_BY_ID: Record<string, PlayerDef> = Object.assign(Object.create(null) as Record<string, PlayerDef>, Object.fromEntries(PLAYERS.map((x) => [x.id, x])));
export const FIELD_PLAYERS = PLAYERS.filter((x) => x.role !== 'GK');
export const GOALKEEPERS = PLAYERS.filter((x) => x.role === 'GK');
export const STARTER_PLAYERS = PLAYERS.filter((x) => x.starter);
/** the 200 TRANSFER MARKET players in catalogue order (UPDATE 8: +50, UPDATE 9: +50) */
export const MARKET_PLAYERS: PlayerDef[] = MARKET_ORDER.map((id) => PLAYER_BY_ID[id]);
export const isStarter = (id: string) => !!PLAYER_BY_ID[id]?.starter;
/**
 * UPDATE 10: defenders (main position CB / LB / RB / LWB / RWB) are no longer sold — not by the
 * system, not as new user listings, not in packs. Cards already owned stay owned and playable.
 */
export const isBuyable = (id: string) => {
  const pl = typeof id === 'string' ? PLAYER_BY_ID[id] ?? null : null;
  // UPDATE 11 patch: defenders are back on the market
  return !!pl && !pl.starter && typeof pl.price === 'number';
};
/** the market players you can still buy (UPDATE 10: no defenders) */
export const BUYABLE_PLAYERS: PlayerDef[] = MARKET_ORDER.map((id) => PLAYER_BY_ID[id]);

/** UPDATE 11 patch: base OVR 135–150 for every TRANSFER MARKET player (stable, from price + abilities) */
export const BASE_OVR: Record<string, number> = Object.create(null);
{
  const list = MARKET_ORDER.map((id) => PLAYER_BY_ID[id]).filter((pl) => pl && !pl.starter && typeof pl.price === 'number');
  const byPrice = [...list].sort((a, b) => a.price! - b.price! || statOvr(a) - statOvr(b));
  const byStat = [...list].sort((a, b) => statOvr(a) - statOvr(b));
  const pr = new Map(byPrice.map((pl, i) => [pl.id, i / Math.max(1, list.length - 1)]));
  const st = new Map(byStat.map((pl, i) => [pl.id, i / Math.max(1, list.length - 1)]));
  const score = (pl: PlayerDef) => 0.65 * pr.get(pl.id)! + 0.35 * st.get(pl.id)!;
  const ranked = [...list].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
  const icons = ranked.filter((pl) => pl.isIcon && pl.price! >= 1300 * 1_000_000);
  const rest = ranked.filter((pl) => !icons.includes(pl));
  icons.forEach((pl, i) => (BASE_OVR[pl.id] = i < Math.ceil(icons.length * 0.45) ? 150 : 149));
  const n = rest.length;
  const tier = (from: number, to: number, lo: number, hi: number) => {
    const part = rest.slice(Math.floor(n * from), Math.floor(n * to));
    part.forEach((pl, i) => (BASE_OVR[pl.id] = Math.round(hi - ((hi - lo) * i) / Math.max(1, part.length - 1))));
  };
  tier(0, 0.12, 146, 148);
  tier(0.12, 0.45, 141, 145);
  tier(0.45, 1, 135, 140);
}
export const marketPrice = (id: string): number | null => {
  const pl = PLAYER_BY_ID[id];
  return pl && !pl.starter && typeof pl.price === 'number' ? pl.price : null;
};

// UPDATE 10 fix: own keys only ("constructor", "__proto__" … are not players)
export const getPlayer = (id: string | null | undefined): PlayerDef | null => (typeof id === 'string' ? PLAYER_BY_ID[id] ?? null : null);

/** a small per-player accent hue so every card looks a little different */
export function accentHue(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

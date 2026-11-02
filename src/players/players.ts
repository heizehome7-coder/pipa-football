/**
 * UPDATE 4 — the 20 original players (+ UPDATE 6: 95 market players from ./market). The same list ships with every copy of the
 * game, so online only the ids travel over the network.
 *
 * NO ratings: every player plays with exactly the same physics and controls.
 * `look` is purely cosmetic (hair, beard, skin, height, build) so players can be told
 * apart in 3D and on their cards. Stats come in UPDATE 5+.
 */
import { MARKET_EXISTING_PRICES, MARKET_NEW, MARKET_ORDER, STARTER_IDS, type MarketCountry } from './market';

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
  | 'LONG_REACH' | 'POSITION_MASTER' | 'LOW_SAVE' | 'HIGH_REACH' | 'PENALTY_SPECIALIST' | 'BLACK_SPIDER';

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
};

const p = (
  id: string, name: string, nameKo: string, first: string, last: string, shirt: string, number: string,
  positions: string[], role: PlayerRole, country: CountryCode, look: PlayerLook,
): PlayerDef => ({ id, name, nameKo, first, last, shirt, number, positions, role, country, look, special: 'BALANCED_FINISH', foot: 'R', starter: true });

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
  courtois: { gk: G(96, 96, 99, 96, 93, 99, 92), special: 'LONG_REACH' },
  neuer: { gk: G(94, 94, 95, 99, 94, 95, 91), special: 'POSITION_MASTER' },
  alisson: { gk: G(98, 96, 94, 97, 99, 94, 95), special: 'LOW_SAVE' },
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
const roleOf = (pos: string): PlayerRole =>
  pos === 'GK' ? 'GK' : ['CB', 'LB', 'RB'].includes(pos) ? 'DF' : ['ST', 'CF', 'LW', 'RW'].includes(pos) ? 'FW' : 'MF';
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

/** OVR: plain average of the seven abilities (no position weighting) */
export function ovr(p: PlayerDef) {
  const v = p.stats ? Object.values(p.stats) : p.gk ? Object.values(p.gk) : [];
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
}

export const FIELD_STAT_LABELS: [keyof FieldStats, string][] = [
  ['power', 'POWER'], ['accuracy', 'ACCURACY'], ['curve', 'CURVE'], ['knuckle', 'KNUCKLE'],
  ['lowShot', 'LOW SHOT'], ['freeKick', 'FREE KICK'], ['composure', 'COMPOSURE'],
];
export const GK_STAT_LABELS: [keyof GkStats, string][] = [
  ['reflex', 'REFLEX'], ['diving', 'DIVING'], ['reach', 'REACH'], ['positioning', 'POSITIONING'],
  ['lowSave', 'LOW SAVE'], ['highSave', 'HIGH SAVE'], ['penaltyRead', 'PENALTY READ'],
];

export const PLAYER_BY_ID: Record<string, PlayerDef> = Object.fromEntries(PLAYERS.map((x) => [x.id, x]));
export const FIELD_PLAYERS = PLAYERS.filter((x) => x.role !== 'GK');
export const GOALKEEPERS = PLAYERS.filter((x) => x.role === 'GK');
export const STARTER_PLAYERS = PLAYERS.filter((x) => x.starter);
/** the 100 TRANSFER MARKET players in catalogue order */
export const MARKET_PLAYERS: PlayerDef[] = MARKET_ORDER.map((id) => PLAYER_BY_ID[id]);
export const isStarter = (id: string) => !!PLAYER_BY_ID[id]?.starter;
export const marketPrice = (id: string): number | null => {
  const pl = PLAYER_BY_ID[id];
  return pl && !pl.starter && typeof pl.price === 'number' ? pl.price : null;
};

export const getPlayer = (id: string | null | undefined): PlayerDef | null => (id && PLAYER_BY_ID[id]) || null;

/** a small per-player accent hue so every card looks a little different */
export function accentHue(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

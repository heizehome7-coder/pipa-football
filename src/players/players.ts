/**
 * UPDATE 4 — the 20 selectable players. The same list ships with every copy of the
 * game, so online only the ids travel over the network.
 *
 * NO ratings: every player plays with exactly the same physics and controls.
 * `look` is purely cosmetic (hair, beard, skin, height, build) so players can be told
 * apart in 3D and on their cards. Stats come in UPDATE 5+.
 */
export type PlayerRole = 'FW' | 'MF' | 'GK';
export type CountryCode = 'FRA' | 'ARG' | 'POR' | 'BRA' | 'ESP' | 'KOR' | 'ENG' | 'NOR' | 'EGY' | 'BEL' | 'POL' | 'GER' | 'ITA';
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
};

const p = (
  id: string, name: string, nameKo: string, first: string, last: string, shirt: string, number: string,
  positions: string[], role: PlayerRole, country: CountryCode, look: PlayerLook,
): PlayerDef => ({ id, name, nameKo, first, last, shirt, number, positions, role, country, look });

const L = (skin: number, hair: number, hairStyle: HairStyle, beard: Beard = 'none', height = 1, build = 1): PlayerLook => ({ skin, hair, hairStyle, beard, height, build });

export const PLAYERS: PlayerDef[] = [
  p('mbappe', 'Kylian Mbappé', '킬리안 음바페', 'KYLIAN', 'MBAPPÉ', 'MBAPPÉ', '10', ['ST', 'LW'], 'FW', 'FRA', L(0x7a4f35, 0x1a1410, 'bald', 'none', 1.0, 0.98)),
  p('messi', 'Lionel Messi', '리오넬 메시', 'LIONEL', 'MESSI', 'MESSI', '10', ['RW', 'CAM'], 'FW', 'ARG', L(0xe2b08a, 0x3b2618, 'short', 'full', 0.92, 1.0)),
  p('ronaldo', 'Cristiano Ronaldo', '크리스티아누 호날두', 'CRISTIANO', 'RONALDO', 'RONALDO', '7', ['ST'], 'FW', 'POR', L(0xc8916a, 0x15110e, 'quiff', 'none', 1.05, 1.07)),
  p('neymar', 'Neymar Jr.', '네이마르 주니오르', 'NEYMAR', 'JR.', 'NEYMAR JR', '10', ['LW', 'CAM'], 'FW', 'BRA', L(0xb57e57, 0xc9a35a, 'spiky', 'stubble', 0.98, 0.9)),
  p('yamal', 'Lamine Yamal', '라민 야말', 'LAMINE', 'YAMAL', 'LAMINE YAMAL', '19', ['RW'], 'FW', 'ESP', L(0x9a6646, 0x161210, 'curly', 'none', 0.99, 0.88)),
  p('son', 'Son Heung-min', '손흥민', 'SON', 'HEUNG-MIN', 'SON', '7', ['LW', 'ST'], 'FW', 'KOR', L(0xe8c09a, 0x14110f, 'fringe', 'none', 1.0, 0.98)),
  p('kane', 'Harry Kane', '해리 케인', 'HARRY', 'KANE', 'KANE', '9', ['ST'], 'FW', 'ENG', L(0xefc6a2, 0x8a6a45, 'sidepart', 'none', 1.03, 1.06)),
  p('haaland', 'Erling Haaland', '엘링 홀란', 'ERLING', 'HAALAND', 'HAALAND', '9', ['ST'], 'FW', 'NOR', L(0xf1cdb0, 0xd8b56a, 'bun', 'none', 1.1, 1.14)),
  p('vinicius', 'Vinícius Júnior', '비니시우스 주니오르', 'VINÍCIUS', 'JÚNIOR', 'VINI JR', '7', ['LW'], 'FW', 'BRA', L(0x6e4530, 0x1b1410, 'twists', 'none', 1.0, 0.92)),
  p('bellingham', 'Jude Bellingham', '주드 벨링엄', 'JUDE', 'BELLINGHAM', 'BELLINGHAM', '10', ['CAM', 'CM'], 'MF', 'ENG', L(0x7f5236, 0x15110e, 'buzz', 'none', 1.03, 1.03)),
  p('rodri', 'Rodri', '로드리', 'RODRIGO', 'RODRI', 'RODRI', '16', ['CM', 'CDM'], 'MF', 'ESP', L(0xe0b08a, 0x4a3020, 'swept', 'stubble', 1.05, 1.04)),
  p('salah', 'Mohamed Salah', '모하메드 살라', 'MOHAMED', 'SALAH', 'SALAH', '11', ['RW'], 'FW', 'EGY', L(0xa0694a, 0x1c1410, 'afro', 'full', 0.96, 1.0)),
  p('debruyne', 'Kevin De Bruyne', '케빈 더 브라위너', 'KEVIN', 'DE BRUYNE', 'DE BRUYNE', '7', ['CAM', 'CM'], 'MF', 'BEL', L(0xf3cfb3, 0xc8925a, 'short', 'stubble', 1.0, 1.0)),
  p('lewandowski', 'Robert Lewandowski', '로베르트 레반도프스키', 'ROBERT', 'LEWANDOWSKI', 'LEWANDOWSKI', '9', ['ST'], 'FW', 'POL', L(0xecc5a0, 0x5a4030, 'sidepart', 'none', 1.04, 1.02)),
  p('bruno', 'Bruno Fernandes', '브루노 페르난데스', 'BRUNO', 'FERNANDES', 'BRUNO F.', '8', ['CAM'], 'MF', 'POR', L(0xd9a77f, 0x2a1c14, 'short', 'stubble', 0.99, 0.98)),
  p('courtois', 'Thibaut Courtois', '티보 쿠르투아', 'THIBAUT', 'COURTOIS', 'COURTOIS', '1', ['GK'], 'GK', 'BEL', L(0xe9c19c, 0x2e2018, 'swept', 'stubble')),
  p('neuer', 'Manuel Neuer', '마누엘 노이어', 'MANUEL', 'NEUER', 'NEUER', '1', ['GK'], 'GK', 'GER', L(0xf0c8a6, 0xd8c08a, 'short', 'none')),
  p('alisson', 'Alisson Becker', '알리송 베케르', 'ALISSON', 'BECKER', 'ALISSON', '1', ['GK'], 'GK', 'BRA', L(0xe0b48e, 0x3a2a1c, 'sidepart', 'full')),
  p('donnarumma', 'Gianluigi Donnarumma', '잔루이지 돈나룸마', 'GIANLUIGI', 'DONNARUMMA', 'DONNARUMMA', '1', ['GK'], 'GK', 'ITA', L(0xe4b58e, 0x161210, 'short', 'stubble')),
  p('martinez', 'Emiliano Martínez', '에밀리아노 마르티네스', 'EMILIANO', 'MARTÍNEZ', 'DIBU', '23', ['GK'], 'GK', 'ARG', L(0xdcab84, 0x1f1712, 'buzz', 'full')),
];

export const PLAYER_BY_ID: Record<string, PlayerDef> = Object.fromEntries(PLAYERS.map((x) => [x.id, x]));
export const FIELD_PLAYERS = PLAYERS.filter((x) => x.role !== 'GK');
export const GOALKEEPERS = PLAYERS.filter((x) => x.role === 'GK');

export const getPlayer = (id: string | null | undefined): PlayerDef | null => (id && PLAYER_BY_ID[id]) || null;

/** a small per-player accent hue so every card looks a little different */
export function accentHue(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

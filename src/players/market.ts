/**
 * UPDATE 6 — TRANSFER MARKET catalogue: 100 players bought with MP.
 *
 * 5 of them (De Bruyne, Lewandowski, Bruno Fernandes, Donnarumma, E. Martínez) already
 * existed as free UPDATE 4 players; they keep their record and only get a price here.
 * The other 95 are new records. Prices are PIPA game values (not real fees): rarity and
 * collection value drive them, abilities stay balanced — no player is 99 everywhere.
 *
 * This file has no runtime imports (players.ts builds the PlayerDefs from it).
 */
import type { Beard, FieldStats, GkStats, HairStyle, SpecialId } from './players';

export type MarketCountry =
  | 'FRA' | 'ARG' | 'POR' | 'BRA' | 'ESP' | 'KOR' | 'ENG' | 'NOR' | 'EGY' | 'BEL' | 'POL' | 'GER' | 'ITA'
  | 'CRO' | 'URU' | 'NGA' | 'SWE' | 'GEO' | 'COL' | 'NED' | 'DEN' | 'ECU' | 'HUN' | 'MAR' | 'CAN' | 'SVN'
  | 'SUI' | 'CZE' | 'URS' | 'NIR' | 'CIV' | 'CMR'
  // UPDATE 8
  | 'SRB' | 'TUR' | 'JPN' | 'GUI' | 'BUL' | 'UKR'
  // UPDATE 9
  | 'USA' | 'MEX'
  // UPDATE 10
  | 'SEN' | 'WAL'
  // UPDATE 11
  | 'GAB';

export interface MarketRow {
  id: string;
  name: string;
  nameKo: string;
  first: string;
  last: string;
  shirt: string;
  number: string;
  positions: string[];
  country: MarketCountry;
  look: [skin: number, hair: number, style: HairStyle, beard: Beard, height: number, build: number];
  stats?: FieldStats;
  gk?: GkStats;
  special: SpecialId;
  foot: 'R' | 'L' | 'B';
  price: number;
  legend: boolean;
}

const F = (power: number, accuracy: number, curve: number, knuckle: number, lowShot: number, freeKick: number, composure: number): FieldStats =>
  ({ power, accuracy, curve, knuckle, lowShot, freeKick, composure });
const G = (reflex: number, diving: number, reach: number, positioning: number, lowSave: number, highSave: number, penaltyRead: number): GkStats =>
  ({ reflex, diving, reach, positioning, lowSave, highSave, penaltyRead });
const M = 1_000_000;

// skin tones
const S1 = 0xf3d2b8, S2 = 0xecc5a0, S3 = 0xdeb08a, S4 = 0xc8916a, S5 = 0xa0694a, S6 = 0x7a4f35, S7 = 0x5e3b27;
// hair colours
const BLK = 0x15110e, DRK = 0x2a1c14, BRN = 0x5a4030, LBR = 0x8a6a45, BLD = 0xd8b56a, RED = 0x9a4a28;

type Def = [
  id: string, name: string, nameKo: string, first: string, last: string, shirt: string, number: string,
  positions: string[], country: MarketCountry, look: MarketRow['look'], ab: FieldStats | GkStats, special: SpecialId,
  foot: 'R' | 'L' | 'B', priceM: number,
];

const isGk = (a: FieldStats | GkStats): a is GkStats => 'reflex' in a;

const CURRENT: Def[] = [
  ['modric', 'Luka Modrić', '루카 모드리치', 'LUKA', 'MODRIĆ', 'MODRIC', '10', ['CM'], 'CRO', [S2, LBR, 'swept', 'none', 0.94, 0.92], F(82, 93, 94, 80, 86, 90, 98), 'TWO_FOOT_FINESSE', 'R', 380],
  ['pedri', 'Pedri', '페드리', 'PEDRO', 'PEDRI', 'PEDRI', '8', ['CM'], 'ESP', [S3, DRK, 'fringe', 'none', 0.96, 0.9], F(78, 91, 90, 68, 88, 82, 94), 'BALANCED_FINISH', 'R', 360],
  ['gavi', 'Gavi', '가비', 'PABLO', 'GAVI', 'GAVI', '6', ['CM'], 'ESP', [S3, BLK, 'sidepart', 'none', 0.95, 0.92], F(80, 84, 82, 70, 85, 74, 86), 'BALANCED_FINISH', 'R', 280],
  ['musiala', 'Jamal Musiala', '자말 무시알라', 'JAMAL', 'MUSIALA', 'MUSIALA', '10', ['CAM', 'LW'], 'GER', [S5, BLK, 'curly', 'none', 1.02, 0.9], F(84, 90, 90, 70, 94, 80, 92), 'LOW_DISGUISE', 'R', 700],
  ['wirtz', 'Florian Wirtz', '플로리안 비르츠', 'FLORIAN', 'WIRTZ', 'WIRTZ', '10', ['CAM'], 'GER', [S1, BRN, 'short', 'none', 0.99, 0.92], F(85, 92, 92, 74, 90, 86, 93), 'SET_PIECE_CONTROL', 'R', 680],
  ['saka', 'Bukayo Saka', '부카요 사카', 'BUKAYO', 'SAKA', 'SAKA', '7', ['RW'], 'ENG', [S6, BLK, 'buzz', 'none', 0.97, 0.95], F(86, 90, 92, 70, 90, 84, 90), 'LEFT_CURL', 'L', 620],
  ['foden', 'Phil Foden', '필 포든', 'PHIL', 'FODEN', 'FODEN', '47', ['CAM', 'RW'], 'ENG', [S1, BRN, 'buzz', 'none', 0.95, 0.9], F(87, 91, 93, 76, 89, 87, 91), 'LEFT_FINESSE', 'L', 600],
  ['palmer', 'Cole Palmer', '콜 파머', 'COLE', 'PALMER', 'PALMER', '20', ['CAM', 'RW'], 'ENG', [S2, RED, 'short', 'none', 1.03, 0.92], F(86, 94, 92, 78, 90, 90, 97), 'PENALTY_PRECISION', 'L', 650],
  ['valverde', 'Federico Valverde', '페데리코 발베르데', 'FEDERICO', 'VALVERDE', 'VALVERDE', '8', ['CM'], 'URU', [S3, BLK, 'sidepart', 'stubble', 1.0, 1.0], F(95, 86, 82, 88, 85, 80, 90), 'POWER_BURST', 'R', 560],
  ['rice', 'Declan Rice', '데클런 라이스', 'DECLAN', 'RICE', 'RICE', '41', ['CDM', 'CM'], 'ENG', [S1, LBR, 'sidepart', 'none', 1.04, 1.04], F(88, 85, 80, 80, 82, 84, 90), 'CONTROLLED_DRIVE', 'R', 480],
  ['odegaard', 'Martin Ødegaard', '마르틴 외데고르', 'MARTIN', 'ØDEGAARD', 'ODEGAARD', '8', ['CAM'], 'NOR', [S1, BRN, 'swept', 'none', 0.98, 0.9], F(82, 92, 93, 72, 86, 90, 91), 'LEFT_FINESSE', 'L', 470],
  ['bernardo', 'Bernardo Silva', '베르나르두 실바', 'BERNARDO', 'SILVA', 'BERNARDO', '20', ['CAM', 'RW'], 'POR', [S2, DRK, 'fringe', 'stubble', 0.92, 0.88], F(78, 90, 90, 66, 90, 78, 92), 'LEFT_CURL', 'L', 430],
  ['leao', 'Rafael Leão', '하파엘 레앙', 'RAFAEL', 'LEÃO', 'LEAO', '10', ['LW'], 'POR', [S6, BLK, 'twists', 'none', 1.06, 0.98], F(92, 84, 86, 74, 90, 72, 84), 'POWER_BURST', 'R', 500],
  ['lautaro', 'Lautaro Martínez', '라우타로 마르티네스', 'LAUTARO', 'MARTÍNEZ', 'LAUTARO', '10', ['ST'], 'ARG', [S3, BLK, 'buzz', 'full', 0.98, 1.04], F(92, 92, 82, 78, 92, 74, 93), 'CLINICAL_FINISH', 'R', 480],
  ['osimhen', 'Victor Osimhen', '빅터 오시멘', 'VICTOR', 'OSIMHEN', 'OSIMHEN', '9', ['ST'], 'NGA', [S7, BLD, 'buzz', 'none', 1.05, 1.02], F(94, 88, 76, 80, 90, 64, 88), 'POWER_FINISH', 'R', 500],
  ['isak', 'Alexander Isak', '알렉산데르 이사크', 'ALEXANDER', 'ISAK', 'ISAK', '14', ['ST'], 'SWE', [S6, BLK, 'buzz', 'none', 1.08, 0.92], F(90, 92, 84, 74, 93, 72, 91), 'CLINICAL_FINISH', 'R', 540],
  ['alvarez', 'Julián Álvarez', '훌리안 알바레스', 'JULIÁN', 'ÁLVAREZ', 'J. ALVAREZ', '19', ['ST', 'CF'], 'ARG', [S3, DRK, 'short', 'none', 0.95, 0.96], F(90, 91, 86, 82, 90, 86, 92), 'BALANCED_FINISH', 'R', 520],
  ['griezmann', 'Antoine Griezmann', '앙투안 그리즈만', 'ANTOINE', 'GRIEZMANN', 'GRIEZMANN', '7', ['CF', 'CAM'], 'FRA', [S1, LBR, 'sidepart', 'stubble', 0.96, 0.94], F(84, 92, 90, 76, 90, 88, 94), 'LEFT_FINESSE', 'L', 360],
  ['dembele', 'Ousmane Dembélé', '우스만 뎀벨레', 'OUSMANE', 'DEMBÉLÉ', 'DEMBELE', '10', ['RW', 'LW'], 'FRA', [S7, BLK, 'buzz', 'none', 0.98, 0.94], F(90, 86, 88, 76, 90, 80, 84), 'TWO_FOOT_FINESSE', 'B', 450],
  ['kvaratskhelia', 'Khvicha Kvaratskhelia', '흐비차 크바라츠헬리아', 'KHVICHA', 'KVARATSKHELIA', 'KVARA', '7', ['LW'], 'GEO', [S1, BRN, 'swept', 'none', 1.03, 0.94], F(87, 87, 90, 70, 90, 80, 86), 'QUICK_LOW_CURL', 'R', 460],
  ['rodrygo', 'Rodrygo', '호드리구', 'RODRYGO', 'GOES', 'RODRYGO', '11', ['RW', 'ST'], 'BRA', [S5, BLK, 'curly', 'none', 0.96, 0.9], F(85, 89, 90, 70, 92, 78, 89), 'QUICK_LOW_CURL', 'R', 430],
  ['endrick', 'Endrick', '엔드릭', 'ENDRICK', 'FELIPE', 'ENDRICK', '16', ['ST'], 'BRA', [S6, BLK, 'buzz', 'none', 0.93, 1.06], F(92, 84, 78, 82, 86, 66, 82), 'POWER_BURST', 'L', 300],
  ['felix', 'João Félix', '주앙 펠릭스', 'JOÃO', 'FÉLIX', 'J. FELIX', '79', ['CF', 'CAM'], 'POR', [S2, BRN, 'quiff', 'none', 0.99, 0.9], F(83, 86, 88, 72, 86, 80, 82), 'BALANCED_FINISH', 'R', 180],
  ['dybala', 'Paulo Dybala', '파울로 디발라', 'PAULO', 'DYBALA', 'DYBALA', '21', ['CF', 'CAM'], 'ARG', [S2, DRK, 'quiff', 'stubble', 0.94, 0.9], F(85, 91, 94, 78, 88, 93, 90), 'LEFT_FINESSE', 'L', 220],
  ['sane', 'Leroy Sané', '르로이 자네', 'LEROY', 'SANÉ', 'SANE', '10', ['RW', 'LW'], 'GER', [S6, BLK, 'buzz', 'stubble', 1.0, 0.98], F(91, 85, 88, 78, 86, 82, 82), 'LEFT_CURL', 'L', 240],
  ['coman', 'Kingsley Coman', '킹슬레 코망', 'KINGSLEY', 'COMAN', 'COMAN', '11', ['LW', 'RW'], 'FRA', [S6, BLK, 'buzz', 'none', 0.98, 0.9], F(84, 82, 82, 68, 86, 70, 82), 'QUICK_LOW_CURL', 'R', 180],
  ['diaz', 'Luis Díaz', '루이스 디아스', 'LUIS', 'DÍAZ', 'L. DIAZ', '7', ['LW'], 'COL', [S4, BLK, 'curly', 'none', 0.96, 0.92], F(85, 85, 86, 70, 88, 70, 84), 'QUICK_LOW_CURL', 'R', 300],
  ['nunez', 'Darwin Núñez', '다르윈 누녜스', 'DARWIN', 'NÚÑEZ', 'NUNEZ', '9', ['ST'], 'URU', [S3, BLK, 'swept', 'stubble', 1.06, 1.02], F(94, 80, 74, 82, 84, 62, 78), 'POWER_FINISH', 'R', 220],
  ['gakpo', 'Cody Gakpo', '코디 각포', 'CODY', 'GAKPO', 'GAKPO', '18', ['LW', 'ST'], 'NED', [S6, BLK, 'buzz', 'none', 1.07, 0.96], F(88, 86, 88, 74, 86, 78, 85), 'BALANCED_FINISH', 'R', 220],
  ['rashford', 'Marcus Rashford', '마커스 래시퍼드', 'MARCUS', 'RASHFORD', 'RASHFORD', '10', ['LW', 'ST'], 'ENG', [S6, BLK, 'buzz', 'stubble', 1.0, 1.0], F(91, 84, 86, 90, 84, 88, 82), 'KNUCKLE_DRIVE', 'R', 180],
  ['garnacho', 'Alejandro Garnacho', '알레한드로 가르나초', 'ALEJANDRO', 'GARNACHO', 'GARNACHO', '17', ['LW'], 'ARG', [S3, DRK, 'quiff', 'none', 0.98, 0.88], F(87, 82, 86, 72, 85, 70, 80), 'QUICK_LOW_CURL', 'R', 240],
  ['hojlund', 'Rasmus Højlund', '라스무스 회일룬', 'RASMUS', 'HØJLUND', 'HOJLUND', '9', ['ST'], 'DEN', [S1, BLD, 'short', 'none', 1.06, 1.04], F(91, 82, 72, 74, 84, 60, 82), 'POWER_FINISH', 'L', 180],
  ['nicowilliams', 'Nico Williams', '니코 윌리엄스', 'NICO', 'WILLIAMS', 'N. WILLIAMS', '10', ['LW', 'RW'], 'ESP', [S7, BLK, 'buzz', 'none', 0.98, 0.9], F(86, 84, 88, 70, 88, 74, 84), 'QUICK_LOW_CURL', 'R', 330],
  ['olmo', 'Dani Olmo', '다니 올모', 'DANI', 'OLMO', 'OLMO', '20', ['CAM'], 'ESP', [S2, DRK, 'sidepart', 'stubble', 0.97, 0.94], F(84, 90, 88, 76, 88, 84, 90), 'BALANCED_FINISH', 'R', 300],
  ['dejong', 'Frenkie de Jong', '프렝키 더 용', 'FRENKIE', 'DE JONG', 'DE JONG', '21', ['CM'], 'NED', [S1, BRN, 'swept', 'none', 1.0, 0.92], F(78, 86, 80, 66, 82, 72, 92), 'CONTROLLED_DRIVE', 'R', 320],
  ['kimmich', 'Joshua Kimmich', '요주아 키미히', 'JOSHUA', 'KIMMICH', 'KIMMICH', '6', ['CDM', 'RB'], 'GER', [S1, LBR, 'sidepart', 'none', 0.95, 0.94], F(84, 88, 88, 78, 80, 90, 92), 'SET_PIECE_CONTROL', 'R', 300],
  ['goretzka', 'Leon Goretzka', '레온 고레츠카', 'LEON', 'GORETZKA', 'GORETZKA', '8', ['CM'], 'GER', [S1, BRN, 'sidepart', 'stubble', 1.06, 1.1], F(90, 82, 74, 82, 82, 70, 86), 'CONTROLLED_DRIVE', 'R', 160],
  ['gundogan', 'İlkay Gündoğan', '일카이 귄도안', 'İLKAY', 'GÜNDOĞAN', 'GUNDOGAN', '19', ['CM', 'CAM'], 'GER', [S3, BLK, 'short', 'full', 0.97, 0.94], F(80, 90, 84, 70, 88, 80, 96), 'PENALTY_PRECISION', 'R', 150],
  ['macallister', 'Alexis Mac Allister', '알렉시스 맥알리스터', 'ALEXIS', 'MAC ALLISTER', 'MAC ALLISTER', '10', ['CM'], 'ARG', [S2, RED, 'curly', 'none', 0.97, 0.94], F(84, 88, 86, 76, 84, 86, 93), 'SET_PIECE_CONTROL', 'R', 280],
  ['enzo', 'Enzo Fernández', '엔소 페르난데스', 'ENZO', 'FERNÁNDEZ', 'ENZO', '8', ['CM'], 'ARG', [S3, DRK, 'buzz', 'stubble', 0.98, 0.96], F(88, 85, 86, 82, 82, 84, 86), 'CONTROLLED_DRIVE', 'R', 250],
  ['caicedo', 'Moisés Caicedo', '모이세스 카이세도', 'MOISÉS', 'CAICEDO', 'CAICEDO', '25', ['CDM'], 'ECU', [S6, BLK, 'buzz', 'none', 0.98, 1.0], F(82, 78, 72, 74, 78, 62, 86), 'CONTROLLED_DRIVE', 'R', 250],
  ['szoboszlai', 'Dominik Szoboszlai', '도미니크 소보슬러이', 'DOMINIK', 'SZOBOSZLAI', 'SZOBOSZLAI', '8', ['CAM', 'CM'], 'HUN', [S1, BLD, 'sidepart', 'none', 1.05, 0.98], F(94, 86, 88, 90, 82, 92, 88), 'DRIVEN_CURVE', 'R', 260],
  ['simons', 'Xavi Simons', '사비 시몬스', 'XAVI', 'SIMONS', 'SIMONS', '7', ['CAM', 'LW'], 'NED', [S4, BLK, 'curly', 'none', 0.97, 0.88], F(84, 86, 88, 72, 88, 82, 86), 'BALANCED_FINISH', 'R', 300],
  ['neves', 'João Neves', '주앙 네베스', 'JOÃO', 'NEVES', 'J. NEVES', '87', ['CM'], 'POR', [S2, DRK, 'curly', 'none', 0.9, 0.86], F(80, 84, 80, 70, 82, 74, 88), 'CONTROLLED_DRIVE', 'R', 320],
  ['vitinha', 'Vitinha', '비티냐', 'VITOR', 'VITINHA', 'VITINHA', '17', ['CM'], 'POR', [S2, DRK, 'buzz', 'none', 0.9, 0.88], F(84, 90, 86, 76, 86, 82, 92), 'CONTROLLED_DRIVE', 'R', 340],
  ['hakimi', 'Achraf Hakimi', '아슈라프 하키미', 'ACHRAF', 'HAKIMI', 'HAKIMI', '2', ['RB'], 'MAR', [S4, BLK, 'curly', 'none', 1.02, 0.94], F(90, 82, 84, 80, 84, 84, 86), 'POWER_BURST', 'R', 260],
  ['alexanderarnold', 'Trent Alexander-Arnold', '트렌트 알렉산더아널드', 'TRENT', 'ALEXANDER-ARNOLD', 'ALEXANDER-ARNOLD', '66', ['RB', 'CM'], 'ENG', [S4, BLK, 'buzz', 'none', 0.99, 0.94], F(88, 88, 96, 82, 76, 95, 88), 'DRIVEN_CURVE', 'R', 300],
  ['davies', 'Alphonso Davies', '알폰소 데이비스', 'ALPHONSO', 'DAVIES', 'DAVIES', '19', ['LB'], 'CAN', [S7, BLK, 'buzz', 'none', 0.97, 0.98], F(84, 74, 74, 64, 80, 62, 80), 'BALANCED_FINISH', 'L', 260],
  ['theo', 'Theo Hernández', '테오 에르난데스', 'THEO', 'HERNÁNDEZ', 'T. HERNANDEZ', '19', ['LB'], 'FRA', [S2, DRK, 'buzz', 'stubble', 1.03, 1.04], F(93, 80, 80, 86, 80, 82, 84), 'POWER_BURST', 'L', 280],
  ['saliba', 'William Saliba', '윌리엄 살리바', 'WILLIAM', 'SALIBA', 'SALIBA', '2', ['CB'], 'FRA', [S6, BLK, 'buzz', 'none', 1.07, 1.04], F(80, 72, 64, 68, 70, 56, 90), 'BALANCED_FINISH', 'R', 320],
  ['vandijk', 'Virgil van Dijk', '버질 반 다이크', 'VIRGIL', 'VAN DIJK', 'VAN DIJK', '4', ['CB'], 'NED', [S5, BLK, 'buzz', 'full', 1.1, 1.1], F(88, 80, 74, 80, 74, 76, 95), 'CONTROLLED_DRIVE', 'R', 300],
  ['rudiger', 'Antonio Rüdiger', '안토니오 뤼디거', 'ANTONIO', 'RÜDIGER', 'RUDIGER', '22', ['CB'], 'GER', [S6, BLK, 'bald', 'full', 1.07, 1.08], F(90, 70, 62, 78, 70, 58, 84), 'POWER_FINISH', 'R', 220],
  ['dias', 'Rúben Dias', '후벵 디아스', 'RÚBEN', 'DIAS', 'R. DIAS', '3', ['CB'], 'POR', [S3, DRK, 'buzz', 'full', 1.04, 1.06], F(82, 74, 66, 72, 72, 58, 92), 'BALANCED_FINISH', 'R', 260],
  ['marquinhos', 'Marquinhos', '마르키뉴스', 'MARCOS', 'MARQUINHOS', 'MARQUINHOS', '5', ['CB'], 'BRA', [S3, BLK, 'short', 'stubble', 1.0, 1.0], F(80, 76, 70, 70, 74, 62, 90), 'BALANCED_FINISH', 'R', 160],
  ['ederson', 'Ederson', '에데르송', 'EDERSON', 'MORAES', 'EDERSON', '31', ['GK'], 'BRA', [S3, BLD, 'buzz', 'full', 1, 1], G(86, 88, 90, 88, 88, 90, 84), 'POSITION_MASTER', 'L', 300],
  ['maignan', 'Mike Maignan', '마이크 메냥', 'MIKE', 'MAIGNAN', 'MAIGNAN', '16', ['GK'], 'FRA', [S6, BLK, 'buzz', 'full', 1, 1], G(93, 92, 90, 90, 92, 90, 88), 'LOW_SAVE', 'R', 280],
  ['oblak', 'Jan Oblak', '얀 오블락', 'JAN', 'OBLAK', 'OBLAK', '13', ['GK'], 'SVN', [S1, BRN, 'short', 'stubble', 1, 1], G(94, 88, 92, 97, 90, 92, 88), 'POSITION_MASTER', 'R', 260],
  ['terstegen', 'Marc-André ter Stegen', '마르크안드레 테어 슈테겐', 'MARC-ANDRÉ', 'TER STEGEN', 'TER STEGEN', '1', ['GK'], 'GER', [S1, LBR, 'sidepart', 'stubble', 1, 1], G(93, 90, 90, 92, 90, 90, 86), 'LOW_SAVE', 'R', 240],
  ['raya', 'David Raya', '다비드 라야', 'DAVID', 'RAYA', 'RAYA', '22', ['GK'], 'ESP', [S3, DRK, 'short', 'full', 1, 1], G(88, 87, 88, 90, 86, 88, 84), 'POSITION_MASTER', 'R', 180],
  ['kobel', 'Gregor Kobel', '그레고르 코벨', 'GREGOR', 'KOBEL', 'KOBEL', '1', ['GK'], 'SUI', [S1, BRN, 'sidepart', 'stubble', 1, 1], G(90, 88, 89, 86, 88, 89, 85), 'HIGH_REACH', 'R', 180],
];

const LEGENDS: Def[] = [
  ['pele', 'Pelé', '펠레', 'EDSON', 'PELÉ', 'PELE', '10', ['ST', 'CAM'], 'BRA', [S7, BLK, 'buzz', 'none', 0.96, 1.0], F(97, 99, 96, 92, 98, 95, 99), 'KING_OF_FOOTBALL', 'R', 2000],
  ['maradona', 'Diego Maradona', '디에고 마라도나', 'DIEGO', 'MARADONA', 'MARADONA', '10', ['CAM'], 'ARG', [S4, BLK, 'curly', 'none', 0.9, 1.02], F(86, 95, 98, 72, 96, 96, 94), 'LEFT_FINESSE', 'L', 2000],
  ['zidane', 'Zinedine Zidane', '지네딘 지단', 'ZINEDINE', 'ZIDANE', 'ZIDANE', '10', ['CAM'], 'FRA', [S3, BRN, 'bald', 'none', 1.04, 1.0], F(85, 94, 90, 74, 88, 88, 99), 'PENALTY_PRECISION', 'B', 1800],
  ['nazario', 'Ronaldo Nazário', '호나우두 나자리우', 'RONALDO', 'NAZÁRIO', 'R. NAZARIO', '9', ['ST'], 'BRA', [S5, BLK, 'buzz', 'none', 1.01, 1.06], F(96, 95, 84, 80, 98, 74, 95), 'CLINICAL_FINISH', 'R', 1900],
  ['ronaldinho', 'Ronaldinho', '호나우지뉴', 'RONALDO', 'DE ASSIS', 'RONALDINHO', '10', ['CAM', 'LW'], 'BRA', [S6, BLK, 'curly', 'none', 1.0, 0.98], F(86, 90, 98, 82, 90, 98, 93), 'FINESSE_MASTER', 'R', 1850],
  ['cruyff', 'Johan Cruyff', '요한 크루이프', 'JOHAN', 'CRUYFF', 'CRUYFF', '14', ['CF', 'CAM'], 'NED', [S1, BRN, 'swept', 'none', 0.99, 0.88], F(84, 93, 92, 70, 92, 82, 96), 'TWO_FOOT_FINESSE', 'B', 1750],
  ['beckenbauer', 'Franz Beckenbauer', '프란츠 베켄바워', 'FRANZ', 'BECKENBAUER', 'BECKENBAUER', '5', ['CB', 'CM'], 'GER', [S1, BRN, 'sidepart', 'none', 1.0, 0.98], F(86, 88, 84, 78, 82, 82, 98), 'CONTROLLED_DRIVE', 'R', 1500],
  ['henry', 'Thierry Henry', '티에리 앙리', 'THIERRY', 'HENRY', 'HENRY', '14', ['ST', 'LW'], 'FRA', [S6, BLK, 'bald', 'none', 1.06, 0.96], F(88, 96, 95, 74, 94, 82, 93), 'FINESSE_MASTER', 'R', 1600],
  ['iniesta', 'Andrés Iniesta', '안드레스 이니에스타', 'ANDRÉS', 'INIESTA', 'INIESTA', '8', ['CM'], 'ESP', [S1, BRN, 'bald', 'none', 0.94, 0.88], F(80, 93, 90, 66, 90, 80, 98), 'TWO_FOOT_FINESSE', 'B', 1450],
  ['xavi', 'Xavi', '사비', 'XAVIER', 'HERNÁNDEZ', 'XAVI', '6', ['CM'], 'ESP', [S2, DRK, 'buzz', 'stubble', 0.94, 0.92], F(78, 94, 88, 70, 86, 86, 97), 'SET_PIECE_CONTROL', 'R', 1400],
  ['kaka', 'Kaká', '카카', 'RICARDO', 'KAKÁ', 'KAKA', '22', ['CAM'], 'BRA', [S2, BRN, 'short', 'none', 1.04, 0.96], F(90, 90, 84, 80, 90, 78, 92), 'POWER_BURST', 'R', 1300],
  ['beckham', 'David Beckham', '데이비드 베컴', 'DAVID', 'BECKHAM', 'BECKHAM', '7', ['RM', 'CM'], 'ENG', [S1, BLD, 'quiff', 'stubble', 1.0, 0.96], F(84, 90, 99, 80, 74, 99, 90), 'DRIVEN_CURVE', 'R', 1250],
  ['pirlo', 'Andrea Pirlo', '안드레아 피를로', 'ANDREA', 'PIRLO', 'PIRLO', '21', ['CM'], 'ITA', [S2, DRK, 'swept', 'full', 0.99, 0.92], F(76, 96, 95, 86, 80, 99, 98), 'SET_PIECE_CONTROL', 'R', 1200],
  ['robertocarlos', 'Roberto Carlos', '호베르투 카를루스', 'ROBERTO', 'CARLOS', 'R. CARLOS', '3', ['LB'], 'BRA', [S5, BLK, 'bald', 'none', 0.9, 1.12], F(99, 78, 92, 90, 76, 94, 84), 'POWER_BURST', 'L', 1300],
  ['cafu', 'Cafu', '카푸', 'MARCOS', 'CAFU', 'CAFU', '2', ['RB'], 'BRA', [S6, BLK, 'bald', 'none', 0.98, 1.0], F(82, 74, 76, 70, 76, 66, 90), 'BALANCED_FINISH', 'R', 1150],
  ['maldini', 'Paolo Maldini', '파올로 말디니', 'PAOLO', 'MALDINI', 'MALDINI', '3', ['CB', 'LB'], 'ITA', [S3, DRK, 'swept', 'none', 1.05, 1.0], F(80, 76, 72, 70, 74, 62, 97), 'BALANCED_FINISH', 'R', 1500],
  ['cannavaro', 'Fabio Cannavaro', '파비오 칸나바로', 'FABIO', 'CANNAVARO', 'CANNAVARO', '5', ['CB'], 'ITA', [S3, BLK, 'buzz', 'none', 0.93, 1.04], F(78, 70, 62, 68, 70, 56, 95), 'BALANCED_FINISH', 'R', 1100],
  ['puyol', 'Carles Puyol', '카를레스 푸욜', 'CARLES', 'PUYOL', 'PUYOL', '5', ['CB'], 'ESP', [S2, BRN, 'curly', 'none', 0.98, 1.04], F(80, 68, 60, 70, 68, 52, 96), 'BALANCED_FINISH', 'R', 1050],
  ['ramos', 'Sergio Ramos', '세르히오 라모스', 'SERGIO', 'RAMOS', 'RAMOS', '4', ['CB'], 'ESP', [S3, DRK, 'swept', 'full', 1.02, 1.06], F(90, 86, 76, 84, 78, 78, 94), 'PENALTY_PRECISION', 'R', 1100],
  ['casillas', 'Iker Casillas', '이케르 카시야스', 'IKER', 'CASILLAS', 'CASILLAS', '1', ['GK'], 'ESP', [S2, DRK, 'short', 'stubble', 1, 1], G(98, 94, 88, 92, 96, 90, 92), 'LOW_SAVE', 'R', 1350],
  ['buffon', 'Gianluigi Buffon', '잔루이지 부폰', 'GIANLUIGI', 'BUFFON', 'BUFFON', '1', ['GK'], 'ITA', [S2, BRN, 'swept', 'stubble', 1, 1], G(95, 90, 92, 99, 92, 93, 94), 'POSITION_MASTER', 'R', 1450],
  ['cech', 'Petr Čech', '페트르 체흐', 'PETR', 'ČECH', 'CECH', '1', ['GK'], 'CZE', [S1, BRN, 'short', 'none', 1, 1], G(92, 88, 96, 95, 88, 95, 88), 'LONG_REACH', 'L', 1100],
  ['vandersar', 'Edwin van der Sar', '에드윈 판데르사르', 'EDWIN', 'VAN DER SAR', 'VAN DER SAR', '1', ['GK'], 'NED', [S1, BLD, 'bald', 'none', 1, 1], G(88, 86, 98, 94, 86, 96, 90), 'HIGH_REACH', 'R', 1050],
  ['yashin', 'Lev Yashin', '레프 야신', 'LEV', 'YASHIN', 'YASHIN', '1', ['GK'], 'URS', [S1, DRK, 'short', 'none', 1, 1], G(99, 99, 99, 99, 98, 99, 99), 'BLACK_SPIDER', 'R', 1700],
  ['best', 'George Best', '조지 베스트', 'GEORGE', 'BEST', 'BEST', '7', ['RW'], 'NIR', [S1, BLK, 'swept', 'full', 0.95, 0.9], F(84, 90, 90, 70, 92, 80, 92), 'QUICK_LOW_CURL', 'B', 1300],
  ['eusebio', 'Eusébio', '에우제비우', 'EUSÉBIO', 'DA SILVA', 'EUSEBIO', '10', ['ST'], 'POR', [S7, BLK, 'buzz', 'none', 0.99, 1.04], F(97, 90, 82, 88, 88, 86, 90), 'POWER_FINISH', 'R', 1450],
  ['vanbasten', 'Marco van Basten', '마르코 판바스턴', 'MARCO', 'VAN BASTEN', 'VAN BASTEN', '9', ['ST'], 'NED', [S1, BLD, 'sidepart', 'none', 1.05, 1.0], F(92, 96, 86, 80, 92, 80, 95), 'CLINICAL_FINISH', 'R', 1400],
  ['gullit', 'Ruud Gullit', '뤼트 굴리트', 'RUUD', 'GULLIT', 'GULLIT', '10', ['CM', 'CF'], 'NED', [S6, BLK, 'twists', 'stubble', 1.06, 1.06], F(93, 88, 84, 84, 86, 80, 92), 'POWER_BURST', 'R', 1650],
  ['rijkaard', 'Frank Rijkaard', '프랑크 레이카르트', 'FRANK', 'RIJKAARD', 'RIJKAARD', '3', ['CDM', 'CB'], 'NED', [S6, BLK, 'afro', 'none', 1.05, 1.06], F(86, 82, 76, 78, 78, 70, 94), 'CONTROLLED_DRIVE', 'R', 1150],
  ['matthaus', 'Lothar Matthäus', '로타어 마테우스', 'LOTHAR', 'MATTHÄUS', 'MATTHAUS', '10', ['CM'], 'GER', [S1, BRN, 'sidepart', 'none', 0.97, 1.02], F(94, 86, 82, 88, 82, 86, 94), 'CONTROLLED_DRIVE', 'R', 1350],
  ['bergkamp', 'Dennis Bergkamp', '데니스 베르흐캄프', 'DENNIS', 'BERGKAMP', 'BERGKAMP', '10', ['CF'], 'NED', [S1, BLD, 'short', 'none', 1.01, 0.94], F(82, 95, 92, 70, 92, 84, 96), 'FINESSE_MASTER', 'R', 1250],
  ['rooney', 'Wayne Rooney', '웨인 루니', 'WAYNE', 'ROONEY', 'ROONEY', '10', ['ST', 'CAM'], 'ENG', [S1, BRN, 'buzz', 'none', 0.96, 1.08], F(93, 88, 84, 86, 86, 84, 90), 'POWER_BURST', 'R', 1200],
  ['drogba', 'Didier Drogba', '디디에 드로그바', 'DIDIER', 'DROGBA', 'DROGBA', '11', ['ST'], 'CIV', [S7, BLK, 'buzz', 'stubble', 1.06, 1.12], F(96, 86, 82, 92, 82, 90, 92), 'KNUCKLE_DRIVE', 'R', 1150],
  ['etoo', 'Samuel Eto’o', '사뮈엘 에토오', 'SAMUEL', 'ETO’O', 'ETOO', '9', ['ST'], 'CMR', [S7, BLK, 'buzz', 'none', 0.98, 0.98], F(90, 92, 80, 74, 94, 70, 92), 'CLINICAL_FINISH', 'R', 1100],
  ['figo', 'Luís Figo', '루이스 피구', 'LUÍS', 'FIGO', 'FIGO', '7', ['RW'], 'POR', [S2, DRK, 'sidepart', 'stubble', 1.0, 0.98], F(84, 88, 92, 76, 86, 90, 90), 'SET_PIECE_CONTROL', 'R', 1250],
];


// ── UPDATE 8 — 50 new players (30 current · 18 ICONS · KIM INJIK · HEO SHIN) ─────────
const CURRENT8: Def[] = [
  ['gyokeres', 'Viktor Gyökeres', '빅토르 요케레스', 'VIKTOR', 'GYÖKERES', 'GYOKERES', '14', ['ST'], 'SWE', [S1, BRN, 'short', 'stubble', 1.03, 1.08], F(93, 87, 74, 82, 89, 70, 88), 'POWER_FINISH', 'R', 520],
  ['sesko', 'Benjamin Šeško', '베냐민 세슈코', 'BENJAMIN', 'ŠEŠKO', 'SESKO', '30', ['ST'], 'SVN', [S1, BRN, 'short', 'none', 1.08, 1.02], F(91, 82, 70, 80, 84, 66, 80), 'POWER_FINISH', 'R', 300],
  ['watkins', 'Ollie Watkins', '올리 왓킨스', 'OLLIE', 'WATKINS', 'WATKINS', '11', ['ST'], 'ENG', [S5, BLK, 'buzz', 'stubble', 1.0, 0.98], F(85, 86, 76, 70, 88, 68, 85), 'CLINICAL_FINISH', 'R', 240],
  ['vlahovic', 'Dušan Vlahović', '두샨 블라호비치', 'DUŠAN', 'VLAHOVIĆ', 'VLAHOVIC', '9', ['ST'], 'SRB', [S2, BLK, 'bun', 'stubble', 1.06, 1.06], F(90, 84, 78, 84, 83, 80, 82), 'POWER_FINISH', 'L', 260],
  ['jdavid', 'Jonathan David', '조너선 데이비드', 'JONATHAN', 'DAVID', 'J. DAVID', '9', ['ST'], 'CAN', [S6, BLK, 'buzz', 'none', 0.96, 0.94], F(83, 88, 78, 68, 89, 72, 87), 'CLINICAL_FINISH', 'R', 250],
  ['lookman', 'Ademola Lookman', '아데몰라 루크먼', 'ADEMOLA', 'LOOKMAN', 'LOOKMAN', '11', ['LW', 'ST'], 'NGA', [S6, BLK, 'twists', 'none', 0.95, 0.92], F(84, 86, 86, 68, 90, 74, 84), 'QUICK_LOW_CURL', 'R', 300],
  ['raphinha', 'Raphinha', '하피냐', 'RAPHAEL', 'RAPHINHA', 'RAPHINHA', '11', ['RW', 'LW'], 'BRA', [S4, DRK, 'short', 'none', 0.98, 0.92], F(88, 88, 92, 80, 88, 88, 86), 'LEFT_FINESSE', 'L', 480],
  ['olise', 'Michael Olise', '마이클 올리세', 'MICHAEL', 'OLISE', 'OLISE', '17', ['RW', 'CAM'], 'FRA', [S6, BLK, 'curly', 'none', 0.97, 0.9], F(82, 89, 92, 72, 87, 86, 88), 'LEFT_CURL', 'L', 420],
  ['doue', 'Désiré Doué', '데지레 두에', 'DÉSIRÉ', 'DOUÉ', 'DOUE', '14', ['LW', 'CAM'], 'FRA', [S6, BLK, 'buzz', 'none', 0.97, 0.9], F(83, 85, 87, 72, 88, 76, 84), 'TWO_FOOT_FINESSE', 'B', 380],
  ['barcola', 'Bradley Barcola', '브래들리 바르콜라', 'BRADLEY', 'BARCOLA', 'BARCOLA', '29', ['LW'], 'FRA', [S6, BLK, 'short', 'none', 0.98, 0.9], F(84, 82, 82, 66, 87, 68, 80), 'QUICK_LOW_CURL', 'R', 330],
  ['yildiz', 'Kenan Yıldız', '케난 일디즈', 'KENAN', 'YILDIZ', 'YILDIZ', '10', ['LW', 'CAM'], 'TUR', [S3, DRK, 'swept', 'none', 1.0, 0.92], F(83, 85, 89, 74, 86, 84, 83), 'FINESSE_MASTER', 'R', 320],
  ['guler', 'Arda Güler', '아르다 귈레르', 'ARDA', 'GÜLER', 'GULER', '15', ['CAM', 'RW'], 'TUR', [S3, DRK, 'sidepart', 'none', 0.92, 0.88], F(80, 89, 92, 76, 84, 90, 85), 'LEFT_CURL', 'L', 350],
  ['kubo', 'Takefusa Kubo', '구보 다케후사', 'TAKEFUSA', 'KUBO', 'KUBO', '14', ['RW'], 'JPN', [S1, BLK, 'fringe', 'none', 0.9, 0.86], F(76, 86, 88, 66, 86, 82, 84), 'LEFT_CURL', 'L', 220],
  ['mitoma', 'Kaoru Mitoma', '미토마 가오루', 'KAORU', 'MITOMA', 'MITOMA', '22', ['LW'], 'JPN', [S1, BLK, 'short', 'none', 0.95, 0.88], F(78, 84, 84, 64, 89, 70, 83), 'LOW_DISGUISE', 'R', 190],
  ['leekangin', 'Lee Kang-in', '이강인', 'LEE', 'KANG-IN', 'LEE KANG IN', '19', ['CAM', 'RW'], 'KOR', [S1, BLK, 'fringe', 'none', 0.9, 0.88], F(78, 89, 92, 74, 84, 90, 86), 'LEFT_FINESSE', 'L', 220],
  ['kimminjae', 'Kim Min-jae', '김민재', 'KIM', 'MIN-JAE', 'KIM MIN JAE', '3', ['CB'], 'KOR', [S1, BLK, 'short', 'none', 1.07, 1.1], F(86, 74, 62, 78, 70, 58, 88), 'CONTROLLED_DRIVE', 'R', 250],
  ['hwangheechan', 'Hwang Hee-chan', '황희찬', 'HWANG', 'HEE-CHAN', 'HWANG', '11', ['ST', 'LW'], 'KOR', [S1, BLK, 'sidepart', 'none', 0.94, 1.0], F(85, 80, 74, 70, 84, 64, 80), 'POWER_BURST', 'R', 120],
  ['chiesa', 'Federico Chiesa', '페데리코 키에사', 'FEDERICO', 'CHIESA', 'CHIESA', '14', ['RW', 'LW'], 'ITA', [S2, DRK, 'swept', 'stubble', 0.98, 0.94], F(86, 82, 84, 76, 84, 74, 80), 'TWO_FOOT_FINESSE', 'B', 160],
  ['eze', 'Eberechi Eze', '에베레치 에제', 'EBERECHI', 'EZE', 'EZE', '10', ['CAM', 'LW'], 'ENG', [S6, BLK, 'buzz', 'none', 0.99, 0.92], F(85, 86, 90, 78, 86, 88, 85), 'FINESSE_MASTER', 'R', 260],
  ['cunha', 'Matheus Cunha', '마테우스 쿠냐', 'MATHEUS', 'CUNHA', 'CUNHA', '10', ['ST', 'CF'], 'BRA', [S3, DRK, 'twists', 'none', 1.0, 0.98], F(88, 84, 84, 78, 85, 74, 82), 'BALANCED_FINISH', 'R', 240],
  ['guirassy', 'Serhou Guirassy', '세루 기라시', 'SERHOU', 'GUIRASSY', 'GUIRASSY', '9', ['ST'], 'GUI', [S7, BLK, 'buzz', 'stubble', 1.04, 1.06], F(90, 86, 72, 80, 86, 66, 86), 'POWER_FINISH', 'R', 280],
  ['frimpong', 'Jeremie Frimpong', '제러미 프림퐁', 'JEREMIE', 'FRIMPONG', 'FRIMPONG', '30', ['RB', 'RW'], 'NED', [S6, BLK, 'twists', 'none', 0.9, 0.86], F(80, 78, 76, 64, 84, 62, 78), 'QUICK_LOW_CURL', 'R', 300],
  ['balde', 'Alejandro Balde', '알레한드로 발데', 'ALEJANDRO', 'BALDE', 'BALDE', '3', ['LB'], 'ESP', [S6, BLK, 'curly', 'none', 0.95, 0.88], F(76, 74, 76, 60, 80, 60, 76), 'BALANCED_FINISH', 'L', 180],
  ['bastoni', 'Alessandro Bastoni', '알레산드로 바스토니', 'ALESSANDRO', 'BASTONI', 'BASTONI', '95', ['CB'], 'ITA', [S2, BRN, 'swept', 'stubble', 1.06, 1.04], F(82, 82, 78, 76, 74, 70, 88), 'CONTROLLED_DRIVE', 'L', 280],
  ['araujo', 'Ronald Araújo', '로날드 아라우호', 'RONALD', 'ARAÚJO', 'ARAUJO', '4', ['CB'], 'URU', [S5, BLK, 'buzz', 'stubble', 1.07, 1.12], F(87, 72, 60, 80, 68, 56, 84), 'POWER_BURST', 'R', 260],
  ['gvardiol', 'Joško Gvardiol', '요슈코 그바르디올', 'JOŠKO', 'GVARDIOL', 'GVARDIOL', '24', ['CB', 'LB'], 'CRO', [S2, DRK, 'short', 'none', 1.05, 1.06], F(86, 78, 72, 78, 78, 64, 86), 'CONTROLLED_DRIVE', 'L', 320],
  ['gabriel', 'Gabriel Magalhães', '가브리엘 마갈량이스', 'GABRIEL', 'MAGALHÃES', 'GABRIEL', '6', ['CB'], 'BRA', [S3, BLK, 'buzz', 'full', 1.07, 1.1], F(85, 74, 62, 76, 70, 58, 86), 'POWER_BURST', 'L', 260],
  ['diogocosta', 'Diogo Costa', '디오구 코스타', 'DIOGO', 'COSTA', 'DIOGO COSTA', '99', ['GK'], 'POR', [S2, DRK, 'short', 'stubble', 1.05, 1.02], G(88, 87, 88, 86, 87, 87, 93), 'PENALTY_SPECIALIST', 'R', 220],
  ['szczesny', 'Wojciech Szczęsny', '보이치에흐 슈체스니', 'WOJCIECH', 'SZCZĘSNY', 'SZCZESNY', '25', ['GK'], 'POL', [S1, BRN, 'short', 'stubble', 1.05, 1.04], G(87, 84, 86, 90, 84, 86, 88), 'POSITION_MASTER', 'R', 140],
  ['mamardashvili', 'Giorgi Mamardashvili', '기오르기 마마르다시빌리', 'GIORGI', 'MAMARDASHVILI', 'MAMARDASHVILI', '25', ['GK'], 'GEO', [S2, BLK, 'short', 'stubble', 1.1, 1.04], G(89, 86, 92, 85, 85, 90, 86), 'LONG_REACH', 'R', 200],
  // HEO SHIN — PIPA custom current player (Liverpool)
  ['heoshin', 'Heo Shin', '허신', 'HEO', 'SHIN', 'HEO SHIN', '9', ['ST'], 'KOR', [S1, BLK, 'short', 'none', 1.02, 1.0], F(93, 91, 87, 86, 92, 82, 92), 'RED_FINISHER', 'R', 520],
];

const ICONS8: Def[] = [
  ['rivaldo', 'Rivaldo', '히바우두', 'RIVALDO', 'FERREIRA', 'RIVALDO', '10', ['CAM', 'LW'], 'BRA', [S4, BLK, 'short', 'none', 1.03, 0.92], F(92, 90, 94, 86, 88, 93, 89), 'LEFT_CURL', 'L', 1350],
  ['romario', 'Romário', '호마리우', 'ROMÁRIO', 'DE SOUZA', 'ROMARIO', '11', ['ST'], 'BRA', [S5, BLK, 'short', 'none', 0.88, 0.9], F(84, 96, 82, 70, 96, 74, 97), 'CLINICAL_FINISH', 'R', 1550],
  ['garrincha', 'Garrincha', '가린샤', 'MANUEL', 'GARRINCHA', 'GARRINCHA', '7', ['RW'], 'BRA', [S5, BLK, 'short', 'none', 0.92, 0.9], F(84, 88, 93, 68, 94, 82, 92), 'QUICK_LOW_CURL', 'R', 1650],
  ['stoichkov', 'Hristo Stoichkov', '흐리스토 스토이치코프', 'HRISTO', 'STOICHKOV', 'STOICHKOV', '8', ['ST', 'LW'], 'BUL', [S2, DRK, 'short', 'none', 0.97, 1.0], F(92, 87, 88, 88, 86, 89, 84), 'LEFT_FINESSE', 'L', 1150],
  ['nedved', 'Pavel Nedvěd', '파벨 네드베드', 'PAVEL', 'NEDVĚD', 'NEDVED', '11', ['CAM', 'LM'], 'CZE', [S1, BLD, 'swept', 'none', 0.98, 0.96], F(93, 87, 84, 90, 85, 84, 88), 'POWER_BURST', 'B', 1100],
  ['raul', 'Raúl', '라울', 'RAÚL', 'GONZÁLEZ', 'RAUL', '7', ['ST', 'CF'], 'ESP', [S2, BLK, 'short', 'none', 0.98, 0.94], F(84, 93, 85, 72, 92, 78, 95), 'CLINICAL_FINISH', 'L', 1200],
  ['shevchenko', 'Andriy Shevchenko', '안드리 셰우첸코', 'ANDRIY', 'SHEVCHENKO', 'SHEVCHENKO', '7', ['ST'], 'UKR', [S1, LBR, 'short', 'none', 1.02, 1.0], F(93, 91, 80, 84, 91, 78, 90), 'POWER_FINISH', 'R', 1250],
  ['delpiero', 'Alessandro Del Piero', '알레산드로 델피에로', 'ALESSANDRO', 'DEL PIERO', 'DEL PIERO', '10', ['CF', 'CAM'], 'ITA', [S2, DRK, 'short', 'none', 0.95, 0.94], F(84, 92, 96, 78, 88, 96, 93), 'FINESSE_MASTER', 'R', 1300],
  ['totti', 'Francesco Totti', '프란체스코 토티', 'FRANCESCO', 'TOTTI', 'TOTTI', '10', ['CAM', 'CF'], 'ITA', [S2, LBR, 'short', 'none', 1.0, 1.02], F(90, 92, 90, 84, 86, 90, 95), 'SET_PIECE_CONTROL', 'R', 1300],
  ['batistuta', 'Gabriel Batistuta', '가브리엘 바티스투타', 'GABRIEL', 'BATISTUTA', 'BATISTUTA', '9', ['ST'], 'ARG', [S2, BRN, 'swept', 'none', 1.04, 1.04], F(97, 90, 78, 92, 86, 82, 90), 'POWER_FINISH', 'R', 1250],
  ['torres', 'Fernando Torres', '페르난도 토레스', 'FERNANDO', 'TORRES', 'TORRES', '9', ['ST'], 'ESP', [S1, BLD, 'short', 'none', 1.04, 0.96], F(88, 89, 78, 74, 90, 70, 86), 'QUICK_LOW_CURL', 'R', 1050],
  ['villa', 'David Villa', '다비드 비야', 'DAVID', 'VILLA', 'VILLA', '7', ['ST'], 'ESP', [S2, BLK, 'short', 'full', 0.94, 0.96], F(87, 93, 86, 76, 90, 84, 90), 'CLINICAL_FINISH', 'B', 1100],
  ['robben', 'Arjen Robben', '아르연 로번', 'ARJEN', 'ROBBEN', 'ROBBEN', '10', ['RW'], 'NED', [S1, LBR, 'bald', 'none', 0.98, 0.92], F(90, 89, 95, 80, 91, 82, 90), 'LEFT_CURL', 'L', 1350],
  ['ribery', 'Franck Ribéry', '프랑크 리베리', 'FRANCK', 'RIBÉRY', 'RIBERY', '7', ['LW'], 'FRA', [S2, BRN, 'buzz', 'stubble', 0.92, 0.94], F(84, 86, 90, 70, 90, 82, 86), 'LOW_DISGUISE', 'R', 1250],
  ['gerrard', 'Steven Gerrard', '스티븐 제라드', 'STEVEN', 'GERRARD', 'GERRARD', '8', ['CM', 'CAM'], 'ENG', [S1, BRN, 'short', 'none', 1.01, 1.02], F(96, 90, 86, 92, 84, 88, 93), 'CONTROLLED_DRIVE', 'R', 1200],
  ['lampard', 'Frank Lampard', '프랭크 램파드', 'FRANK', 'LAMPARD', 'LAMPARD', '8', ['CM', 'CAM'], 'ENG', [S1, BRN, 'short', 'none', 1.0, 1.02], F(91, 92, 85, 88, 86, 86, 95), 'PENALTY_PRECISION', 'L', 1150],
  ['vieira', 'Patrick Vieira', '파트리크 비에이라', 'PATRICK', 'VIEIRA', 'VIEIRA', '4', ['CM', 'CDM'], 'FRA', [S6, BLK, 'buzz', 'none', 1.1, 1.06], F(88, 84, 74, 82, 80, 70, 92), 'CONTROLLED_DRIVE', 'R', 1300],
  ['baresi', 'Franco Baresi', '프랑코 바레시', 'FRANCO', 'BARESI', 'BARESI', '6', ['CB'], 'ITA', [S2, DRK, 'short', 'none', 0.97, 0.98], F(82, 84, 70, 76, 74, 68, 97), 'BALANCED_FINISH', 'R', 1450],
  // KIM INJIK — PIPA custom KOREAN ICON
  ['kiminjik', 'Kim Injik', '김인직', 'KIM', 'INJIK', 'KIM INJIK', '9', ['ST'], 'KOR', [S1, BLK, 'short', 'none', 1.02, 1.02], F(96, 95, 89, 94, 95, 88, 97), 'KOREAN_LEGEND', 'R', 1600],
];


// ── UPDATE 9 — 50 new players (Korea & low-price 20 · overseas 20 · ICONS 10) ────────
const CURRENT9: Def[] = [
  ['chogueseong', 'Cho Gue-sung', '조규성', 'CHO', 'GUE-SUNG', 'CHO', '9', ['ST'], 'KOR', [S1, BLK, 'swept', 'none', 1.06, 1.02], F(84, 76, 66, 72, 78, 60, 76), 'POWER_FINISH', 'R', 10],
  ['ohhyeongyu', 'Oh Hyeon-gyu', '오현규', 'OH', 'HYEON-GYU', 'OH', '18', ['ST'], 'KOR', [S2, BLK, 'buzz', 'none', 1.0, 1.04], F(85, 75, 64, 74, 79, 58, 74), 'POWER_BURST', 'R', 12],
  ['leejaesung', 'Lee Jae-sung', '이재성', 'LEE', 'JAE-SUNG', 'LEE JS', '10', ['CAM'], 'KOR', [S1, BLK, 'short', 'none', 0.98, 0.94], F(74, 82, 80, 64, 78, 74, 84), 'BALANCED_FINISH', 'R', 25],
  ['hwanginbeom', 'Hwang In-beom', '황인범', 'HWANG', 'IN-BEOM', 'HWANG IB', '6', ['CM'], 'KOR', [S1, BLK, 'sidepart', 'none', 0.96, 0.94], F(76, 83, 82, 70, 76, 80, 85), 'CONTROLLED_DRIVE', 'R', 35],
  ['seolyoungwoo', 'Seol Young-woo', '설영우', 'SEOL', 'YOUNG-WOO', 'SEOL', '22', ['RB'], 'KOR', [S1, BLK, 'short', 'none', 0.98, 0.94], F(72, 74, 72, 60, 74, 62, 76), 'BALANCED_FINISH', 'R', 15],
  ['baejunho', 'Bae Jun-ho', '배준호', 'BAE', 'JUN-HO', 'BAE', '10', ['CAM'], 'KOR', [S1, BLK, 'fringe', 'none', 0.98, 0.9], F(72, 79, 82, 60, 80, 72, 76), 'LOW_DISGUISE', 'R', 20],
  ['yanghyunjun', 'Yang Hyun-jun', '양현준', 'YANG', 'HYUN-JUN', 'YANG', '13', ['RW'], 'KOR', [S1, BLK, 'fringe', 'none', 0.97, 0.9], F(74, 74, 78, 58, 80, 64, 72), 'QUICK_LOW_CURL', 'R', 12],
  ['eomjisung', 'Eom Ji-sung', '엄지성', 'EOM', 'JI-SUNG', 'EOM', '10', ['LW'], 'KOR', [S1, BLK, 'short', 'none', 0.95, 0.9], F(72, 74, 76, 58, 78, 62, 72), 'QUICK_LOW_CURL', 'R', 10],
  ['honghyunseok', 'Hong Hyun-seok', '홍현석', 'HONG', 'HYUN-SEOK', 'HONG HS', '8', ['CM'], 'KOR', [S1, BLK, 'short', 'none', 0.96, 0.94], F(74, 78, 82, 66, 74, 80, 76), 'LEFT_CURL', 'L', 18],
  ['jungwooyeong', 'Jeong Woo-yeong', '정우영', 'JEONG', 'WOO-YEONG', 'JEONG', '11', ['RW'], 'KOR', [S1, BLK, 'fringe', 'none', 0.96, 0.92], F(74, 76, 76, 60, 80, 62, 74), 'LOW_DISGUISE', 'R', 15],
  ['kwonchanghoon', 'Kwon Chang-hoon', '권창훈', 'KWON', 'CHANG-HOON', 'KWON', '22', ['CAM'], 'KOR', [S1, BLK, 'short', 'none', 0.93, 0.92], F(74, 78, 80, 64, 76, 76, 76), 'LEFT_FINESSE', 'L', 10],
  ['nasangho', 'Na Sang-ho', '나상호', 'NA', 'SANG-HO', 'NA', '7', ['RW'], 'KOR', [S1, BLK, 'short', 'none', 0.94, 0.94], F(74, 76, 74, 62, 78, 62, 74), 'QUICK_LOW_CURL', 'R', 10],
  ['kimyounggwon', 'Kim Young-gwon', '김영권', 'KIM', 'YOUNG-GWON', 'KIM YG', '19', ['CB'], 'KOR', [S1, BLK, 'short', 'none', 1.02, 1.04], F(76, 70, 62, 66, 64, 58, 84), 'CONTROLLED_DRIVE', 'L', 15],
  ['johyeonwoo', 'Jo Hyeon-woo', '조현우', 'JO', 'HYEON-WOO', 'JO', '21', ['GK'], 'KOR', [S1, BLK, 'curly', 'none', 1.03, 1.0], G(86, 84, 82, 84, 82, 82, 84), 'PENALTY_SPECIALIST', 'R', 30],
  ['songbumkeun', 'Song Bum-keun', '송범근', 'SONG', 'BUM-KEUN', 'SONG', '1', ['GK'], 'KOR', [S1, BLK, 'short', 'none', 1.07, 1.02], G(80, 78, 84, 80, 78, 82, 76), 'HIGH_REACH', 'R', 10],
  ['kimseunggyu', 'Kim Seung-gyu', '김승규', 'KIM', 'SEUNG-GYU', 'KIM SG', '1', ['GK'], 'KOR', [S1, BLK, 'short', 'none', 1.05, 1.0], G(83, 80, 84, 84, 80, 82, 80), 'POSITION_MASTER', 'R', 14],
  ['leeseungwoo', 'Lee Seung-woo', '이승우', 'LEE', 'SEUNG-WOO', 'LEE SW', '10', ['LW'], 'KOR', [S1, BLK, 'spiky', 'none', 0.9, 0.9], F(72, 76, 78, 60, 80, 66, 78), 'LOW_DISGUISE', 'R', 12],
  ['baekseungho', 'Paik Seung-ho', '백승호', 'PAIK', 'SEUNG-HO', 'PAIK', '8', ['CM'], 'KOR', [S1, BLK, 'short', 'none', 0.97, 0.96], F(78, 78, 76, 74, 72, 74, 80), 'CONTROLLED_DRIVE', 'R', 15],
  ['leedongkyeong', 'Lee Dong-gyeong', '이동경', 'LEE', 'DONG-GYEONG', 'LEE DG', '14', ['CAM'], 'KOR', [S1, BLK, 'fringe', 'none', 0.95, 0.92], F(76, 78, 82, 70, 76, 80, 76), 'LEFT_FINESSE', 'L', 20],
  ['leedongjun', 'Lee Dong-jun', '이동준', 'LEE', 'DONG-JUN', 'LEE DJ', '11', ['RW'], 'KOR', [S1, BLK, 'short', 'none', 0.94, 0.92], F(74, 72, 72, 60, 78, 58, 70), 'POWER_BURST', 'R', 10],
  // overseas
  ['pulisic', 'Christian Pulisic', '크리스천 풀리식', 'CHRISTIAN', 'PULISIC', 'PULISIC', '11', ['RW'], 'USA', [S1, BRN, 'short', 'none', 0.96, 0.92], F(84, 85, 85, 72, 86, 78, 84), 'TWO_FOOT_FINESSE', 'R', 220],
  ['santigimenez', 'Santiago Giménez', '산티아고 히메네스', 'SANTIAGO', 'GIMÉNEZ', 'S. GIMENEZ', '7', ['ST'], 'MEX', [S3, DRK, 'short', 'stubble', 1.02, 1.02], F(86, 82, 70, 76, 82, 64, 80), 'CLINICAL_FINISH', 'R', 160],
  ['calhanoglu', 'Hakan Çalhanoğlu', '하칸 찰하놀루', 'HAKAN', 'ÇALHANOĞLU', 'CALHANOGLU', '20', ['CM'], 'TUR', [S2, DRK, 'short', 'full', 0.98, 0.98], F(86, 86, 90, 88, 76, 92, 88), 'SET_PIECE_CONTROL', 'R', 220],
  ['barella', 'Nicolò Barella', '니콜로 바렐라', 'NICOLÒ', 'BARELLA', 'BARELLA', '23', ['CM'], 'ITA', [S2, DRK, 'swept', 'stubble', 0.94, 0.94], F(84, 84, 82, 78, 80, 76, 88), 'BALANCED_FINISH', 'R', 290],
  ['tonali', 'Sandro Tonali', '산드로 토날리', 'SANDRO', 'TONALI', 'TONALI', '8', ['CM'], 'ITA', [S2, BRN, 'swept', 'full', 0.98, 0.98], F(84, 82, 80, 82, 76, 78, 86), 'CONTROLLED_DRIVE', 'R', 270],
  ['dimarco', 'Federico Dimarco', '페데리코 디마르코', 'FEDERICO', 'DIMARCO', 'DIMARCO', '32', ['LB'], 'ITA', [S2, DRK, 'short', 'stubble', 0.94, 0.94], F(84, 82, 88, 78, 74, 86, 80), 'LEFT_CURL', 'L', 200],
  ['benwhite', 'Ben White', '벤 화이트', 'BEN', 'WHITE', 'WHITE', '4', ['RB'], 'ENG', [S1, BRN, 'short', 'full', 1.0, 0.98], F(76, 74, 70, 64, 70, 60, 80), 'BALANCED_FINISH', 'R', 110],
  ['timber', 'Jurriën Timber', '위리엔 팀버', 'JURRIËN', 'TIMBER', 'TIMBER', '12', ['RB'], 'NED', [S6, BLK, 'twists', 'none', 0.98, 0.96], F(76, 76, 72, 64, 74, 60, 82), 'BALANCED_FINISH', 'R', 170],
  ['vandeven', 'Micky van de Ven', '미키 판더펜', 'MICKY', 'VAN DE VEN', 'VAN DE VEN', '37', ['CB'], 'NED', [S1, BLD, 'short', 'none', 1.06, 1.02], F(80, 70, 62, 70, 72, 56, 80), 'POWER_BURST', 'L', 210],
  ['huijsen', 'Dean Huijsen', '딘 하위센', 'DEAN', 'HUIJSEN', 'HUIJSEN', '24', ['CB'], 'ESP', [S2, BRN, 'swept', 'none', 1.08, 1.02], F(80, 76, 70, 74, 70, 64, 82), 'CONTROLLED_DRIVE', 'R', 220],
  ['endo', 'Wataru Endo', '엔도 와타루', 'WATARU', 'ENDO', 'ENDO', '3', ['CDM'], 'JPN', [S1, BLK, 'short', 'none', 0.96, 1.0], F(76, 74, 70, 72, 70, 62, 84), 'CONTROLLED_DRIVE', 'R', 60],
  ['minamino', 'Takumi Minamino', '미나미노 다쿠미', 'TAKUMI', 'MINAMINO', 'MINAMINO', '18', ['CAM'], 'JPN', [S1, BLK, 'fringe', 'none', 0.94, 0.9], F(76, 80, 78, 64, 82, 70, 80), 'LOW_DISGUISE', 'R', 75],
  ['kamada', 'Daichi Kamada', '가마다 다이치', 'DAICHI', 'KAMADA', 'KAMADA', '18', ['CAM'], 'JPN', [S1, BLK, 'swept', 'none', 0.98, 0.92], F(76, 80, 78, 66, 78, 72, 82), 'BALANCED_FINISH', 'R', 60],
  ['itohiroki', 'Hiroki Ito', '이토 히로키', 'HIROKI', 'ITO', 'ITO', '21', ['CB'], 'JPN', [S1, BLK, 'short', 'none', 1.04, 1.02], F(80, 72, 70, 72, 68, 66, 80), 'CONTROLLED_DRIVE', 'L', 85],
  ['sugawara', 'Yukinari Sugawara', '스가와라 유키나리', 'YUKINARI', 'SUGAWARA', 'SUGAWARA', '16', ['RB'], 'JPN', [S1, BLK, 'fringe', 'none', 0.96, 0.92], F(74, 74, 78, 62, 72, 70, 74), 'BALANCED_FINISH', 'R', 45],
  ['suzukizion', 'Zion Suzuki', '스즈키 자이온', 'ZION', 'SUZUKI', 'SUZUKI', '31', ['GK'], 'JPN', [S5, BLK, 'buzz', 'none', 1.08, 1.04], G(85, 84, 88, 82, 82, 86, 80), 'LONG_REACH', 'R', 110],
  ['goncaloramos', 'Gonçalo Ramos', '곤살루 하무스', 'GONÇALO', 'RAMOS', 'G. RAMOS', '9', ['ST'], 'POR', [S2, BLK, 'short', 'stubble', 1.0, 1.0], F(86, 86, 74, 76, 84, 66, 84), 'CLINICAL_FINISH', 'R', 230],
  ['fabianruiz', 'Fabián Ruiz', '파비안 루이스', 'FABIÁN', 'RUIZ', 'FABIAN', '8', ['CM'], 'ESP', [S2, DRK, 'bun', 'full', 1.0, 0.94], F(82, 84, 86, 76, 76, 80, 86), 'LEFT_FINESSE', 'L', 170],
  ['manukone', 'Manu Koné', '마누 코네', 'MANU', 'KONÉ', 'KONE', '17', ['CM'], 'FRA', [S7, BLK, 'buzz', 'none', 1.0, 1.02], F(80, 74, 70, 72, 72, 60, 78), 'POWER_BURST', 'R', 95],
  ['moukoko', 'Youssoufa Moukoko', '유수파 무코코', 'YOUSSOUFA', 'MOUKOKO', 'MOUKOKO', '18', ['ST'], 'GER', [S7, BLK, 'buzz', 'none', 0.94, 0.96], F(80, 76, 68, 66, 80, 58, 70), 'LOW_DISGUISE', 'L', 35],
];

const ICONS9: Def[] = [
  ['parkjisung', 'Park Ji-sung', '박지성', 'PARK', 'JI-SUNG', 'PARK', '13', ['CM'], 'KOR', [S1, BLK, 'short', 'none', 0.96, 0.98], F(82, 86, 80, 78, 84, 72, 92), 'BALANCED_FINISH', 'R', 800],
  ['chabumkun', 'Cha Bum-kun', '차범근', 'CHA', 'BUM-KUN', 'CHA', '11', ['ST'], 'KOR', [S1, BLK, 'short', 'none', 1.0, 1.04], F(95, 90, 78, 88, 90, 74, 90), 'POWER_FINISH', 'R', 1400],
  ['ahnjunghwan', 'Ahn Jung-hwan', '안정환', 'AHN', 'JUNG-HWAN', 'AHN', '19', ['CF'], 'KOR', [S1, DRK, 'swept', 'none', 0.98, 0.94], F(80, 86, 84, 70, 82, 80, 84), 'CLINICAL_FINISH', 'R', 430],
  ['hongmyungbo', 'Hong Myung-bo', '홍명보', 'HONG', 'MYUNG-BO', 'HONG', '20', ['CB'], 'KOR', [S1, BLK, 'short', 'none', 1.0, 1.0], F(84, 84, 76, 80, 72, 80, 94), 'PENALTY_PRECISION', 'R', 550],
  ['kimnamil', 'Kim Nam-il', '김남일', 'KIM', 'NAM-IL', 'KIM NI', '5', ['CDM'], 'KOR', [S1, BLK, 'short', 'none', 0.98, 1.02], F(82, 76, 70, 76, 70, 64, 84), 'CONTROLLED_DRIVE', 'R', 260],
  ['parkchuyoung', 'Park Chu-young', '박주영', 'PARK', 'CHU-YOUNG', 'PARK CY', '10', ['ST'], 'KOR', [S1, BLK, 'short', 'none', 1.0, 0.96], F(82, 84, 80, 74, 80, 84, 82), 'SET_PIECE_CONTROL', 'R', 300],
  ['leedongguk', 'Lee Dong-gook', '이동국', 'LEE', 'DONG-GOOK', 'LEE DG', '20', ['ST'], 'KOR', [S1, BLK, 'short', 'none', 1.05, 1.06], F(88, 86, 74, 82, 82, 70, 86), 'POWER_FINISH', 'R', 550],
  ['leeyoungpyo', 'Lee Young-pyo', '이영표', 'LEE', 'YOUNG-PYO', 'LEE YP', '12', ['LB'], 'KOR', [S1, BLK, 'short', 'none', 0.94, 0.94], F(74, 82, 80, 64, 80, 70, 90), 'TWO_FOOT_FINESSE', 'B', 450],
  ['berbatov', 'Dimitar Berbatov', '디미타르 베르바토프', 'DIMITAR', 'BERBATOV', 'BERBATOV', '9', ['ST'], 'BUL', [S2, DRK, 'swept', 'stubble', 1.06, 0.98], F(84, 90, 86, 76, 86, 78, 96), 'CLINICAL_FINISH', 'R', 820],
  ['klose', 'Miroslav Klose', '미로슬라프 클로제', 'MIROSLAV', 'KLOSE', 'KLOSE', '11', ['ST'], 'GER', [S1, BRN, 'short', 'none', 1.03, 1.0], F(88, 93, 74, 76, 88, 66, 92), 'CLINICAL_FINISH', 'R', 1050],
];

// ── UPDATE 10 — 50 new players: 9 PIPA ORIGINALS · 31 current · 10 ICONS ─────────────
/**
 * PIPA ORIGINAL players — fictional characters made for PIPA (names, teams and traits as the
 * game's creator specified). They are not real professional footballers.
 */
const ORIGINALS10: Def[] = [
  ['songinwoo', 'Song In-woo', '송인우', 'SONG', 'IN-WOO', 'SONG', '7', ['RW'], 'KOR', [S1, BLK, 'fringe', 'none', 0.95, 0.9], F(69, 88, 99, 60, 82, 94, 86), 'TWO_FOOT_CURL_MASTER', 'B', 360],
  ['chohyunsun', 'Cho Hyun-sun', '조현선', 'CHO', 'HYUN-SUN', 'CHO', '11', ['LW'], 'KOR', [S1, BLK, 'short', 'none', 1.0, 1.04], F(99, 90, 78, 85, 86, 70, 86), 'THUNDER_STRIKE', 'R', 2000], // UPDATE 11: 3.9억 → 20억
  ['parkseungho', 'Park Seung-ho', '박승호', 'PARK', 'SEUNG-HO', 'PARK S.H.', '10', ['LW', 'CAM'], 'KOR', [S1, BLK, 'spiky', 'none', 1.02, 1.02], F(99, 65, 73, 82, 78, 66, 70), 'UNSTABLE_CANNON', 'R', 270],
  ['parksaha', 'Park Sa-ha', '박사하', 'PARK', 'SA-HA', 'PARK SAHA', '1', ['GK'], 'KOR', [S1, BLK, 'short', 'none', 0.9, 0.92], G(97, 98, 89, 94, 98, 88, 95), 'SMALL_FLYING_KEEPER', 'R', 1300],
  ['kimtaein', 'Kim Tae-in', '김태인', 'KIM', 'TAE-IN', 'KIM T.I.', '10', ['CAM'], 'KOR', [S1, BLK, 'swept', 'none', 1.0, 1.02], F(97, 90, 81, 86, 86, 53, 88), 'ICON_POWER_DRIVE', 'R', 1150],
  ['parkjunhyuk', 'Park Jun-hyuk', '박준혁', 'PARK', 'JUN-HYUK', 'PARK J.H.', '8', ['CM'], 'KOR', [S1, BLK, 'sidepart', 'none', 0.96, 0.92], F(68, 94, 99, 62, 84, 92, 90), 'SILK_FINESSE', 'R', 310],
  ['leeyunho', 'Lee Yun-ho', '이윤호', 'LEE', 'YUN-HO', 'LEE', '17', ['LW'], 'KOR', [S1, BLK, 'curly', 'none', 0.94, 0.9], F(67, 91, 82, 58, 80, 70, 86), 'CHIP_SHOT_ONLY', 'R', 180],
  ['choigeonwoo', 'Choi Geon-woo', '최건우', 'CHOI', 'GEON-WOO', 'CHOI', '6', ['CM'], 'KOR', [S1, BLK, 'buzz', 'none', 1.0, 1.04], F(97, 66, 76, 80, 74, 68, 72), 'WILD_POWER', 'R', 220],
  ['handongyeon', 'Han Dong-yeon', '한동연', 'HAN', 'DONG-YEON', 'HAN', '19', ['RW'], 'KOR', [S1, BLK, 'fringe', 'none', 0.96, 0.92], F(84, 67, 99, 64, 78, 86, 74), 'WILD_LEFT_CURL', 'L', 250],
];
/** PIPA ORIGINAL ids (shown with a "PIPA ORIGINAL" tag; ICON 김태인 is one too) */
export const ORIGINAL_IDS = [...ORIGINALS10.map((d) => d[0]), 'jangyounggwang', 'hanyujun', 'leejusung', 'kimgeunho', 'kimtaei', 'kimdongmin'];
/** UPDATE 10: real height (cm) where it matters in play — 박사하's 162 cm body is drawn and collides at that size */
export const HEIGHT_CM: Record<string, number> = { parksaha: 162 };

const CURRENT10: Def[] = [
  ['sorloth', 'Alexander Sørloth', '알렉산데르 쇠를로트', 'ALEXANDER', 'SØRLOTH', 'SORLOTH', '9', ['ST'], 'NOR', [S1, BLD, 'swept', 'stubble', 1.1, 1.04], F(88, 82, 68, 76, 80, 60, 80), 'POWER_FINISH', 'L', 240],
  ['schick', 'Patrik Schick', '파트리크 시크', 'PATRIK', 'SCHICK', 'SCHICK', '14', ['ST'], 'CZE', [S1, BRN, 'short', 'none', 1.04, 1.0], F(86, 84, 76, 78, 80, 66, 82), 'CLINICAL_FINISH', 'L', 160],
  ['ekitike', 'Hugo Ekitike', '위고 에키티케', 'HUGO', 'EKITIKE', 'EKITIKE', '22', ['ST'], 'FRA', [S6, BLK, 'short', 'none', 1.06, 0.94], F(84, 82, 78, 70, 84, 62, 78), 'LOW_DISGUISE', 'R', 260],
  ['mount', 'Mason Mount', '메이슨 마운트', 'MASON', 'MOUNT', 'MOUNT', '7', ['CAM'], 'ENG', [S1, BRN, 'short', 'none', 0.96, 0.94], F(78, 82, 82, 72, 76, 80, 78), 'SET_PIECE_CONTROL', 'R', 90],
  ['joaopedro', 'João Pedro', '주앙 페드루', 'JOÃO', 'PEDRO', 'JOAO PEDRO', '20', ['ST'], 'BRA', [S4, BLK, 'curly', 'none', 1.0, 0.96], F(82, 82, 80, 70, 82, 70, 80), 'LOW_DISGUISE', 'R', 160],
  ['pedroneto', 'Pedro Neto', '페드루 네투', 'PEDRO', 'NETO', 'NETO', '7', ['RW'], 'POR', [S3, BLK, 'fringe', 'none', 0.94, 0.9], F(80, 78, 84, 66, 82, 70, 76), 'LEFT_CURL', 'L', 190],
  ['madueke', 'Noni Madueke', '노니 마두에케', 'NONI', 'MADUEKE', 'MADUEKE', '20', ['RW'], 'ENG', [S7, BLK, 'buzz', 'none', 0.98, 0.92], F(80, 76, 80, 62, 80, 64, 74), 'LEFT_CURL', 'L', 150],
  ['mbeumo', 'Bryan Mbeumo', '브라이언 음뵈모', 'BRYAN', 'MBEUMO', 'MBEUMO', '19', ['RW'], 'CMR', [S6, BLK, 'short', 'none', 0.96, 0.96], F(84, 84, 84, 74, 82, 82, 82), 'LEFT_FINESSE', 'L', 290],
  ['bowen', 'Jarrod Bowen', '재러드 보언', 'JARROD', 'BOWEN', 'BOWEN', '20', ['RW'], 'ENG', [S1, DRK, 'short', 'stubble', 0.98, 0.96], F(82, 82, 82, 70, 80, 72, 80), 'LEFT_CURL', 'L', 240],
  ['gordon', 'Anthony Gordon', '앤서니 고든', 'ANTHONY', 'GORDON', 'GORDON', '10', ['LW'], 'ENG', [S1, BRN, 'sidepart', 'none', 0.98, 0.9], F(82, 80, 78, 66, 84, 64, 78), 'QUICK_LOW_CURL', 'R', 260],
  ['rogers', 'Morgan Rogers', '모건 로저스', 'MORGAN', 'ROGERS', 'ROGERS', '27', ['CAM'], 'ENG', [S5, BLK, 'buzz', 'none', 1.02, 1.0], F(84, 80, 76, 72, 80, 66, 80), 'POWER_BURST', 'R', 230],
  ['gibbswhite', 'Morgan Gibbs-White', '모건 깁스화이트', 'MORGAN', 'GIBBS-WHITE', 'GIBBS-WHITE', '10', ['CAM'], 'ENG', [S1, BRN, 'short', 'none', 0.96, 0.94], F(80, 80, 82, 70, 78, 78, 80), 'BALANCED_FINISH', 'R', 190],
  ['mainoo', 'Kobbie Mainoo', '코비 마이누', 'KOBBIE', 'MAINOO', 'MAINOO', '37', ['CM'], 'ENG', [S6, BLK, 'buzz', 'none', 0.98, 0.94], F(76, 80, 78, 66, 76, 70, 84), 'CONTROLLED_DRIVE', 'R', 130],
  ['wharton', 'Adam Wharton', '애덤 워튼', 'ADAM', 'WHARTON', 'WHARTON', '20', ['CDM'], 'ENG', [S1, BRN, 'short', 'none', 0.96, 0.94], F(74, 80, 80, 68, 72, 76, 84), 'CONTROLLED_DRIVE', 'L', 120],
  ['gallagher', 'Conor Gallagher', '코너 갤러거', 'CONOR', 'GALLAGHER', 'GALLAGHER', '4', ['CM'], 'ENG', [S1, BLD, 'short', 'none', 0.96, 0.96], F(80, 76, 72, 74, 74, 66, 80), 'POWER_BURST', 'R', 100],
  ['camavinga', 'Eduardo Camavinga', '에두아르도 카마빙가', 'EDUARDO', 'CAMAVINGA', 'CAMAVINGA', '6', ['CM'], 'FRA', [S7, BLK, 'twists', 'none', 1.02, 0.96], F(80, 80, 78, 72, 76, 70, 84), 'BALANCED_FINISH', 'L', 340],
  ['tchouameni', 'Aurélien Tchouaméni', '오렐리앵 추아메니', 'AURÉLIEN', 'TCHOUAMÉNI', 'TCHOUAMENI', '14', ['CDM'], 'FRA', [S6, BLK, 'buzz', 'none', 1.06, 1.04], F(84, 78, 72, 82, 72, 68, 84), 'CONTROLLED_DRIVE', 'R', 330],
  ['zaireemery', 'Warren Zaïre-Emery', '워렌 자이르에메리', 'WARREN', 'ZAÏRE-EMERY', 'ZAIRE-EMERY', '33', ['CM'], 'FRA', [S6, BLK, 'buzz', 'none', 0.96, 0.98], F(78, 80, 78, 70, 76, 68, 84), 'BALANCED_FINISH', 'R', 290],
  ['martinelli', 'Gabriel Martinelli', '가브리에우 마르티넬리', 'GABRIEL', 'MARTINELLI', 'MARTINELLI', '11', ['LW'], 'BRA', [S3, BLK, 'curly', 'none', 0.96, 0.92], F(82, 78, 76, 66, 84, 62, 76), 'QUICK_LOW_CURL', 'R', 200],
  ['jesus', 'Gabriel Jesus', '가브리에우 제주스', 'GABRIEL', 'JESUS', 'G. JESUS', '9', ['ST'], 'BRA', [S5, BLK, 'buzz', 'none', 0.94, 0.94], F(78, 80, 76, 64, 84, 62, 80), 'LOW_DISGUISE', 'R', 130],
  ['havertz', 'Kai Havertz', '카이 하베르츠', 'KAI', 'HAVERTZ', 'HAVERTZ', '29', ['CAM', 'ST'], 'GER', [S1, BRN, 'swept', 'none', 1.08, 0.98], F(82, 82, 78, 74, 80, 70, 82), 'CLINICAL_FINISH', 'L', 230],
  ['nicolasjackson', 'Nicolas Jackson', '니콜라 잭슨', 'NICOLAS', 'JACKSON', 'N. JACKSON', '15', ['ST'], 'SEN', [S7, BLK, 'buzz', 'none', 1.04, 0.94], F(84, 74, 70, 70, 82, 58, 70), 'POWER_BURST', 'R', 150],
  ['merino', 'Mikel Merino', '미켈 메리노', 'MIKEL', 'MERINO', 'MERINO', '23', ['CM'], 'ESP', [S2, DRK, 'swept', 'stubble', 1.04, 1.0], F(80, 80, 76, 76, 74, 70, 82), 'CONTROLLED_DRIVE', 'L', 150],
  ['brahim', 'Brahim Díaz', '브라힘 디아스', 'BRAHIM', 'DÍAZ', 'BRAHIM', '21', ['CAM', 'RW'], 'MAR', [S3, BLK, 'short', 'stubble', 0.9, 0.88], F(76, 80, 82, 62, 84, 70, 80), 'LOW_DISGUISE', 'R', 170],
  ['icardi', 'Mauro Icardi', '마우로 이카르디', 'MAURO', 'ICARDI', 'ICARDI', '9', ['ST'], 'ARG', [S2, BLK, 'swept', 'stubble', 1.02, 1.0], F(84, 86, 70, 72, 84, 62, 88), 'CLINICAL_FINISH', 'R', 80],
  ['ennesyri', 'Youssef En-Nesyri', '유세프 엔네시리', 'YOUSSEF', 'EN-NESYRI', 'EN-NESYRI', '19', ['ST'], 'MAR', [S4, BLK, 'short', 'stubble', 1.08, 1.02], F(84, 76, 64, 72, 76, 56, 74), 'POWER_FINISH', 'L', 75],
  ['toney', 'Ivan Toney', '이반 토니', 'IVAN', 'TONEY', 'TONEY', '17', ['ST'], 'ENG', [S6, BLK, 'twists', 'stubble', 1.02, 1.04], F(86, 84, 72, 78, 80, 72, 90), 'PENALTY_PRECISION', 'R', 130],
  ['solanke', 'Dominic Solanke', '도미닉 솔란케', 'DOMINIC', 'SOLANKE', 'SOLANKE', '19', ['ST'], 'ENG', [S6, BLK, 'buzz', 'none', 1.04, 1.0], F(82, 80, 70, 70, 80, 60, 80), 'CLINICAL_FINISH', 'R', 160],
  ['boniface', 'Victor Boniface', '빅터 보니페이스', 'VICTOR', 'BONIFACE', 'BONIFACE', '14', ['ST'], 'NGA', [S7, BLK, 'buzz', 'none', 1.04, 1.08], F(88, 78, 70, 76, 78, 64, 78), 'POWER_FINISH', 'L', 210],
  ['retegui', 'Mateo Retegui', '마테오 레테기', 'MATEO', 'RETEGUI', 'RETEGUI', '32', ['ST'], 'ITA', [S2, DRK, 'short', 'stubble', 1.04, 1.02], F(86, 84, 68, 74, 82, 62, 82), 'CLINICAL_FINISH', 'R', 270],
  ['dovbyk', 'Artem Dovbyk', '아르템 도우비크', 'ARTEM', 'DOVBYK', 'DOVBYK', '11', ['ST'], 'UKR', [S1, BRN, 'short', 'stubble', 1.08, 1.04], F(86, 80, 66, 74, 78, 60, 78), 'POWER_FINISH', 'L', 145],
];

const ICONS10: Def[] = [
  ['aguero', 'Sergio Agüero', '세르히오 아구에로', 'SERGIO', 'AGÜERO', 'AGUERO', '10', ['ST'], 'ARG', [S3, BLK, 'short', 'none', 0.94, 1.0], F(90, 93, 80, 76, 94, 74, 92), 'CLINICAL_FINISH', 'R', 1150],
  ['bale', 'Gareth Bale', '가레스 베일', 'GARETH', 'BALE', 'BALE', '11', ['RW'], 'WAL', [S1, BRN, 'bun', 'full', 1.04, 1.0], F(94, 88, 92, 92, 84, 92, 88), 'KNUCKLE_DRIVE', 'L', 1250],
  ['hazard', 'Eden Hazard', '에덴 아자르', 'EDEN', 'HAZARD', 'HAZARD', '10', ['LW'], 'BEL', [S2, BRN, 'short', 'stubble', 0.92, 0.98], F(84, 88, 88, 70, 92, 80, 94), 'LOW_DISGUISE', 'R', 1150],
  ['ozil', 'Mesut Özil', '메수트 외질', 'MESUT', 'ÖZIL', 'OZIL', '10', ['CAM'], 'GER', [S3, BLK, 'swept', 'stubble', 1.0, 0.92], F(78, 90, 92, 68, 84, 88, 90), 'LEFT_FINESSE', 'L', 950],
  ['tevez', 'Carlos Tévez', '카를로스 테베스', 'CARLOS', 'TÉVEZ', 'TEVEZ', '32', ['ST'], 'ARG', [S3, BLK, 'short', 'none', 0.9, 1.04], F(88, 86, 80, 78, 88, 78, 88), 'POWER_FINISH', 'R', 900],
  ['yayatoure', 'Yaya Touré', '야야 투레', 'YAYA', 'TOURÉ', 'Y. TOURE', '42', ['CM'], 'CIV', [S7, BLK, 'bald', 'none', 1.08, 1.1], F(92, 88, 86, 88, 82, 90, 92), 'SET_PIECE_CONTROL', 'R', 1200],
  ['seedorf', 'Clarence Seedorf', '클라렌스 세이도르프', 'CLARENCE', 'SEEDORF', 'SEEDORF', '10', ['CM'], 'NED', [S6, BLK, 'buzz', 'none', 0.98, 1.02], F(88, 88, 84, 86, 80, 82, 92), 'CONTROLLED_DRIVE', 'R', 1050],
  ['ballack', 'Michael Ballack', '미하엘 발락', 'MICHAEL', 'BALLACK', 'BALLACK', '13', ['CM'], 'GER', [S1, BRN, 'short', 'none', 1.06, 1.04], F(92, 88, 80, 86, 80, 84, 92), 'POWER_BURST', 'R', 1100],
  ['forlan', 'Diego Forlán', '디에고 포를란', 'DIEGO', 'FORLÁN', 'FORLAN', '10', ['ST'], 'URU', [S2, BLD, 'swept', 'none', 1.0, 0.98], F(92, 88, 84, 92, 82, 88, 88), 'KNUCKLE_DRIVE', 'B', 850],
  ['vanpersie', 'Robin van Persie', '로빈 판 페르시', 'ROBIN', 'VAN PERSIE', 'VAN PERSIE', '20', ['ST'], 'NED', [S2, DRK, 'short', 'stubble', 1.02, 0.96], F(88, 92, 88, 80, 88, 84, 92), 'LEFT_FINESSE', 'L', 1000],
];

// ── UPDATE 11 — 32 new players: 2 PIPA ORIGINALS · 25 current · 5 ICONS (no defenders) ──
/** PIPA ORIGINAL players (fictional, as the game's creator specified — not real professionals) */
const ORIGINALS11: Def[] = [
  // UPDATE 11 patch: four more PIPA ORIGINALS
  ['jangyounggwang', 'Jang Young-gwang', '장영광', 'JANG', 'YOUNG-GWANG', 'JANG', '6', ['CDM'], 'KOR', [S1, BLK, 'short', 'none', 0.98, 1.0], F(43, 89, 83, 62, 90, 80, 84), 'TOE_POKE_SPECIALIST', 'R', 160],
  ['hanyujun', 'Han Yu-jun', '한유준', 'HAN', 'YU-JUN', 'HAN Y.J.', '4', ['CB'], 'KOR', [S1, BLK, 'buzz', 'none', 1.06, 1.08], F(34, 23, 28, 20, 25, 20, 40), 'DEFENSIVE_WALL', 'R', 45],
  ['leejusung', 'Lee Ju-sung', '이주성', 'LEE', 'JU-SUNG', 'LEE J.S.', '11', ['LW'], 'KOR', [S1, BLK, 'sidepart', 'none', 0.96, 0.92], F(55, 88, 98, 40, 89, 85, 84), 'ONE_FOOT_FINESSE', 'L', 270],
  ['kimgeunho', 'Kim Geun-ho', '김근호', 'KIM', 'GEUN-HO', 'KIM G.H.', '9', ['ST'], 'KOR', [S1, BLK, 'spiky', 'stubble', 1.04, 1.06], F(105, 76, 42, 98, 90, 70, 80), 'CHAOTIC_CANNON', 'R', 850],
  ['kimtaei', 'Kim Tae-i', '김태이', 'KIM', 'TAE-I', 'KIM T.Y.', '16', ['CM'], 'KOR', [S1, BLK, 'sidepart', 'none', 0.95, 0.9], F(63, 98, 90, 65, 95, 90, 96), 'PRECISION_MASTER', 'R', 180],
  ['kimdongmin', 'Kim Dong-min', '김동민', 'KIM', 'DONG-MIN', 'KIM D.M.', '9', ['ST'], 'KOR', [S1, BLK, 'spiky', 'none', 1.02, 1.04], F(98, 65, 95, 90, 81, 78, 76), 'OUTSIDE_POWER', 'R', 350],
];
const CURRENT11: Def[] = [
  ['grealish', 'Jack Grealish', '잭 그릴리시', 'JACK', 'GREALISH', 'GREALISH', '18', ['LW'], 'ENG', [S1, BRN, 'swept', 'stubble', 1.0, 0.98], F(78, 80, 82, 68, 80, 76, 84), 'QUICK_LOW_CURL', 'R', 170],
  ['trossard', 'Leandro Trossard', '레안드로 트로사르', 'LEANDRO', 'TROSSARD', 'TROSSARD', '19', ['LW'], 'BEL', [S2, BRN, 'short', 'stubble', 0.96, 0.94], F(80, 84, 84, 70, 82, 74, 82), 'TWO_FOOT_FINESSE', 'R', 120],
  ['ferrantorres', 'Ferran Torres', '페란 토레스', 'FERRAN', 'TORRES', 'FERRAN', '7', ['RW'], 'ESP', [S2, DRK, 'short', 'none', 1.0, 0.94], F(80, 84, 76, 68, 84, 64, 80), 'CLINICAL_FINISH', 'R', 180],
  ['ansufati', 'Ansu Fati', '안수 파티', 'ANSU', 'FATI', 'ANSU FATI', '31', ['LW'], 'ESP', [S5, BLK, 'buzz', 'none', 0.96, 0.92], F(78, 80, 76, 64, 82, 62, 76), 'LOW_DISGUISE', 'R', 60],
  ['malen', 'Donyell Malen', '도니얼 말런', 'DONYELL', 'MALEN', 'MALEN', '17', ['RW'], 'NED', [S6, BLK, 'buzz', 'none', 0.94, 0.94], F(84, 78, 74, 70, 82, 60, 76), 'POWER_BURST', 'R', 140],
  ['diaby', 'Moussa Diaby', '무사 디아비', 'MOUSSA', 'DIABY', 'DIABY', '10', ['RW'], 'FRA', [S7, BLK, 'buzz', 'none', 0.9, 0.88], F(80, 78, 80, 64, 84, 64, 76), 'LEFT_CURL', 'L', 150],
  ['brennanjohnson', 'Brennan Johnson', '브레넌 존슨', 'BRENNAN', 'JOHNSON', 'B. JOHNSON', '22', ['RW'], 'WAL', [S4, BLK, 'short', 'none', 0.98, 0.92], F(80, 80, 72, 66, 84, 60, 78), 'CLINICAL_FINISH', 'R', 100],
  ['nicogonzalez', 'Nicolás González', '니콜라스 곤살레스', 'NICOLÁS', 'GONZÁLEZ', 'N. GONZALEZ', '11', ['RW'], 'ARG', [S2, DRK, 'swept', 'stubble', 1.0, 0.98], F(82, 78, 80, 70, 78, 70, 78), 'LEFT_CURL', 'L', 130],
  ['correa', 'Ángel Correa', '앙헬 코레아', 'ÁNGEL', 'CORREA', 'CORREA', '10', ['CF'], 'ARG', [S3, BLK, 'short', 'none', 0.92, 0.9], F(78, 82, 80, 66, 84, 70, 80), 'LOW_DISGUISE', 'R', 90],
  ['depaul', 'Rodrigo De Paul', '로드리고 데 파울', 'RODRIGO', 'DE PAUL', 'DE PAUL', '5', ['CM'], 'ARG', [S2, BRN, 'swept', 'full', 0.98, 0.98], F(82, 80, 82, 78, 76, 80, 84), 'CONTROLLED_DRIVE', 'R', 180],
  ['locelso', 'Giovani Lo Celso', '지오바니 로셀소', 'GIOVANI', 'LO CELSO', 'LO CELSO', '20', ['CAM'], 'ARG', [S2, BRN, 'swept', 'stubble', 0.96, 0.9], F(76, 82, 86, 70, 78, 84, 82), 'LEFT_FINESSE', 'L', 70],
  ['nkunku', 'Christopher Nkunku', '크리스토퍼 은쿤쿠', 'CHRISTOPHER', 'NKUNKU', 'NKUNKU', '18', ['CAM', 'ST'], 'FRA', [S6, BLK, 'buzz', 'none', 0.96, 0.94], F(82, 84, 82, 70, 84, 76, 82), 'BALANCED_FINISH', 'R', 180],
  ['morata', 'Álvaro Morata', '알바로 모라타', 'ÁLVARO', 'MORATA', 'MORATA', '7', ['ST'], 'ESP', [S2, DRK, 'short', 'stubble', 1.08, 1.0], F(82, 80, 70, 72, 80, 60, 74), 'POWER_FINISH', 'R', 110],
  ['asensio', 'Marco Asensio', '마르코 아센시오', 'MARCO', 'ASENSIO', 'ASENSIO', '21', ['RW', 'CAM'], 'ESP', [S2, BRN, 'short', 'stubble', 1.0, 0.96], F(86, 80, 84, 80, 76, 82, 78), 'DRIVEN_CURVE', 'L', 140],
  ['pedrogoncalves', 'Pedro Gonçalves', '페드루 곤살베스', 'PEDRO', 'GONÇALVES', 'POTE', '8', ['CAM'], 'POR', [S2, DRK, 'short', 'none', 0.94, 0.92], F(80, 84, 84, 70, 82, 80, 82), 'TWO_FOOT_FINESSE', 'R', 160],
  ['isco', 'Isco', '이스코', 'FRANCISCO', 'ISCO', 'ISCO', '22', ['CAM'], 'ESP', [S2, DRK, 'short', 'full', 0.94, 0.98], F(76, 84, 84, 66, 82, 80, 88), 'SET_PIECE_CONTROL', 'R', 120],
  ['zaha', 'Wilfried Zaha', '윌프리드 자하', 'WILFRIED', 'ZAHA', 'ZAHA', '11', ['LW'], 'CIV', [S7, BLK, 'twists', 'none', 0.98, 0.98], F(80, 76, 74, 66, 82, 60, 74), 'POWER_BURST', 'R', 75],
  ['aubameyang', 'Pierre-Emerick Aubameyang', '피에르에메리크 오바메양', 'PIERRE-EMERICK', 'AUBAMEYANG', 'AUBAMEYANG', '10', ['ST'], 'GAB', [S6, BLK, 'buzz', 'stubble', 1.02, 0.96], F(84, 84, 70, 72, 86, 62, 82), 'CLINICAL_FINISH', 'R', 75],
  ['haller', 'Sébastien Haller', '세바스티앵 알레', 'SÉBASTIEN', 'HALLER', 'HALLER', '9', ['ST'], 'CIV', [S6, BLK, 'buzz', 'full', 1.1, 1.06], F(84, 80, 66, 74, 76, 58, 80), 'POWER_FINISH', 'R', 65],
  ['dimaria', 'Ángel Di María', '앙헬 디 마리아', 'ÁNGEL', 'DI MARÍA', 'DI MARIA', '11', ['RW'], 'ARG', [S2, BRN, 'curly', 'none', 0.98, 0.88], F(80, 86, 90, 74, 80, 86, 86), 'LEFT_FINESSE', 'L', 110],
  ['unaisimon', 'Unai Simón', '우나이 시몬', 'UNAI', 'SIMÓN', 'UNAI SIMON', '1', ['GK'], 'ESP', [S2, DRK, 'short', 'stubble', 1.06, 1.0], G(86, 84, 84, 86, 84, 84, 84), 'POSITION_MASTER', 'R', 180],
  ['ramsdale', 'Aaron Ramsdale', '에런 램스데일', 'AARON', 'RAMSDALE', 'RAMSDALE', '32', ['GK'], 'ENG', [S1, BRN, 'short', 'stubble', 1.04, 1.0], G(84, 82, 80, 78, 80, 80, 78), 'HIGH_REACH', 'R', 90],
  ['petrovic', 'Đorđe Petrović', '조르제 페트로비치', 'ĐORĐE', 'PETROVIĆ', 'PETROVIC', '1', ['GK'], 'SRB', [S1, DRK, 'short', 'none', 1.1, 1.02], G(82, 80, 84, 78, 80, 82, 76), 'LONG_REACH', 'R', 65],
  ['pope', 'Nick Pope', '닉 포프', 'NICK', 'POPE', 'POPE', '1', ['GK'], 'ENG', [S1, BRN, 'short', 'none', 1.08, 1.02], G(84, 80, 84, 84, 80, 84, 78), 'HIGH_REACH', 'R', 80],
  ['leno', 'Bernd Leno', '베른트 레노', 'BERND', 'LENO', 'LENO', '1', ['GK'], 'GER', [S1, BRN, 'short', 'stubble', 1.04, 0.98], G(84, 80, 80, 80, 82, 78, 78), 'LOW_SAVE', 'R', 65],
];
const ICONS11: Def[] = [
  ['puskas', 'Ferenc Puskás', '페렌츠 푸스카스', 'FERENC', 'PUSKÁS', 'PUSKAS', '10', ['ST'], 'HUN', [S2, BLK, 'swept', 'none', 0.96, 1.08], F(96, 92, 86, 88, 86, 84, 92), 'GALLOPING_CANNON', 'L', 1800],
  ['gerdmuller', 'Gerd Müller', '게르트 뮐러', 'GERD', 'MÜLLER', 'G. MULLER', '13', ['ST'], 'GER', [S1, DRK, 'short', 'none', 0.9, 1.06], F(88, 96, 74, 76, 96, 68, 96), 'BOX_BOMBER', 'R', 1450],
  ['zico', 'Zico', '지쿠', 'ARTHUR', 'ZICO', 'ZICO', '10', ['CAM'], 'BRA', [S2, BLK, 'curly', 'none', 0.94, 0.92], F(86, 92, 95, 82, 84, 98, 90), 'FREE_KICK_ARTIST', 'R', 1250],
  ['platini', 'Michel Platini', '미셸 플라티니', 'MICHEL', 'PLATINI', 'PLATINI', '10', ['CAM'], 'FRA', [S1, BRN, 'curly', 'none', 0.98, 0.96], F(86, 95, 94, 80, 84, 96, 94), 'MAESTRO_CURL', 'R', 1350],
  ['davidsilva', 'David Silva', '다비드 실바', 'DAVID', 'SILVA', 'D. SILVA', '21', ['CAM'], 'ESP', [S2, BLK, 'short', 'none', 0.9, 0.88], F(76, 92, 92, 66, 90, 84, 94), 'MAGIC_LEFT', 'L', 1050],
];

const row = (d: Def, legend: boolean): MarketRow => {
  const [id, name, nameKo, first, last, shirt, number, positions, country, look, ab, special, foot, priceM] = d;
  return { id, name, nameKo, first, last, shirt, number, positions, country, look, special, foot, price: priceM * M, legend, ...(isGk(ab) ? { gk: ab } : { stats: ab }) };
};

/** the 95 new market players (current + legends) */
export const MARKET_NEW: MarketRow[] = [...CURRENT.map((d) => row(d, false)), ...CURRENT8.map((d) => row(d, false)), ...ICONS8.map((d) => row(d, true)), ...CURRENT9.map((d) => row(d, false)), ...ICONS9.map((d) => row(d, true)), ...LEGENDS.map((d) => row(d, true)),
  // UPDATE 10
  ...ORIGINALS10.map((d) => row(d, d[0] === 'kimtaein')), ...CURRENT10.map((d) => row(d, false)), ...ICONS10.map((d) => row(d, true)),
  // UPDATE 11
  ...ORIGINALS11.map((d) => row(d, false)), ...CURRENT11.map((d) => row(d, false)), ...ICONS11.map((d) => row(d, true))];

/** UPDATE 4 players that move to the market (record already exists) — price only */
export const MARKET_EXISTING_PRICES: Record<string, number> = {
  debruyne: 800 * M,
  lewandowski: 650 * M,
  bruno: 420 * M,
  donnarumma: 500 * M,
  martinez: 450 * M,
};

/** the 15 free starter players (never sold) */
export const STARTER_IDS = [
  'mbappe', 'messi', 'ronaldo', 'neymar', 'yamal', 'son', 'kane', 'haaland', 'vinicius',
  'courtois', 'neuer', 'alisson', 'bellingham', 'rodri', 'salah',
] as const;

/** market listing order: the prompt's numbering 1–100 */
export const MARKET_ORDER: string[] = [
  'debruyne', 'lewandowski', 'bruno', 'donnarumma', 'martinez',
  ...CURRENT.map((d) => d[0]),
  ...LEGENDS.map((d) => d[0]),
  // UPDATE 8: 101–150
  ...CURRENT8.map((d) => d[0]),
  ...ICONS8.map((d) => d[0]),
  // UPDATE 9: 151–200
  ...CURRENT9.map((d) => d[0]),
  ...ICONS9.map((d) => d[0]),
  // UPDATE 10: 201–250 (PIPA ORIGINALS first)
  ...ORIGINALS10.map((d) => d[0]),
  ...CURRENT10.map((d) => d[0]),
  ...ICONS10.map((d) => d[0]),
  // UPDATE 11: 251–282
  ...ORIGINALS11.map((d) => d[0]),
  ...CURRENT11.map((d) => d[0]),
  ...ICONS11.map((d) => d[0]),
];

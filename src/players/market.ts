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
  | 'SUI' | 'CZE' | 'URS' | 'NIR' | 'CIV' | 'CMR';

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
  ['pele', 'Pelé', '펠레', 'EDSON', 'PELÉ', 'PELE', '10', ['ST', 'CAM'], 'BRA', [S7, BLK, 'buzz', 'none', 0.96, 1.0], F(94, 96, 92, 86, 94, 90, 97), 'BALANCED_FINISH', 'R', 2000],
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
  ['yashin', 'Lev Yashin', '레프 야신', 'LEV', 'YASHIN', 'YASHIN', '1', ['GK'], 'URS', [S1, DRK, 'short', 'none', 1, 1], G(99, 98, 92, 93, 93, 92, 90), 'LONG_REACH', 'R', 1700],
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

const row = (d: Def, legend: boolean): MarketRow => {
  const [id, name, nameKo, first, last, shirt, number, positions, country, look, ab, special, foot, priceM] = d;
  return { id, name, nameKo, first, last, shirt, number, positions, country, look, special, foot, price: priceM * M, legend, ...(isGk(ab) ? { gk: ab } : { stats: ab }) };
};

/** the 95 new market players (current + legends) */
export const MARKET_NEW: MarketRow[] = [...CURRENT.map((d) => row(d, false)), ...LEGENDS.map((d) => row(d, true))];

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
];

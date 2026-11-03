/**
 * UPDATE 8 — the ONE place where a current player's club lives (shown in PACK reveals).
 * A transfer = change one line here. ICON / LEGEND players have no club (they show ICON).
 * Clubs as of the 2025–26 season; text only — no club logos.
 */
export const CLUB: Record<string, string> = {
  // starters + UPDATE 4
  mbappe: 'REAL MADRID', messi: 'INTER MIAMI', ronaldo: 'AL NASSR', neymar: 'SANTOS', yamal: 'BARCELONA',
  son: 'LAFC', kane: 'BAYERN MUNICH', haaland: 'MANCHESTER CITY', vinicius: 'REAL MADRID', bellingham: 'REAL MADRID',
  rodri: 'MANCHESTER CITY', salah: 'LIVERPOOL', courtois: 'REAL MADRID', neuer: 'BAYERN MUNICH', alisson: 'LIVERPOOL',
  debruyne: 'NAPOLI', lewandowski: 'BARCELONA', bruno: 'MANCHESTER UNITED', donnarumma: 'MANCHESTER CITY', martinez: 'ASTON VILLA',
  // UPDATE 6 market
  modric: 'AC MILAN', pedri: 'BARCELONA', gavi: 'BARCELONA', musiala: 'BAYERN MUNICH', wirtz: 'LIVERPOOL',
  saka: 'ARSENAL', foden: 'MANCHESTER CITY', palmer: 'CHELSEA', valverde: 'REAL MADRID', rice: 'ARSENAL',
  odegaard: 'ARSENAL', bernardo: 'MANCHESTER CITY', leao: 'AC MILAN', lautaro: 'INTER', osimhen: 'GALATASARAY',
  isak: 'LIVERPOOL', alvarez: 'ATLÉTICO MADRID', griezmann: 'ATLÉTICO MADRID', dembele: 'PARIS SAINT-GERMAIN',
  kvaratskhelia: 'PARIS SAINT-GERMAIN', rodrygo: 'REAL MADRID', endrick: 'REAL MADRID', felix: 'AL NASSR', dybala: 'ROMA',
  sane: 'GALATASARAY', coman: 'AL NASSR', diaz: 'BAYERN MUNICH', nunez: 'AL HILAL', gakpo: 'LIVERPOOL',
  rashford: 'BARCELONA', garnacho: 'CHELSEA', hojlund: 'NAPOLI', nicowilliams: 'ATHLETIC CLUB', olmo: 'BARCELONA',
  dejong: 'BARCELONA', kimmich: 'BAYERN MUNICH', goretzka: 'BAYERN MUNICH', gundogan: 'GALATASARAY', macallister: 'LIVERPOOL',
  enzo: 'CHELSEA', caicedo: 'CHELSEA', szoboszlai: 'LIVERPOOL', simons: 'TOTTENHAM', neves: 'PARIS SAINT-GERMAIN',
  vitinha: 'PARIS SAINT-GERMAIN', hakimi: 'PARIS SAINT-GERMAIN', alexanderarnold: 'REAL MADRID', davies: 'BAYERN MUNICH',
  theo: 'AL HILAL', saliba: 'ARSENAL', vandijk: 'LIVERPOOL', rudiger: 'REAL MADRID', dias: 'MANCHESTER CITY',
  marquinhos: 'PARIS SAINT-GERMAIN', ederson: 'FENERBAHÇE', maignan: 'AC MILAN', oblak: 'ATLÉTICO MADRID',
  terstegen: 'BARCELONA', raya: 'ARSENAL', kobel: 'BORUSSIA DORTMUND',
  // UPDATE 8
  gyokeres: 'ARSENAL', sesko: 'MANCHESTER UNITED', watkins: 'ASTON VILLA', vlahovic: 'JUVENTUS', jdavid: 'JUVENTUS',
  lookman: 'ATALANTA', raphinha: 'BARCELONA', olise: 'BAYERN MUNICH', doue: 'PARIS SAINT-GERMAIN', barcola: 'PARIS SAINT-GERMAIN',
  yildiz: 'JUVENTUS', guler: 'REAL MADRID', kubo: 'REAL SOCIEDAD', mitoma: 'BRIGHTON', leekangin: 'PARIS SAINT-GERMAIN',
  kimminjae: 'BAYERN MUNICH', hwangheechan: 'WOLVES', chiesa: 'LIVERPOOL', eze: 'ARSENAL', cunha: 'MANCHESTER UNITED',
  guirassy: 'BORUSSIA DORTMUND', frimpong: 'LIVERPOOL', balde: 'BARCELONA', bastoni: 'INTER', araujo: 'BARCELONA',
  gvardiol: 'MANCHESTER CITY', gabriel: 'ARSENAL', diogocosta: 'PORTO', szczesny: 'BARCELONA', mamardashvili: 'LIVERPOOL',
  heoshin: 'LIVERPOOL',
};

/**
 * The one position shown in a PACK reveal (a player with ST/LW shows only ST).
 * Default = the first listed position; overrides only where that would be wrong.
 */
export const PRIMARY_POSITION: Record<string, string> = {};

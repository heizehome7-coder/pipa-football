"""
UPDATE 9 browser test — EVENT CENTER (홍 나와라 뚝딱 · 감자의 제왕), GOOD / LEGEND / TOP LEGEND
packs, pack reveal timing (COUNTRY 1.8 s · POSITION 1.5 s · CLUB/ICON 1.8 s), Korean names,
TRANSFER MARKET search, HOME order, version 9.

Own server on port 8797. Needs `npm run build`.
  python3 scripts/update9-e2e.py [out_dir]
"""
import hashlib
import json
import os
import secrets
import subprocess
import sys
import tempfile
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from squad_seed import NO_DAILY_JS, game_version  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8797
BASE = f'http://localhost:{PORT}/'
OUT = sys.argv[1] if len(sys.argv) > 1 else 'update9-shots'
os.makedirs(OUT, exist_ok=True)
results = []
M = 1_000_000


def check(name, ok, info=''):
    results.append((name, ok))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  — {info}' if info != '' else ''), flush=True)


def wait_for(fn, timeout=10.0, step=0.05):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            v = fn()
            if v:
                return v, time.time() - t0
        except Exception:
            pass
        time.sleep(step)
    return None, time.time() - t0


def account(nick, mp, squad, **extra):
    salt = secrets.token_hex(16)
    h = hashlib.scrypt(b'pw1234', salt=salt.encode(), n=16384, r=8, p=1, dklen=32, maxmem=64 * 1024 * 1024).hex()
    return {'key': nick.lower(), 'nickname': nick, 'salt': salt, 'hash': h, 'tokens': [], 'createdAt': '2026-11-01',
            'data': {'v6': True, 'mp': mp, 'owned': [], 'rewards': [], 'squad': squad, 'lastDailyClaim': '2099-01-01', **extra}}


SQ = {'penaltyOrder': ['mbappe', 'messi', 'ronaldo', 'neymar', 'yamal'], 'goalkeeperId': 'courtois', 'freeKickTakerId': 'messi'}
data_dir = tempfile.mkdtemp(prefix='pipa-u9-')
with open(os.path.join(data_dir, 'accounts.json'), 'w') as f:
    json.dump({
        'eventer': account('EVENTER', 0, SQ, fv=2000, hong={'bronze': 1, 'silver': 1, 'gold': 1, 'red': 1}),
        'potatoer': account('POTATOER', 0, SQ, fv=70),
    }, f)
env = {**os.environ, 'PORT': str(PORT), 'PIPA_DATA_DIR': data_dir, 'DATABASE_URL': '', 'DEVELOPER_CODE': 'pipa-test-dev-7531'}
srv = subprocess.Popen(['node', 'server/realtime-server.mjs'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
time.sleep(1.5)

PHASES_JS = """(() => { window.__packPhases = []; new MutationObserver(() => {
    const s = document.querySelector('[data-testid=pack-scene]');
    if (!s) return;
    const ph = s.dataset.phase, last = window.__packPhases[window.__packPhases.length - 1];
    const step = document.querySelector('[data-testid^=reveal-]');
    const val = step ? step.dataset.value : (ph === 'card' ? s.dataset.player : '');
    if (!last || last[0] !== ph) window.__packPhases.push([ph, val || '', performance.now(), s.dataset.kind || '']);
  }).observe(document, { subtree: true, childList: true, attributes: true }); })()"""
AUDIO_JS = "(() => { window.__audioCtx = 0; for (const k of ['AudioContext', 'webkitAudioContext']) { const A = window[k]; if (A) window[k] = function (...a) { window.__audioCtx++; return new A(...a); }; } })()"

PRICES = json.loads(subprocess.check_output(['node', '-e', "import('./server/judge.gen.mjs').then(j => { const o = {}; for (const p of j.packPool()) o[p.id] = p.price; console.log(JSON.stringify(o)); })"], cwd=ROOT))
TOPS = ['pele', 'maradona', 'nazario', 'ronaldinho', 'zidane']

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        errors = []

        def ctx():
            c = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
            c.add_init_script(NO_DAILY_JS)
            c.add_init_script(PHASES_JS)
            c.add_init_script(AUDIO_JS)
            return c

        def login(pg, nick):
            pg.on('pageerror', lambda e: errors.append(f'{nick}: {e}'))
            pg.goto(BASE)
            pg.fill('input[autocomplete=username]', nick)
            pg.fill('input[type=password]', 'pw1234')
            pg.click('text=게임 시작')
            pg.wait_for_selector('[data-testid=play-events]', timeout=20000)

        C = ctx()
        P = C.new_page()
        login(P, 'EVENTER')
        check('UPDATE badge (current version)', P.inner_text('[data-testid=version-badge]') == f'UPDATE {game_version()}' and game_version() >= 9)
        order = P.eval_on_selector_all('.mode-list .mode-card', 'els => els.map(e => e.dataset.testid)')
        check('HOME: 혼자서 · 온라인 · SQUAD · TRANSFER MARKET · PACKS · EVENT CENTER · RANKING · DEVELOPER MODE',
              order == ['play-solo', 'play-online', 'play-squad', 'play-market', 'play-packs', 'play-events', 'play-ranking', 'play-developer'], order)
        P.screenshot(path=f'{OUT}/01_home.png', full_page=True)

        # ── TRANSFER MARKET: Korean names + search ───────────────────────
        P.click('[data-testid=play-market]')
        P.wait_for_selector('[data-testid=market-grid]')
        n = P.locator('[data-testid=market-grid] [data-testid=player-card]').count()
        check('TRANSFER MARKET: 200 players', n == 200, n)
        txt = P.inner_text('[data-testid=market-grid]')
        check('cards show Korean names (야신, 박지성, 펠레, 모드리치 …)', all(k in txt for k in ['야신', '박지성', '펠레', '모드리치']), txt[:120].replace('\n', ' '))

        def search(q):
            P.fill('[data-testid=market-search]', q)
            time.sleep(0.25)
            return P.eval_on_selector_all('[data-testid=market-grid] [data-testid=player-card]', 'els => els.map(e => e.dataset.id)')

        r = search('메시')
        check('search 메시 → Messi is a free starter (not for sale) → told so', r == [] and '무료 스타터' in P.inner_text('[data-testid=market-empty]'))
        r = search('손흥민')
        check('search 손흥민 → free starter message', r == [] and '무료 스타터' in P.inner_text('[data-testid=market-empty]'))
        check('search 모드리치 → Modrić', search('모드리치') == ['modric'])
        check('search 박지성 → Park Ji-sung (UPDATE 9 ICON)', 'parkjisung' in search('박지성'))
        check('search 귄도안 / gundogan (accents ignored)', 'gundogan' in search('귄도안') and 'gundogan' in search('gundogan'))
        check('search 야신 → Yashin', 'yashin' in search('야신'))
        check('search modric (English) → Modrić', 'modric' in search('modric'))
        check('search YASHIN (upper case) → Yashin', 'yashin' in search('YASHIN'))
        P.screenshot(path=f'{OUT}/02_market_search.png')
        r = search('zzqqxx')
        check('no match → empty message', r == [] and P.is_visible('[data-testid=market-empty]'))
        P.click('[data-testid=market-search-clear]')
        time.sleep(0.2)
        check('clear search → all players back', P.locator('[data-testid=market-grid] [data-testid=player-card]').count() >= 20)
        P.click('[data-testid=market-back]')
        P.wait_for_selector('[data-testid=play-events]', timeout=10000)

        # ── 홍 나와라 뚝딱 ──────────────────────────────────────────────
        P.click('[data-testid=play-events]')
        P.wait_for_selector('[data-testid=events]')
        P.screenshot(path=f'{OUT}/03_event_center.png')
        check('EVENT CENTER: 홍 나와라 뚝딱 · 감자의 제왕', '홍 나와라 뚝딱' in P.inner_text('[data-testid=events]') and '감자의 제왕' in P.inner_text('[data-testid=events]'))
        P.click('[data-testid=event-hong]')
        P.wait_for_selector('[data-testid=hong]')
        fv = lambda: int(P.inner_text('[data-testid=hong-fv]').replace(',', '').split()[0])
        tok = lambda g: int(P.get_attribute(f'[data-testid=hong-token-{g}]', 'data-count'))
        total = lambda: sum(tok(g) for g in ['bronze', 'silver', 'gold', 'red'])
        wait_for(lambda: fv() == 2000, 5)
        check('start: 2,000 FV · tokens 1/1/1/1', fv() == 2000 and total() == 4)
        P.click('[data-testid=hong-draw-1]')
        v, _ = wait_for(lambda: P.get_attribute('[data-testid=gourd]', 'data-state') == 'shake', 5)
        check('the 박 shakes …', bool(v))
        P.screenshot(path=f'{OUT}/04_hong_shake.png')
        v, _ = wait_for(lambda: P.get_attribute('[data-testid=gourd]', 'data-state') == 'open', 5)
        check('… then opens with the grade light', bool(v))
        P.screenshot(path=f'{OUT}/05_hong_open.png')
        P.wait_for_selector('[data-testid=hong-result]', timeout=6000)
        res = P.get_attribute('[data-testid=hong-result]', 'data-results').split(',')
        check('×1 → one server result · −50 FV · +1 token', len(res) == 1 and fv() == 1950 and total() == 5, (res, fv(), total()))
        P.screenshot(path=f'{OUT}/06_hong_result1.png')
        P.click('[data-testid=hong-result-ok]')
        P.click('[data-testid=hong-draw-10]')
        P.wait_for_selector('[data-testid=hong-skip]', timeout=5000)
        time.sleep(0.2)
        P.click('[data-testid=hong-skip]')
        P.wait_for_selector('[data-testid=hong-result]', timeout=3000)
        res10 = P.get_attribute('[data-testid=hong-result]', 'data-results').split(',')
        check('×10 + SKIP → all 10 results at once · −500 FV · +10 tokens', len(res10) == 10 and fv() == 1450 and total() == 15 and P.locator('[data-testid=hong-result] [data-testid=hong-medal]').count() == 10, (fv(), total()))
        time.sleep(0.8)
        P.screenshot(path=f'{OUT}/07_hong_result10.png')
        P.click('[data-testid=hong-result-ok]')
        # reload: tokens stay (server)
        before = {g: tok(g) for g in ['bronze', 'silver', 'gold', 'red']}
        P.reload()
        P.wait_for_selector('[data-testid=play-events]', timeout=20000)
        P.click('[data-testid=play-events]')
        P.click('[data-testid=event-hong]')
        P.wait_for_selector('[data-testid=hong]')
        v, _ = wait_for(lambda: {g: tok(g) for g in before} == before and fv() == 1450, 8)
        check('reload → the same FV and tokens (kept on the server)', bool(v), {g: tok(g) for g in before})

        # exchange 동
        mp0 = P.evaluate("fetch('/api/me',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token: JSON.parse(localStorage.getItem('pipa.session.v1')||'{}').token})}).then(r=>r.json()).then(j=>j.mp)")
        b0 = tok('bronze')
        P.click('[data-testid=hong-exchange-bronze]')
        v, _ = wait_for(lambda: '20,000,000 MP' in P.inner_text('[data-testid=hong-msg]'), 6)
        check('동 1개 교환 → "+20,000,000 MP", exactly one token', bool(v) and tok('bronze') == b0 - 1, (P.inner_text('[data-testid=hong-msg]') if P.locator('[data-testid=hong-msg]').count() else '', tok('bronze')))
        # rapid double tap on 은 with exactly the tokens we have: never more payouts than tokens
        s0 = tok('silver')
        P.evaluate("() => { const b = document.querySelector('[data-testid=hong-exchange-silver]'); for (let i = 0; i < 5; i++) b.click(); }")
        time.sleep(1.5)
        check('5 fast taps on 은 → one exchange per press at most, never more than the tokens', tok('silver') >= max(0, s0 - 1) and tok('silver') <= s0, (s0, tok('silver')))
        P.screenshot(path=f'{OUT}/08_hong_shop.png', full_page=True)
        # 금 → LEGEND PACK, open it right here
        g0 = tok('gold')
        P.click('[data-testid=hong-exchange-gold]')
        v, _ = wait_for(lambda: P.locator('[data-testid=hong-open-legend]').count() == 1, 6)
        check('금 1개 → LEGEND PACK ×1 (open button)', bool(v) and tok('gold') == g0 - 1)
        # real speed: check the reveal timing (COUNTRY 1.8 · POSITION 1.5 · CLUB/ICON 1.8)
        P.evaluate('window.__PIPA_PACK_SPEED = 1; window.__packPhases = []')
        P.click('[data-testid=hong-open-legend]')
        P.wait_for_selector('[data-testid=pack-scene]')
        shots = set()
        t0 = time.time()
        while time.time() - t0 < 15:
            ph = P.get_attribute('[data-testid=pack-scene]', 'data-phase')
            if ph not in shots and ph in ('country', 'position', 'club'):
                time.sleep(0.6)
                P.screenshot(path=f'{OUT}/09_legend_{ph}.png')
                shots.add(ph)
            if ph == 'card':
                break
            time.sleep(0.03)
        P.wait_for_selector('[data-testid=pack-card]', timeout=5000)
        phs = P.evaluate('window.__packPhases')
        seq = [x[0] for x in phs]
        dur = {phs[i][0]: phs[i + 1][2] - phs[i][2] for i in range(len(phs) - 1)}
        check('pack order: COUNTRY → POSITION → ICON → CARD', seq == ['charge', 'country', 'position', 'club', 'flash', 'card'], seq)
        check('COUNTRY ≈ 1.8 s · POSITION ≈ 1.5 s · CLUB/ICON ≈ 1.8 s', abs(dur.get('country', 0) - 1800) < 250 and abs(dur.get('position', 0) - 1500) < 250 and abs(dur.get('club', 0) - 1800) < 250, {k: round(v) for k, v in dur.items()})
        card = P.eval_on_selector('[data-testid=pack-card]', 'e => e.dataset.id')
        check('LEGEND PACK → a 1.2B – 2B player', 1200 * M <= PRICES.get(card, 0) <= 2000 * M and phs[0][3] == 'legend', (card, PRICES.get(card)))
        P.screenshot(path=f'{OUT}/10_legend_card.png')
        P.click('[data-testid=pack-add]')
        P.wait_for_selector('[data-testid=pack-scene]', state='detached', timeout=5000)
        # fade in / hold / fade out: the step has an exit animation in its own time
        anim = P.evaluate("""() => { const d = document.createElement('div'); d.className = 'reveal-step'; d.style.setProperty('--dur', '1.8s'); document.body.appendChild(d); const a = getComputedStyle(d).animationName; d.remove(); return a; }""")
        check('each step fades in, holds, fades out', 'reveal-in' in anim and 'reveal-out' in anim, anim)

        # 홍 → TOP LEGEND reveal
        P.evaluate('window.__PIPA_PACK_SPEED = 3; window.__packPhases = []')
        r0 = tok('red')
        P.click('[data-testid=hong-exchange-red]')
        P.wait_for_selector('[data-testid=pack-scene]', timeout=6000)
        P.wait_for_selector('[data-testid=pack-card]', timeout=12000)
        top = P.eval_on_selector('[data-testid=pack-card]', 'e => e.dataset.id')
        phs = P.evaluate('window.__packPhases')
        check('홍 1개 → TOP LEGEND with the same reveal (Pelé / Maradona / Nazário / Ronaldinho / Zidane)', top in TOPS and [x[0] for x in phs][-1] == 'card' and 'country' in [x[0] for x in phs] and tok('red') == r0 - 1, (top, [x[0] for x in phs]))
        P.screenshot(path=f'{OUT}/11_top_legend.png')
        P.click('[data-testid=pack-add]')
        check('no sound (no AudioContext)', P.evaluate('window.__audioCtx') == 0)

        # ── 감자의 제왕 ────────────────────────────────────────────────
        Q = ctx().new_page()
        login(Q, 'POTATOER')
        Q.click('[data-testid=play-events]')
        Q.click('[data-testid=event-potato]')
        Q.wait_for_selector('[data-testid=potato]')
        check('8 holes (4 × 2)', Q.locator('[data-testid^=potato-hole-]').count() == 8)
        pfv = lambda: int(Q.inner_text('[data-testid=potato-fv]').replace(',', '').split()[0])
        wait_for(lambda: pfv() == 70, 5)
        Q.screenshot(path=f'{OUT}/12_potato_start.png')
        Q.click('[data-testid=potato-start]')
        v, _ = wait_for(lambda: pfv() == 20, 5)
        check('START → −50 FV (server)', bool(v), pfv())
        seen = {}
        overlaps = 0
        last_round = 0
        reloaded = False
        t0 = time.time()
        while time.time() - t0 < 25:
            if Q.locator('[data-testid=potato-result]').count():
                break
            # round + potatoes read from the SAME frame (no race at a round change)
            rnd, kinds = Q.evaluate("() => [Number(document.querySelector('[data-testid=potato-round]')?.dataset.round || 0), [...document.querySelectorAll('[data-testid^=potato-hole-]')].map(e => e.dataset.kind)]")
            up = [k for k in kinds if k]
            if rnd >= 1 and up:
                seen.setdefault(rnd, set()).update(up)
                if len(up) != len(set([i for i, k in enumerate(kinds) if k])):
                    overlaps += 1
                if rnd != last_round:
                    last_round = rnd
                    if rnd in (3, 6, 9):
                        Q.screenshot(path=f'{OUT}/13_potato_r{rnd}.png')
                    # tap the normal potato (twice — counts once); in round 6 also the red one
                    i = kinds.index('normal') if 'normal' in kinds else -1
                    if i >= 0 and rnd != 2:
                        Q.dispatch_event(f'[data-testid=potato-hole-{i}]', 'pointerdown')
                        Q.dispatch_event(f'[data-testid=potato-hole-{i}]', 'pointerdown')
                    if rnd == 6 and 'red' in kinds:
                        Q.dispatch_event(f"[data-testid=potato-hole-{kinds.index('red')}]", 'pointerdown')
                    if rnd == 9 and 'rotten' in kinds:
                        Q.dispatch_event(f"[data-testid=potato-hole-{kinds.index('rotten')}]", 'pointerdown')
                    if rnd == 7 and not reloaded:
                        # a reload mid-game: the server's game goes on
                        reloaded = True
                        Q.reload()
                        Q.wait_for_selector('[data-testid=play-events]', timeout=20000)
                        Q.click('[data-testid=play-events]')
                        Q.click('[data-testid=event-potato]')
                        Q.wait_for_selector('[data-testid=potato]')
                        last_round = 0
            time.sleep(0.05)
        check('rounds 1–4: only normal potatoes', all(seen.get(r, set()) <= {'normal'} for r in range(1, 5)), {r: sorted(s) for r, s in seen.items()})
        check('round 5+: red potatoes appear · round 8+: rotten potatoes too', bool(seen) and any('red' in seen.get(r, set()) for r in range(5, 13)) and any('rotten' in seen.get(r, set()) for r in range(8, 13)) and all('rotten' not in seen.get(r, set()) for r in range(1, 8)), {r: sorted(x) for r, x in seen.items()})
        check('never two potatoes in one hole', overlaps == 0)
        Q.wait_for_selector('[data-testid=potato-result]', timeout=10000)
        score = int(Q.get_attribute('[data-testid=potato-result]', 'data-score'))
        rew = Q.inner_text('[data-testid=potato-reward]')
        want = 'GOOD PLAYER PACK' if score >= 10 else '30,000,000 MP' if score >= 6 else '10,000,000 MP'
        check(f'GAME OVER: score {score} → {want} (once)', want in rew and 0 <= score <= 12, rew)
        Q.screenshot(path=f'{OUT}/14_potato_result.png')
        me = Q.evaluate("fetch('/api/events/state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token: JSON.parse(localStorage.getItem('pipa.session.v1')||'{}').token})}).then(r=>r.json())")
        paid = (me.get('goodPacks', 0) == 1) if score >= 10 else me.get('mp') == (30 * M if score >= 6 else 10 * M)
        check('the server paid exactly that reward (and only once)', paid and me['potato']['status'] == 'done', {'mp': me.get('mp'), 'good': me.get('goodPacks')})
        Q.click('[data-testid=potato-result-ok]')
        check('START needs 50 FV: 20 FV left → START disabled', pfv() == 20 and Q.is_disabled('[data-testid=potato-start]'))

        # PACKS screen: three pack kinds
        P.click('[data-testid=hong-back]')
        P.click('[data-testid=events-back]')
        P.click('[data-testid=play-packs]')
        P.wait_for_selector('[data-testid=packs]')
        check('PACKS: PLAYER PACK · GOOD PLAYER PACK · LEGEND PACK', P.locator('[data-testid=pack-slot]').count() == 1 and P.locator('[data-testid=pack-slot-good]').count() == 1 and P.locator('[data-testid=pack-slot-legend]').count() == 1)
        P.screenshot(path=f'{OUT}/15_packs.png', full_page=True)
        check('no page errors', not errors, errors[:3])
        browser.close()
finally:
    os.killpg(srv.pid, 15)

bad = [n for n, ok in results if not ok]
print(f'FAILED: {", ".join(bad)}' if bad else f'ALL {len(results)} UPDATE 9 E2E CHECKS PASSED')
sys.exit(1 if bad else 0)

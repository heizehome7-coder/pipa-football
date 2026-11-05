"""
UPDATE 10 browser test — HOME order + UPDATE 10 / SEASON 1 badges, season reset (online records
only), 진화 재료 상점 (MP · FV), EVOLUTION (rate shown, result, "+N" on the card, in the squad),
WEEKLY MISSIONS claim, MATCH STATISTICS (tabs + search), market without defenders, defenders
can't be listed, online EMOTES on both phones (+ hide the opponent's), random wall heights the
same on both phones in an online free kick.

Own server on port 8798. Needs `npm run build`.
  python3 scripts/update10-e2e.py [out_dir]
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
PORT = 8798
BASE = f'http://localhost:{PORT}/'
OUT = sys.argv[1] if len(sys.argv) > 1 else 'update10-shots'
os.makedirs(OUT, exist_ok=True)
results = []


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
    return {'key': nick.lower(), 'nickname': nick, 'salt': salt, 'hash': h, 'tokens': [], 'createdAt': '2026-10-01',
            'data': {'v6': True, 'mp': mp, 'owned': [], 'rewards': [], 'squad': squad, 'lastDailyClaim': '2099-01-01', **extra}}


def stats(pw, pl, fw=0, fl=0):
    return {'penalty': {'wins': pw, 'losses': pl, 'draws': 0}, 'freekick': {'wins': fw, 'losses': fl, 'draws': 0}}


PROFILE_JS = "async (n) => (await fetch('/api/profile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: n }) })).json()"
WEEK = subprocess.check_output(['npx', 'tsx', '-e', "import { weekKey } from './src/progress/missions'; console.log(weekKey(Date.now()))"], cwd=ROOT).decode().strip()
SQ = {'penaltyOrder': ['mbappe', 'messi', 'ronaldo', 'neymar', 'yamal'], 'goalkeeperId': 'courtois', 'freeKickTakerId': 'messi'}
data_dir = tempfile.mkdtemp(prefix='pipa-u10-')
with open(os.path.join(data_dir, 'accounts.json'), 'w') as f:
    json.dump({
        # SEASON 0 accounts (no `season` yet): records 7-2 / 4-1 must restart at 0, nothing else
        'evo': account('EVO', 2_000_000_000, SQ, fv=2500, owned=['vanpersie', 'saliba'], level=12, xp=40, stats=stats(7, 2, 4, 1),
                       weekly={'week': WEEK, 'progress': {'perfect': 0, 'playtime': 0, 'online3': 1, 'goals10': 10, 'fkwin': 0}, 'claimed': [], 'lastPlay': 0}),
        'stata': account('STATA', 0, SQ, season=1, stats=stats(3, 1, 2, 2)),
        'statb': account('STATB', 0, SQ, season=1, stats=stats(1, 4)),
        'gka': account('GKA', 0, SQ),
        'gkb': account('GKB', 0, SQ),
    }, f)
env = {**os.environ, 'PORT': str(PORT), 'PIPA_DATA_DIR': data_dir, 'DATABASE_URL': '', 'DEVELOPER_CODE': 'pipa-test-dev-7531'}
srv = subprocess.Popen(['node', 'server/realtime-server.mjs'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
time.sleep(1.5)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'])
        errors = []

        def ctx(dpr=2):
            c = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=dpr)
            c.add_init_script(NO_DAILY_JS)
            return c

        def login(pg, nick):
            pg.on('pageerror', lambda e: errors.append(f'{nick}: {e}'))
            pg.goto(BASE)
            pg.fill('input[autocomplete=username]', nick)
            pg.fill('input[type=password]', 'pw1234')
            pg.click('text=게임 시작')
            pg.wait_for_selector('[data-testid=play-events]', timeout=20000)

        P = ctx().new_page()
        login(P, 'EVO')
        order = P.eval_on_selector_all('.mode-list .mode-card', 'els => els.map(e => e.dataset.testid)')
        want = ['play-solo', 'play-online', 'play-squad', 'play-market', 'play-evolution', 'play-shop', 'play-packs', 'play-events', 'play-missions', 'play-ranking', 'play-stats', 'play-developer']
        check('HOME order: 혼자서 · 온라인 · SQUAD · MARKET · EVOLUTION · 진화 재료 상점 · PACKS · EVENT · WEEKLY MISSIONS · RANKING · MATCH STATISTICS · DEVELOPER', order == want, order)
        check('UPDATE 10 badge', P.inner_text('[data-testid=version-badge]') == 'UPDATE 10' and game_version() == 10, P.inner_text('[data-testid=version-badge]'))
        check('SEASON 1 badge (separate from the update number)', P.inner_text('[data-testid=season-badge]').strip() == 'SEASON 1', P.inner_text('[data-testid=season-badge]'))
        P.screenshot(path=f'{OUT}/01_home.png', full_page=True)

        # ── season: online records 0, everything else kept ────────────
        prof = P.evaluate(PROFILE_JS, 'EVO')
        st = (prof.get('profile') or {}).get('stats') or {}
        check('SEASON 1: last season’s 7-2 / 4-1 records restart at 0 …', st.get('penalty', {}).get('wins') == 0 and st.get('freekick', {}).get('wins') == 0, st)
        check('… MP · FV · level kept', (prof.get('profile') or {}).get('mp') == 2_000_000_000 and (prof.get('profile') or {}).get('fv') == 2500 and (prof.get('profile') or {}).get('level') == 12, prof.get('profile'))

        # ── market: no defenders, defenders can't be listed ───────────
        P.click('[data-testid=play-market]')
        P.wait_for_selector('[data-testid=market-grid]')
        n = P.locator('[data-testid=market-grid] [data-testid=player-card]').count()
        P.fill('[data-testid=market-search]', '살리바')
        time.sleep(0.3)
        check('market: 215 players, a defender (살리바) is not for sale', n == 215 and P.locator('[data-testid=market-grid] [data-testid=player-card]').count() == 0, n)
        P.fill('[data-testid=market-search]', '박사하')
        time.sleep(0.3)
        card = P.locator('[data-testid=market-grid] [data-testid=player-card]')
        check('new PIPA ORIGINAL 박사하 on sale with the ORIGINAL tag', card.count() == 1 and 'PIPA ORIGINAL' in card.inner_text(), card.count())
        P.screenshot(path=f'{OUT}/02_market_original.png')
        P.click('[data-testid=market-tab-mine]')
        P.wait_for_selector('[data-testid=my-players]')
        check('MY PLAYERS: the owned defender stays, but "판매 불가 · 수비수"', P.locator('[data-testid=sell-defender]').count() == 1)
        P.click('[data-testid=market-back]')

        # ── 진화 재료 상점 ─────────────────────────────────────────────
        P.click('[data-testid=play-shop]')
        P.wait_for_selector('[data-testid=evo-shop]')
        P.click('[data-testid=shop-buy-mp-150]')
        v, _ = wait_for(lambda: P.get_attribute('[data-testid=shop-have-150]', 'data-count') == '1', 8)
        check('buy OVR 150 with 900,000,000 MP', bool(v) and '구매 완료' in P.inner_text('[data-testid=shop-msg]'))
        P.click('[data-testid=shop-buy-mp-150]')
        wait_for(lambda: P.get_attribute('[data-testid=shop-have-150]', 'data-count') == '2', 8)
        P.click('[data-testid=shop-buy-fv-150]')
        v, _ = wait_for(lambda: P.get_attribute('[data-testid=shop-have-150]', 'data-count') == '3', 8)
        check('…and once with 2,200 FV (one currency per purchase)', bool(v))
        check('not enough MP / FV → the button is off', P.is_disabled('[data-testid=shop-buy-mp-150]') and P.is_disabled('[data-testid=shop-buy-fv-150]'))
        check('materials are shown as UNTRADEABLE cards', P.locator('[data-testid=mat-card]').count() >= 5 and 'UNTRADEABLE' in P.inner_text('[data-testid=evo-shop]'))
        P.screenshot(path=f'{OUT}/03_shop.png', full_page=True)

        # ── EVOLUTION ─────────────────────────────────────────────────
        P.click('[data-testid=shop-to-evo]')
        P.wait_for_selector('[data-testid=evolution]')
        P.fill('[data-testid=evo-search]', '페르시')
        time.sleep(0.3)
        P.click('[data-testid=evo-grid] [data-testid=player-card]')
        P.wait_for_selector('[data-testid=evo-detail]')
        P.click('[data-testid=evo-slot-150]')
        rate = float(P.get_attribute('[data-testid=evo-rate]', 'data-rate') or 0)
        check('+0 → +1 with OVR 150 shows the capped 95 % rate', abs(rate - 0.95) < 1e-9, rate)
        P.screenshot(path=f'{OUT}/04_evolution_detail.png')
        level = 0
        tries = 0
        while level == 0 and tries < 3:
            P.click('[data-testid=evo-go]')
            P.wait_for_selector('[data-testid=evo-result]', timeout=8000)
            tries += 1
            if P.get_attribute('[data-testid=evo-result]', 'data-success') == '1':
                level = 1
                P.screenshot(path=f'{OUT}/05_evolution_success.png')
            P.click('[data-testid=evo-result-ok]')
            if level == 0 and P.locator('[data-testid=evo-detail]').count() == 0:
                P.click('[data-testid=evo-grid] [data-testid=player-card]')
                P.click('[data-testid=evo-slot-150]')
        check('evolution result shown (server roll), material used', tries >= 1 and P.get_attribute('[data-testid=evo-have-150]', 'data-count') == str(3 - tries), [tries, P.get_attribute('[data-testid=evo-have-150]', 'data-count')])
        if P.locator('[data-testid=evo-detail]').count():
            P.click('[data-testid=evo-detail]', position={'x': 5, 'y': 5})
        cardel = P.locator('[data-testid=evo-grid] [data-testid=player-card]').first
        check('the card shows "+1" and OVR +3', level == 1 and P.get_attribute('[data-testid=evo-grid] [data-testid=player-card]', 'data-evo') == '1' and '+1' in cardel.inner_text(), [level, cardel.inner_text()[:40]])
        P.click('[data-testid=evo-back]')
        P.click('[data-testid=play-market]')
        P.click('[data-testid=market-tab-mine]')
        check('an evolved card can’t be listed ("+1 진화 · 판매 불가")', level == 0 or P.locator('[data-testid=sell-evolved]').count() == 1)
        P.click('[data-testid=market-back]')

        # ── WEEKLY MISSIONS ───────────────────────────────────────────
        P.click('[data-testid=play-missions]')
        P.wait_for_selector('[data-testid=missions]')
        check('5 weekly missions; 10 goals done, online 1/3', P.locator('[data-testid^=mission-][data-done]').count() == 5 and P.get_attribute('[data-testid=mission-goals10]', 'data-done') == '1' and '1' in P.inner_text('[data-testid=mission-progress-online3]'))
        P.screenshot(path=f'{OUT}/06_missions.png', full_page=True)
        mp0 = P.evaluate(PROFILE_JS, 'EVO')['profile']['mp']
        P.click('[data-testid=mission-claim-goals10]')
        v, _ = wait_for(lambda: P.get_attribute('[data-testid=mission-goals10]', 'data-claimed') == '1', 8)
        mp1 = P.evaluate(PROFILE_JS, 'EVO')['profile']['mp']
        check('CLAIM 10골 → +20,000,000 MP, once', bool(v) and mp1 - mp0 == 20_000_000 and P.locator('[data-testid=mission-claim-goals10]').count() == 0, [mp0, mp1])
        P.click('[data-testid=missions-back]')

        # ── MATCH STATISTICS ──────────────────────────────────────────
        P.click('[data-testid=play-stats]')
        P.wait_for_selector('[data-testid=stats-table]', timeout=8000)
        check('MATCH STATISTICS · SEASON 1', 'SEASON 1' in P.inner_text('[data-testid=stats-title]'))

        def rows():
            return P.eval_on_selector_all('[data-testid=stats-row]', 'els => els.map(e => [e.dataset.nick, +e.dataset.games, +e.dataset.wins])')
        r = rows()
        check('TOTAL: STATA 8 games 5 wins, STATB 5 games 1 win', ['STATA', 8, 5] in r and ['STATB', 5, 1] in r, r)
        P.click('[data-testid=stats-tab-freekick]')
        wait_for(lambda: ['STATA', 4, 2] in rows(), 6)
        check('FREE KICK tab', ['STATA', 4, 2] in rows() and not any(x[0] == 'STATB' and x[1] > 0 for x in rows()), rows())
        P.click('[data-testid=stats-tab-penalty]')
        P.fill('[data-testid=stats-search]', 'statb')
        v, _ = wait_for(lambda: rows() == [['STATB', 5, 1]], 6)
        check('PENALTY + nickname search', bool(v), rows())
        P.screenshot(path=f'{OUT}/07_stats.png', full_page=True)
        P.click('[data-testid=stats-back]')

        # ── online: EMOTES + wall heights (free kick) ─────────────────
        A = ctx(1).new_page()
        B = ctx(1).new_page()
        login(A, 'GKA')
        login(B, 'GKB')
        for pg in (A, B):
            pg.click('[data-testid=play-online]')
            pg.click('[data-testid=online-freekick]')
            pg.wait_for_selector('.lobby')
        wait_for(lambda: A.locator('[data-testid=player-row][data-nick="GKB"] button').is_enabled(timeout=500), 15)
        A.click('[data-testid=player-row][data-nick="GKB"] button')
        B.wait_for_selector('[data-testid=challenge-panel]', timeout=8000)
        B.click('[data-testid=cp-accept]')
        wait_for(lambda: A.is_enabled('[data-testid=mf-ready]') and B.is_enabled('[data-testid=mf-ready]'), 15)
        A.click('[data-testid=mf-ready]')
        B.click('[data-testid=mf-ready]')
        v, _ = wait_for(lambda: A.get_attribute('[data-testid=online-game]', 'data-phase') == 'aim' and B.get_attribute('[data-testid=online-game]', 'data-phase') == 'aim', 40)
        check('online free kick reached the first aim', bool(v))
        wa = A.evaluate('window.__PIPA_ONLINE.debug().wallHeights')
        wb = B.evaluate('window.__PIPA_ONLINE.debug().wallHeights')
        check('wall: random 165–200 cm, identical on both phones', wa == wb and len(wa) >= 3 and all(165 <= h <= 200 for h in wa) and len(set(wa)) > 1, [wa, wb])
        A.click('[data-testid=emote-btn]')
        A.wait_for_selector('[data-testid=emote-picker]')
        got = A.eval_on_selector_all('[data-testid=emote-pick]', 'els => els.map(e => e.dataset.e)')
        check('9 emotes: 🔥 💀 🤫 🤯 😃 ⚽️ 💔 동 EZ', got == ['🔥', '💀', '🤫', '🤯', '😃', '⚽️', '💔', '동', 'EZ'], got)
        A.screenshot(path=f'{OUT}/08_emote_picker.png')
        # software WebGL makes the two test phones slow → record timings inside the pages
        OBS = """() => { window.__emo = []; const seen = new Map();
          new MutationObserver(() => { const now = performance.now(); const cur = new Set();
            document.querySelectorAll('.emote-pop').forEach((el) => { cur.add(el); if (!seen.has(el)) { seen.set(el, now); window.__emo.push({ kind: el.dataset.testid, e: el.dataset.e, at: now, gone: 0 }); } });
            for (const [el, t] of seen) if (!cur.has(el)) { const r = window.__emo.find((x) => x.at === t && x.e === el.dataset.e); if (r && !r.gone) r.gone = now; seen.delete(el); } })
          .observe(document.body, { subtree: true, childList: true }); }"""
        A.evaluate(OBS)
        B.evaluate(OBS)
        res = A.evaluate("""async () => { const q = (s) => document.querySelector(s); const t0 = performance.now();
          q('[data-testid=emote-pick][data-e="🔥"]').click(); await new Promise((r) => setTimeout(r, 120));
          q('[data-testid=emote-btn]').click(); await new Promise((r) => setTimeout(r, 120));
          const picks = [...document.querySelectorAll('[data-testid=emote-pick]')];
          const out = { n: picks.length, dis: picks.length > 0 && picks.every((p) => p.disabled), cls: q('[data-testid=emote-btn]').className, ms: performance.now() - t0 };
          q('[data-testid=emote-btn]').click(); return out; }""")
        check('3 s cooldown right after sending', res['n'] == 9 and res['dis'] and 'cool' in res['cls'], res)
        v, _ = wait_for(lambda: any(x['kind'] == 'emote-opp' and x['e'] == '🔥' for x in B.evaluate('window.__emo')) and any(x['kind'] == 'emote-mine' and x['e'] == '🔥' for x in A.evaluate('window.__emo')), 8)
        check('🔥 appears on both phones (mine / the opponent’s)', bool(v))
        B.screenshot(path=f'{OUT}/09_emote_opponent.png')
        v, _ = wait_for(lambda: all(x['gone'] for x in B.evaluate('window.__emo')) and B.evaluate('window.__emo').__len__() > 0, 10)
        life = [round((x['gone'] - x['at']) / 1000, 2) for x in B.evaluate('window.__emo')]
        check('…and goes away after about 2 s', bool(v) and all(1.5 <= l <= 4.5 for l in life), life)
        check('no sound', A.evaluate("typeof window.__audioCtx === 'undefined' || window.__audioCtx === 0"))
        time.sleep(3.2)
        B.evaluate("""async () => { const q = (s) => document.querySelector(s); q('[data-testid=emote-btn]').click(); await new Promise((r) => setTimeout(r, 120));
          q('[data-testid=emote-mute]').click(); await new Promise((r) => setTimeout(r, 120)); q('[data-testid=emote-btn]').click(); }""")
        n0 = len(B.evaluate('window.__emo'))
        A.evaluate("""async () => { const q = (s) => document.querySelector(s); q('[data-testid=emote-btn]').click(); await new Promise((r) => setTimeout(r, 120));
          q('[data-testid=emote-pick][data-e="EZ"]').click(); }""")
        v, _ = wait_for(lambda: any(x['e'] == 'EZ' for x in A.evaluate('window.__emo')), 8)
        time.sleep(1.5)
        check('상대 이모티콘 숨기기 → B no longer sees them (A still sees its own EZ)', bool(v) and len(B.evaluate('window.__emo')) == n0 and B.evaluate("localStorage.getItem('pipa.emote.mute')") == '1')
        check('no page errors', not errors, errors[:3])
        browser.close()
finally:
    os.killpg(srv.pid, 15)

bad = [n for n, ok in results if not ok]
print(f'FAILED: {", ".join(bad)}' if bad else f'ALL {len(results)} UPDATE 10 E2E CHECKS PASSED')
sys.exit(1 if bad else 0)

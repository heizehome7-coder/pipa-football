"""
UPDATE 6 browser test — TRANSFER MARKET + MP + owned players in SQUAD + online FREE KICK DUEL.

Starts its own PIPA server (port 8790, slow-browser timers) with a seeded account file:
  RICHKID — 500,000,000 MP (as if won 50 online penalty shootouts)

  python3 scripts/update6-e2e.py [out_dir]     (needs `npm run build` first)
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
from squad_seed import seed_script, NO_DAILY_JS, game_version  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8790
BASE = f'http://localhost:{PORT}/'
OUT = sys.argv[1] if len(sys.argv) > 1 else 'update6-shots'
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


def account(nick, password, mp, squad):
    salt = secrets.token_hex(16)
    # same as server/accounts.mjs: scrypt(password, salt-as-text, 32) with Node's defaults (N=16384, r=8, p=1)
    h = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=32, maxmem=64 * 1024 * 1024).hex()
    return {'key': nick.lower(), 'nickname': nick, 'salt': salt, 'hash': h, 'tokens': [], 'createdAt': '2026-11-01',
            'data': {'v6': True, 'mp': mp, 'owned': [], 'rewards': [], 'squad': squad}}


STARTER = {'penaltyOrder': ['mbappe', 'messi', 'ronaldo', 'neymar', 'yamal'], 'goalkeeperId': 'courtois', 'freeKickTakerId': 'messi'}
data_dir = tempfile.mkdtemp(prefix='pipa-u6-')
with open(os.path.join(data_dir, 'accounts.json'), 'w') as f:
    json.dump({'richkid': account('RICHKID', 'pw1234', 500_000_000, STARTER)}, f)
# a test-only developer code (the real one is never written in any file of the repo)
DEV_CODE = 'pipa-test-dev-7531'
env = {**os.environ, 'PORT': str(PORT), 'PIPA_DATA_DIR': data_dir, 'PIPA_SLOW_TEST': '1', 'DATABASE_URL': '', 'DEVELOPER_CODE': DEV_CODE}
srv = subprocess.Popen(['node', 'server/realtime-server.mjs'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
time.sleep(1.5)

SQUADS = {
    'FKA': {'penaltyOrder': ['ronaldo', 'messi', 'son', 'mbappe', 'salah'], 'goalkeeperId': 'neuer', 'freeKickTakerId': 'messi'},
    'FKB': {'penaltyOrder': ['haaland', 'kane', 'yamal', 'neymar', 'vinicius'], 'goalkeeperId': 'alisson', 'freeKickTakerId': 'kane'},
}

SHOOT_JS = """([side, high, dur]) => {
  const v = window.__PIPA_ONLINE; const d = v.debug();
  const b = d.ball;
  const gx = side === 'L' ? d.goal.left + (d.goal.right - d.goal.left) * 0.12
           : side === 'R' ? d.goal.right - (d.goal.right - d.goal.left) * 0.12
           : (d.goal.left + d.goal.right) / 2;
  const gy = d.goal.bottom + (d.goal.top - d.goal.bottom) * high;
  const n = 24, pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({ x: b.x + (gx - b.x) * t, y: b.y + (gy - b.y) * t, t: 1000 + dur * t });
  }
  v.simulateSwipe(pts);
  return { gx, gy };
}"""

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        errors = []

        # ── 1. TRANSFER MARKET ─────────────────────────────────────────
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=1)
        ctx.add_init_script(NO_DAILY_JS)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(BASE)
        pg.fill('input[autocomplete=username]', 'RICHKID')
        pg.fill('input[type=password]', 'pw1234')
        pg.click('text=게임 시작')
        pg.wait_for_selector('[data-testid=play-market]', timeout=20000)
        check('HOME: 혼자서 / 온라인 / SQUAD / TRANSFER MARKET', all(pg.is_visible(f'[data-testid={t}]') for t in ['play-solo', 'play-online', 'play-squad', 'play-market']))
        v, _ = wait_for(lambda: pg.get_attribute('[data-testid=mp-badge]', 'data-mp') == '500000000')
        check('HOME: MP top right from the server (500,000,000)', bool(v) and '500,000,000' in pg.inner_text('[data-testid=mp-badge]'), pg.inner_text('[data-testid=mp-badge]'))
        check('UPDATE badge (current version)', pg.inner_text('[data-testid=version-badge]') == f'UPDATE {game_version()}')
        pg.screenshot(path=f'{OUT}/01_home.png')

        pg.click('[data-testid=play-market]')
        pg.wait_for_selector('[data-testid=market-grid]')
        n = pg.locator('[data-testid=market-grid] [data-testid=player-card]').count()
        check('MARKET: "PIPA TRANSFER MARKET" with 286 player cards (UPDATE 11 patch: defenders back, +4)', n == 286 and 'PIPA TRANSFER MARKET' in pg.inner_text('body'), n)
        ids = pg.eval_on_selector_all('[data-testid=market-grid] [data-testid=player-card]', 'els => els.map(e => e.dataset.id)')
        starters = {'mbappe', 'messi', 'ronaldo', 'neymar', 'yamal', 'son', 'kane', 'haaland', 'vinicius', 'courtois', 'neuer', 'alisson', 'bellingham', 'rodri', 'salah'}
        check('MARKET: none of the 15 starters is for sale', not (set(ids) & starters))
        check('MARKET: the 5 earlier players are in the market (no duplicate records)', {'debruyne', 'lewandowski', 'bruno', 'donnarumma', 'martinez'} <= set(ids) and len(set(ids)) == 286)
        check('MARKET: MP shown on the market screen', '500,000,000' in pg.inner_text('[data-testid=mp-badge]'))
        prices = pg.eval_on_selector_all('[data-testid=market-grid] [data-testid=card-price]', 'els => els.map(e => +e.innerText.replace(/[^0-9]/g, ""))')
        check('MARKET: PRICE LOW sort (default) — cheapest first (UPDATE 9: 10,000,000), ascending', prices[0] == 10_000_000 and prices == sorted(prices), prices[:3])
        pg.click('[data-testid=msort-PRICE_HIGH]')
        first = pg.get_attribute('[data-testid=market-grid] [data-testid=player-card] >> nth=0', 'data-id')
        check('MARKET: PRICE HIGH sort → a 2,000,000,000 MP legend first (Pelé / Maradona)', first in ('pele', 'maradona'), first)
        pg.click('[data-testid=msort-NAME]')
        names = pg.eval_on_selector_all('[data-testid=market-grid] [data-testid=player-card] .pcard-name', 'els => els.map(e => e.innerText)')
        check('MARKET: NAME sort', len(names) == 286)
        check('MARKET: the DEFENDER filter is back (UPDATE 11 patch)', pg.locator('[data-testid=mfilter-DEFENDER]').count() == 1)
        for f, want in [('LEGEND', 80), ('GOALKEEPER', 26)]:  # UPDATE 11 patch: defender legends back (80) · UPDATE 11: +5 ICONS, +5 keepers ·  # UPDATE 10: legends without defenders (+10 ICONS, 김태인), +1 keeper (박사하)
            pg.click(f'[data-testid=mfilter-{f}]')
            c = pg.locator('[data-testid=market-grid] [data-testid=player-card]').count()
            check(f'MARKET filter {f} → {want}', c == want, c)
        pg.click('[data-testid=mfilter-LEGEND]')
        check('MARKET: legend cards carry the LEGEND tag', pg.locator('[data-testid=market-grid] .pcard-legend').count() == 80)  # UPDATE 11 patch: defender legends back
        pg.screenshot(path=f'{OUT}/02_market_legends.png')
        pg.click('[data-testid=mfilter-ALL]')
        pg.click('[data-testid=msort-PRICE_LOW]')

        # card detail: the UPDATE 5 abilities + price + BUY
        pg.click('[data-testid=player-card][data-id="beckham"] .pcard-info')
        det = pg.inner_text('[data-testid=market-detail]')
        check('MARKET detail: abilities (UPDATE 5 sheet) + SPECIAL + price + BUY', all(k in det for k in ['FREE KICK', 'CURVE', 'SPECIAL ABILITY', '1,250,000,000 MP', 'BUY']), det[:80])
        bk = pg.eval_on_selector_all('[data-testid=market-detail] .stat-row', 'els => Object.fromEntries(els.map(e => [e.querySelector("span").innerText, +e.querySelector("b").innerText]))')
        check('Beckham: FREE KICK + CURVE are his best abilities (not 99 everywhere)', max(bk, key=bk.get) in ('FREE KICK', 'CURVE') and min(bk.values()) < 85, bk)
        # Beckham costs 1.25B > 500M → no confirm at all: "MP가 부족합니다."
        pg.click('[data-testid=buy]')
        v, _ = wait_for(lambda: 'MP가 부족합니다.' in pg.inner_text('[data-testid=market-toast]'))
        check('BUY with too little MP → "MP가 부족합니다." (no purchase)', bool(v) and not pg.is_visible('[data-testid=buy-confirm]'))
        pg.click('[data-testid=market-detail]', position={'x': 5, 'y': 5})

        # a player he can afford: Gündoğan 150M
        pg.click('[data-testid=player-card][data-id="gundogan"] .pcard-info')
        pg.click('[data-testid=buy]')
        pg.wait_for_selector('[data-testid=buy-confirm]')
        conf = pg.inner_text('[data-testid=buy-confirm]')
        check('BUY → confirm shows name, PRICE, 현재 MP, 구매 후 MP, [구매] [취소]',
              all(k in conf for k in ['이 선수를 구매하시겠습니까?', '일카이 귄도안', '150,000,000 MP', '500,000,000 MP', '350,000,000 MP', '구매', '취소']), conf.replace('\n', ' | '))
        pg.screenshot(path=f'{OUT}/03_confirm.png')
        pg.click('[data-testid=confirm-buy]')
        v, _ = wait_for(lambda: '일카이 귄도안 영입 완료!' in pg.inner_text('[data-testid=market-toast]'), 15)
        check('구매 → "일카이 귄도안 영입 완료!"', bool(v))
        v, _ = wait_for(lambda: pg.get_attribute('[data-testid=mp-badge]', 'data-mp') == '350000000')
        check('MP after purchase: 350,000,000 (server balance)', bool(v), pg.get_attribute('[data-testid=mp-badge]', 'data-mp'))
        check('bought card shows ✓ OWNED', 'OWNED' in pg.inner_text('[data-testid=player-card][data-id="gundogan"] [data-testid=card-price]'))
        pg.click('[data-testid=player-card][data-id="gundogan"] .pcard-info')
        check('owned player: BUY disabled (OWNED)', pg.is_disabled('[data-testid=buy]') and 'OWNED' in pg.inner_text('[data-testid=buy]'))
        pg.click('[data-testid=market-detail]', position={'x': 5, 'y': 5})
        pg.screenshot(path=f'{OUT}/04_owned.png')

        # mobile touch scrolling of the market grid
        cdp = ctx.new_cdp_session(pg)
        box = pg.locator('[data-testid=market-grid]').bounding_box()
        before = pg.evaluate("document.querySelector('[data-testid=market-grid]').scrollTop")
        x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] * 0.8
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
        for i in range(1, 16):
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y - i * 16}]})
            pg.wait_for_timeout(16)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        pg.wait_for_timeout(400)
        check('MARKET grid scrolls by touch on a phone', pg.evaluate("document.querySelector('[data-testid=market-grid]').scrollTop") > before + 40)

        # SQUAD: the bought player can be used
        pg.click('[data-testid=market-back]')
        pg.click('[data-testid=play-squad]')
        pg.wait_for_selector('[data-testid=squad-arrange]')
        pg.click('text=선수 변경')
        pg.wait_for_selector('[data-testid=squad-pick]')
        n = pg.locator('[data-testid=card-grid] [data-testid=player-card]').count()
        check('SQUAD: 15 starters + the bought player = 16 owned cards', n == 16 and pg.locator('[data-testid=player-card][data-id="gundogan"]').count() == 1, n)
        check('SQUAD: unbought market players are not listed', pg.locator('[data-testid=player-card][data-id="pele"]').count() == 0)
        check('SQUAD: MP visible on the squad screen', pg.is_visible('[data-testid=mp-badge]'))
        pg.click('[data-testid=player-card][data-id="yamal"] .pcard-hit')
        pg.click('[data-testid=player-card][data-id="gundogan"] .pcard-hit')
        pg.click('[data-testid=squad-next]')
        pg.click('[data-testid=squad-save]')
        pg.wait_for_selector('[data-testid=play-squad]')
        time.sleep(0.8)
        tok = pg.evaluate("JSON.parse(localStorage.getItem('pipa.session.v1')).token")
        me = pg.evaluate("t => fetch('/api/me', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({token: t})}).then(r => r.json())", tok)
        check('SQUAD with the bought player saved on the server (accepted as owned)', 'gundogan' in (me.get('squad') or {}).get('penaltyOrder', []) and me['owned'] == ['gundogan'], me.get('squad'))
        # reload: MP and ownership come back from the server
        pg.reload()
        pg.wait_for_selector('[data-testid=play-market]', timeout=20000)
        v, _ = wait_for(lambda: pg.get_attribute('[data-testid=mp-badge]', 'data-mp') == '350000000')
        check('reload → MP + owned players restored from the server', bool(v))
        ctx.close()

        # ── 2. ONLINE FREE KICK DUEL ──────────────────────────────────
        def mk(label):
            c = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=1)
            c.add_init_script(NO_DAILY_JS)
            c.add_init_script(seed_script(SQUADS))
            c.add_init_script("""(() => { window.__banners = []; new MutationObserver(() => {
                const el = document.querySelector('[data-testid=result]');
                const k = el && (el.dataset.outcome + '@' + document.querySelector('[data-testid=online-game]')?.dataset.round + '@' + el.querySelector('.result-word').innerText);
                if (el && window.__banners[window.__banners.length - 1] !== k) window.__banners.push(k);
              }).observe(document, { subtree: true, childList: true }); })()""")
            # UPDATE 6 patch: every goal card that appears (player id @ round)
            c.add_init_script("""(() => { window.__cards = []; new MutationObserver(() => {
                const el = document.querySelector('[data-testid=goal-card]');
                const k = el && (el.dataset.id + '@' + document.querySelector('[data-testid=online-game]')?.dataset.round);
                if (el && window.__cards[window.__cards.length - 1] !== k) window.__cards.push(k);
              }).observe(document, { subtree: true, childList: true }); })()""")
            pgx = c.new_page()
            pgx.on('pageerror', lambda e: errors.append(f'{label}: {e}'))
            return pgx

        A = mk('A')
        B = mk('B')
        for pgx, nick in [(A, 'FKA'), (B, 'FKB')]:
            pgx.goto(BASE)
            pgx.fill('input[autocomplete=username]', nick)
            pgx.fill('input[type=password]', 'pw1234')
            pgx.click('text=게임 시작')
            pgx.click('[data-testid=play-online]')
            pgx.wait_for_selector('[data-testid=online-modes]')
        check('ONLINE → PENALTY SHOOTOUT / FREE KICK DUEL choice', A.is_visible('[data-testid=online-penalty]') and A.is_visible('[data-testid=online-freekick]'))
        A.screenshot(path=f'{OUT}/05_online_modes.png')
        for pgx in (A, B):
            pgx.click('[data-testid=online-freekick]')
            pgx.wait_for_selector('.lobby')
        check('lobby shows the chosen duel (FREE KICK DUEL)', A.inner_text('[data-testid=lobby-mode]') == 'FREE KICK DUEL')
        wait_for(lambda: A.locator('[data-testid=player-row][data-nick="FKB"] button').is_enabled(timeout=500), 15)
        A.click('[data-testid=player-row][data-nick="FKB"] button')
        B.wait_for_selector('[data-testid=challenge-panel]', timeout=8000)
        check('challenge panel says FREE KICK DUEL', B.inner_text('[data-testid=cp-mode]') == 'FREE KICK DUEL')
        B.click('[data-testid=cp-accept]')
        wait_for(lambda: A.is_visible('[data-testid=mf-ready]') and B.is_visible('[data-testid=mf-ready]'), 10)
        wait_for(lambda: A.is_enabled('[data-testid=mf-ready]') and B.is_enabled('[data-testid=mf-ready]'), 10)
        A.click('[data-testid=mf-ready]')
        B.click('[data-testid=mf-ready]')
        v, _ = wait_for(lambda: A.get_attribute('[data-testid=online-game]', 'data-phase') == 'aim' and B.get_attribute('[data-testid=online-game]', 'data-phase') == 'aim', 25)
        check('both ready → FREE KICK DUEL kicks off on both phones', bool(v))
        check('HUD: FREE KICK DUEL · ROUND 1/10 · KICKER / GOALKEEPER',
              A.inner_text('[data-testid=duel-title]') == 'FREE KICK DUEL' and A.inner_text('[data-testid=round-label]') == 'ROUND 1/10'
              and {A.inner_text('[data-testid=role-label]'), B.inner_text('[data-testid=role-label]')} == {'KICKER', 'GOALKEEPER'})
        da = A.evaluate('window.__PIPA_ONLINE.debug()')
        db = B.evaluate('window.__PIPA_ONLINE.debug()')
        check('same free-kick spot on both phones + a 4–5 man wall', da['ballWorld'] == db['ballWorld'] and da['wall'] in (4, 5) and db['wall'] == da['wall'] and da['ballWorld'][2] > 20, f"{da['ballWorld']} wall {da['wall']}")
        A.screenshot(path=f'{OUT}/06_fk_round1_A.png')
        B.screenshot(path=f'{OUT}/07_fk_round1_B.png')

        takers = set()
        shots_plan = {1: ('C', 0.2, 260), 2: ('C', 0.2, 260), 3: ('L', 0.85, 330), 4: ('R', 0.85, 330)}
        for r in range(1, 11):
            v, _ = wait_for(lambda: A.get_attribute('[data-testid=online-game]', 'data-round') == str(r) and A.get_attribute('[data-testid=online-game]', 'data-phase') == 'aim'
                            and B.get_attribute('[data-testid=online-game]', 'data-phase') == 'aim', 40)
            if not v:
                check(f'round {r} reached', False)
                break
            kick, keep = (A, B) if A.get_attribute('[data-testid=online-game]', 'data-role') == 'kicker' else (B, A)
            wait_for(lambda: kick.is_visible('[data-testid=name-banner]'), 5)
            try:
                takers.add((kick is A, kick.inner_text('[data-testid=name-banner]').upper()))
            except Exception:
                pass
            side, high, dur = shots_plan.get(r, ('L' if r % 2 else 'R', 0.8, 320))
            if r >= 5 and r % 3 == 0:
                keep.evaluate("d => window.__PIPA_ONLINE.keeperDive(d)", 'left' if side == 'L' else 'right')
            kick.evaluate(SHOOT_JS, [side, high, dur])
            v, _ = wait_for(lambda: A.get_attribute('[data-testid=online-game]', 'data-phase') == 'result' or A.is_visible('[data-testid=match-result]'), 40)
        v, _ = wait_for(lambda: A.is_visible('[data-testid=match-result]') and B.is_visible('[data-testid=match-result]'), 60)
        check('10 rounds (5 each) → FREE KICK RESULT on both', bool(v))
        ba = A.evaluate('window.__banners')
        bb = B.evaluate('window.__banners')
        check('both phones showed the same server result every round', ba == bb and len(ba) >= 10, f'{ba}')
        check('a shot into the wall shows BLOCKED', any('BLOCKED' in b for b in ba), ba[:4])
        check('kicker taken by each side’s FREE KICK TAKER (Messi / Kane)', any('메시' in t[1] for t in takers) and any('케인' in t[1] for t in takers), str(takers))
        txt = A.inner_text('[data-testid=match-result]')
        check('FREE KICK RESULT screen: scores, WINNER/DRAW, 온라인 로비로', 'FREE KICK RESULT' in txt and ('WINNER' in txt or '무승부' in txt) and A.is_visible('[data-testid=to-lobby]'), txt.replace('\n', ' | ')[:120])
        check('FREE KICK DUEL pays no MP in UPDATE 6 (no reward line)', A.locator('[data-testid=final-reward]').count() == 0)
        check('final scores identical on both phones', A.inner_text('[data-testid=final-me]') == B.inner_text('[data-testid=final-opp]') and A.inner_text('[data-testid=final-opp]') == B.inner_text('[data-testid=final-me]'))
        A.screenshot(path=f'{OUT}/08_fk_result.png')

        # ── GOAL → the scorer's PLAYER CARD (only on goals, same card on both phones) ──
        ca = A.evaluate('window.__cards')
        cb = B.evaluate('window.__cards')
        goal_rounds = [b.split('@')[1] for b in ba if b.startswith('GOAL@')]
        card_rounds = [c.split('@')[1] for c in ca]
        check('GOAL card: shown for every goal and never for SAVE / MISS / BLOCKED', sorted(card_rounds) == sorted(goal_rounds) and len(goal_rounds) > 0, f'cards {ca} goals {goal_rounds}')
        check('GOAL card: the same scorer card on both phones (opponent sees my Messi)', ca == cb, f'{ca} | {cb}')
        check('GOAL card: the scorer is that side’s free-kick taker (Messi / Kane)', {c.split('@')[0] for c in ca} <= {'messi', 'kane'} and len({c.split('@')[0] for c in ca}) == 2, str(ca))

        A.click('[data-testid=to-lobby]')
        v, _ = wait_for(lambda: A.is_visible('.lobby') and A.inner_text('[data-testid=lobby-mode]') == 'FREE KICK DUEL', 10)
        check('온라인 로비로 → back in the FREE KICK DUEL lobby', bool(v))

        # ── DEVELOPER MODE (UPDATE 6 patch) ──────────────────────────
        # A left first, so B now sees MATCH ENDED (back-to-lobby) or still the result (to-lobby)
        B.click('[data-testid=to-lobby], [data-testid=back-to-lobby]')
        B.wait_for_selector('.lobby')
        B.click('.lobby-back')
        B.click('[data-testid=online-modes] .btn-ghost')
        B.wait_for_selector('[data-testid=play-developer]')
        A.click('.lobby-back')
        A.click('[data-testid=online-modes] .btn-ghost')
        A.wait_for_selector('[data-testid=play-developer]')
        check('HOME has DEVELOPER MODE (개발자 모드)', '개발자 모드' in A.inner_text('[data-testid=play-developer]') and 'DEVELOPER MODE' in A.inner_text('[data-testid=play-developer]'))
        A.click('[data-testid=play-developer]')
        A.wait_for_selector('[data-testid=dev-access]')
        check('DEVELOPER ACCESS screen first (no dashboard yet)', 'DEVELOPER ACCESS' in A.inner_text('body') and '개발자 코드를 입력하세요.' in A.inner_text('body') and A.locator('[data-testid=dev-dashboard]').count() == 0)
        A.fill('[data-testid=dev-code]', DEV_CODE.upper())
        A.click('[data-testid=dev-submit]')
        v, _ = wait_for(lambda: A.inner_text('[data-testid=dev-msg]').strip() == '인증이 되지 않았습니다.', 10)
        check('wrong code (case differs) → "인증이 되지 않았습니다." and no dashboard', bool(v) and A.locator('[data-testid=dev-dashboard]').count() == 0)
        A.fill('[data-testid=dev-code]', DEV_CODE)
        A.click('[data-testid=dev-submit]')
        v, _ = wait_for(lambda: '인증되었습니다.' in A.inner_text('[data-testid=dev-msg]'), 10)
        check('right code → "인증되었습니다."', bool(v))
        v, _ = wait_for(lambda: A.is_visible('[data-testid=dev-dashboard]'), 10)
        check('→ DEVELOPER DASHBOARD (최근 접속자 / 유저 전적 / MP 관리)', bool(v) and all(t in A.inner_text('body') for t in ['DEVELOPER DASHBOARD', '최근 접속자', '유저 전적', 'MP 지급']))
        v, _ = wait_for(lambda: A.locator('[data-testid=dev-user]').count() >= 3, 10)
        rows = A.eval_on_selector_all('[data-testid=dev-user]', 'els => els.map(e => [e.dataset.nick, e.dataset.online, e.innerText])')
        nicks = [r[0] for r in rows]
        check('최근 접속자: FKA / FKB ONLINE, RICHKID OFFLINE, YYYY-MM-DD HH:mm times',
              {'FKA', 'FKB', 'RICHKID'} <= set(nicks) and dict((r[0], r[1]) for r in rows)['FKA'] == '1' and dict((r[0], r[1]) for r in rows)['RICHKID'] == '0'
              and all(__import__('re').search(r'20\d\d-\d\d-\d\d \d\d:\d\d', r[2]) for r in rows), str(rows))
        check('최근 접속자: online first, then latest first', nicks.index('RICHKID') > max(nicks.index('FKA'), nicks.index('FKB')))
        A.fill('[data-testid=dev-search]', 'rich')
        v, _ = wait_for(lambda: A.eval_on_selector_all('[data-testid=dev-user]', 'els => els.map(e => e.dataset.nick)') == ['RICHKID'], 8)
        check('닉네임 검색 filters the list', bool(v))
        A.fill('[data-testid=dev-search]', '')
        A.click('[data-testid=dev-tab-records]')
        A.click('[data-testid=dev-rec-freekick]')
        wait_for(lambda: A.locator('[data-testid=dev-record][data-nick="FKA"]').count() == 1, 8)
        fa = A.eval_on_selector('[data-testid=dev-record][data-nick="FKA"]', 'e => [e.dataset.w, e.dataset.l, e.dataset.d, e.innerText]')
        fb = A.eval_on_selector('[data-testid=dev-record][data-nick="FKB"]', 'e => [e.dataset.w, e.dataset.l, e.dataset.d]')
        verdict = 'DRAW' if '무승부' in txt else 'A' if A.inner_text('[data-testid=final-me]') > A.inner_text('[data-testid=final-opp]') else 'B'
        want_a = {'DRAW': ['0', '0', '1'], 'A': ['1', '0', '0'], 'B': ['0', '1', '0']}[verdict]
        want_b = {'DRAW': ['0', '0', '1'], 'A': ['0', '1', '0'], 'B': ['1', '0', '0']}[verdict]
        check('유저 전적 (FREE KICK): the finished duel is recorded once for both players', fa[:3] == want_a and fb == want_b, f'{verdict} A={fa[:3]} B={fb}')
        check('유저 전적 shows 승리 · 패배 · 무승부 · MATCHES · WIN RATE', all(k in fa[3] for k in ['승리', '패배', '무승부', 'MATCHES', 'WIN RATE']), fa[3])
        A.click('[data-testid=dev-rec-penalty]')
        pa = A.eval_on_selector('[data-testid=dev-record][data-nick="FKA"]', 'e => [e.dataset.w, e.dataset.l, e.dataset.d]')
        check('유저 전적 tabs keep PENALTY separate (0 penalty games)', pa == ['0', '0', '0'], str(pa))
        A.screenshot(path=f'{OUT}/09_dev_records.png')

        # MP 관리: grant 500,000,000 MP to FKB, who is online on his home screen
        A.click('[data-testid=dev-tab-mp]')
        A.click('[data-testid=dev-pick][data-nick="FKB"]')
        check('MP 관리: the user’s current MP', A.inner_text('[data-testid=dev-current-mp]') == '0 MP')
        for bad in ['-5', 'abc', '0', '1e9', '12.5']:
            A.fill('[data-testid=dev-amount]', bad)
            if not A.is_disabled('[data-testid=dev-grant-btn]'):
                check(f'invalid amount "{bad}" refused', False)
        check('MP 관리: negative / text / 0 / decimals cannot be sent', True)
        A.fill('[data-testid=dev-amount]', '500,000,000')
        A.click('[data-testid=dev-grant-btn]')
        conf = A.inner_text('[data-testid=dev-confirm]')
        check('confirm: "FKB에게 500,000,000 MP를 지급하시겠습니까?" 현재 / 지급 후 [확인] [취소]',
              all(k in conf for k in ['FKB에게', '500,000,000 MP', '지급하시겠습니까?', '현재', '0 MP', '지급 후', '확인', '취소']), conf.replace('\n', ' | '))
        A.screenshot(path=f'{OUT}/10_dev_confirm.png')
        A.click('[data-testid=dev-confirm-ok]')
        v, _ = wait_for(lambda: '500,000,000 MP 지급 완료' in A.inner_text('[data-testid=dev-grant-msg]'), 10)
        check('"500,000,000 MP 지급 완료"', bool(v))
        v, _ = wait_for(lambda: B.get_attribute('[data-testid=mp-badge]', 'data-mp') == '500000000', 10)
        check('FKB (online) sees 500,000,000 MP at once — no refresh (wallet:update)', bool(v), B.get_attribute('[data-testid=mp-badge]', 'data-mp'))
        B.screenshot(path=f'{OUT}/11_B_wallet_update.png')
        # the server refuses dashboard calls without a developer session
        r = B.evaluate("() => fetch('/api/dev/grant', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({devToken: 'x'.repeat(40), nickname: 'FKB', amount: 1})}).then(r => r.status)")
        check('server refuses MP grants without a developer session (401)', r == 401, r)
        bundle = B.evaluate("c => Promise.all([...document.scripts].filter(s => s.src).map(s => fetch(s.src).then(r => r.text()))).then(a => a.join('').includes(c))", DEV_CODE)
        check('the developer code is not in the browser bundle (checked by the server only)', bundle is False)
        check('no JS errors', not errors, errors[:3])
        browser.close()
finally:
    os.killpg(srv.pid, 15)

fails = [n for n, ok in results if not ok]
print('\n' + (f'{len(fails)} FAILED: {fails}' if fails else f'ALL {len(results)} UPDATE 6 E2E CHECKS PASSED'))
sys.exit(1 if fails else 0)

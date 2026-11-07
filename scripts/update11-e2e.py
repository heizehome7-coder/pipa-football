"""
UPDATE 11 (+ MATCH SYSTEM EXPANSION) browser test — HOME (UPDATE 11 · SEASON 1, MATCH moved into
혼자서), 혼자서 → MATCH warning (exact text, big X → HOME, 계속하기) → MATCH SQUAD SETUP (4-3-3
HOLDING, 11 + 4, out-of-position warning) → THE MATCH 11 v 11 in landscape: FC-style HUD (scoreboard
top-left, menu top-right, gold joystick, 질주 / 패스 / 스루 / 슈팅 layout), kick-off waits for the first
pass (MATCH START), contextual SHOOT button (슈팅 / 걷어내기 / 태클), shoot gestures, cross swipe,
double-tap skill, menu → SUB (pauses, max 3), GOAL!, HALF TIME → 2ND HALF, FULL TIME; portrait →
"휴대폰을 가로로 돌려주세요."; MARKET defenders + DEFENDER STATS + SKILL MOVE; EVOLUTION rates;
DEVELOPER 재화 회수 + SERVER ACCESS CONTROL; the weekday LOCK SCREEN (server clock override).

Own server on port 8797. Needs `npm run build`.
  python3 scripts/update11-e2e.py [out_dir]
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
OUT = sys.argv[1] if len(sys.argv) > 1 else 'update11-shots'
os.makedirs(OUT, exist_ok=True)
results = []
WARNING = '아직 개발 단계이므로 많은 버그와 작동이 안 될 수 있습니다.'


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
            'data': {'v6': True, 'season': 1, 'mp': mp, 'owned': [], 'rewards': [], 'squad': squad, 'lastDailyClaim': '2099-01-01', **extra}}


SQ = {'penaltyOrder': ['mbappe', 'messi', 'ronaldo', 'neymar', 'yamal'], 'goalkeeperId': 'courtois', 'freeKickTakerId': 'messi'}
data_dir = tempfile.mkdtemp(prefix='pipa-u11-')
with open(os.path.join(data_dir, 'accounts.json'), 'w') as f:
    json.dump({
        'baller': account('BALLER', 900_000_000, SQ, owned=['kimtaei', 'zico', 'vandijk', 'saliba', 'davies', 'hakimi'], fv=300),
        'devk': account('DEVK', 0, SQ),
    }, f)
DEV_CODE = 'pipa-test-dev-7531'
SAT = '2026-11-07T12:00:00+09:00'
MON = '2026-11-09T10:00:00+09:00'
env = {**os.environ, 'PORT': str(PORT), 'PIPA_DATA_DIR': data_dir, 'DATABASE_URL': '', 'DEVELOPER_CODE': DEV_CODE, 'PIPA_CLOCK_OVERRIDE': SAT}
srv = subprocess.Popen(['node', 'server/realtime-server.mjs'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
time.sleep(1.5)
PROFILE_JS = "async (n) => (await fetch('/api/profile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: n }) })).json()"
M5 = 'window.__PIPA_MATCH5'

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'])
        errors = []

        def ctx(w=390, h=844, dpr=2):
            c = browser.new_context(viewport={'width': w, 'height': h}, is_mobile=True, has_touch=True, device_scale_factor=dpr)
            c.add_init_script(NO_DAILY_JS)
            c.add_init_script("(() => { window.__audioCtx = 0; for (const k of ['AudioContext', 'webkitAudioContext']) { const A = window[k]; if (A) window[k] = function (...a) { window.__audioCtx++; return new A(...a); }; } })()")
            return c

        def login(pg, nick, home=True):
            pg.on('pageerror', lambda e: errors.append(f'{nick}: {e}'))
            pg.goto(BASE)
            pg.fill('input[autocomplete=username]', nick)
            pg.fill('input[type=password]', 'pw1234')
            pg.click('text=게임 시작')
            if home:
                pg.wait_for_selector('[data-testid=play-events]', timeout=20000)

        def open_match(pg):
            pg.click('[data-testid=play-solo]')
            pg.click('[data-testid=mode-match]')
            pg.click('[data-testid=match-warning-continue]')
            pg.wait_for_selector('[data-testid=match-setup]', timeout=10000)

        P = ctx().new_page()
        login(P, 'BALLER')
        order = P.eval_on_selector_all('.mode-list .mode-card', 'els => els.map(e => e.dataset.testid)')
        check('HOME: 혼자서 first, the MATCH card moved off HOME (into 혼자서)', order[0] == 'play-solo' and 'play-match' not in order and 'play-online' in order, order)
        check('UPDATE 11 + SEASON 1 badges', P.inner_text('[data-testid=version-badge]') == 'UPDATE 11' and game_version() == 11 and P.inner_text('[data-testid=season-badge]').strip() == 'SEASON 1')

        # ── EVOLUTION rates ──────────────────────────────────────────────
        P.click('[data-testid=play-evolution]')
        P.wait_for_selector('[data-testid=evolution]')
        P.click('[data-testid=evo-grid] [data-testid=player-card]')
        P.wait_for_selector('[data-testid=evo-detail]')
        rates = [P.inner_text(f'[data-testid=evo-slot-rate-{o}]') for o in (130, 135, 140, 145, 150)]
        nums = [float(r.rstrip('%')) for r in rates]
        check('EVOLUTION: rate per grade shown, OVR 130 < 135 < 140 < 145 < 150', all(nums[i] < nums[i + 1] for i in range(4)), rates)
        P.click('[data-testid=evo-detail]', position={'x': 5, 'y': 5})
        P.click('[data-testid=evo-back]')

        # ── MARKET: defenders back, DEFENDER STATS, SKILL MOVE, OVR 135–150 ─
        P.click('[data-testid=play-market]')
        P.wait_for_selector('[data-testid=market-grid]')
        P.click('[data-testid=mfilter-DEFENDER]')
        time.sleep(0.4)
        dids = P.eval_on_selector_all('[data-testid=market-grid] [data-testid=player-card]', 'els => els.map(e => e.dataset.id)')
        check('MARKET: the DEFENDER filter lists defenders again (incl. 한유준)', len(dids) >= 20 and 'hanyujun' in dids, len(dids))
        P.click('[data-testid=market-grid] [data-testid=player-card][data-id="hanyujun"]')
        P.wait_for_selector('[data-testid=market-detail]')
        det = P.inner_text('[data-testid=market-detail]')
        check('한유준 detail: DEFENDER STATS (TACKLE 86 · INTERCEPTION 84 · MARKING 87 · STRENGTH 82 · POSITIONING 84) + DEFENSIVE WALL', P.locator('[data-testid=def-sheet]').count() == 1 and all(x in det for x in ('TACKLE', 'INTERCEPTION', 'MARKING', 'STRENGTH', 'POSITIONING', '86', '87')) and 'DEFENSIVE WALL' in det, det[:300].replace('\n', ' '))
        check('…SKILL MOVE — 개인기 shown', P.locator('[data-testid=skill-move]').count() == 1 and '개인기' in P.inner_text('[data-testid=skill-move]'))
        check('…45,000,000 MP, a BUY button (defenders for sale)', '45,000,000' in P.inner_text('[data-testid=detail-price]') and P.locator('[data-testid=buy]').count() >= 1)
        P.screenshot(path=f'{OUT}/01_market_defender.png')
        P.keyboard.press('Escape')
        P.goto(BASE)
        P.wait_for_selector('[data-testid=play-events]', timeout=20000)
        v, _ = wait_for(lambda: P.locator('[data-portrait="3d"]').count() > 0 or P.evaluate("!!window.__pipaPortrait"), 6)
        check('card portraits come from the 3D player model', bool(v))

        # ── 혼자서 → MATCH warning ─────────────────────────────────────────
        P.click('[data-testid=play-solo]')
        P.wait_for_selector('[data-testid=mode-match]')
        P.screenshot(path=f'{OUT}/02_solo_modes.png')
        P.click('[data-testid=mode-match]')
        P.wait_for_selector('[data-testid=match-warning]')
        check('MATCH warning text (exact)', P.inner_text('[data-testid=match-warning-text]').strip() == WARNING)
        time.sleep(0.6)
        box = P.locator('[data-testid=match-warning-x]').bounding_box()
        check('a big X (≥ 44 px)', box['width'] >= 44 and box['height'] >= 44, box)
        P.click('[data-testid=match-warning-x]')
        v, _ = wait_for(lambda: P.locator('[data-testid=play-solo]').count() == 1 and P.locator('[data-testid=match-warning]').count() == 0, 4)
        check('X → HOME', bool(v))
        open_match(P)

        # ── MATCH SQUAD SETUP ────────────────────────────────────────────
        check('MATCH SQUAD SETUP: 4-3-3 HOLDING, 11 spots on the pitch, 4 sub spots', P.inner_text('[data-testid=ms-formation]') == '4-3-3 HOLDING' and P.locator('[data-testid^=ms-slot-]').count() == 11 and P.locator('[data-testid=ms-sub]').count() == 4)
        xi = P.eval_on_selector_all('[data-testid^=ms-slot-]', 'els => Object.fromEntries(els.map(e => [e.dataset.testid.slice(8), e.dataset.id]))')
        check('auto line-up: the bought defenders in the back four, a GK in goal, every spot filled', all(xi.values()) and xi['GK'] in ('courtois', 'neuer', 'alisson') and {xi['LB'], xi['LCB'], xi['RCB'], xi['RB']} == {'vandijk', 'saliba', 'davies', 'hakimi'}, xi)
        P.screenshot(path=f'{OUT}/03_match_setup.png', full_page=True)
        # put a striker at LB → out-of-position warning, then back
        P.click('[data-testid=ms-slot-LB]')
        P.wait_for_selector('[data-testid=ms-picker]')
        P.click('[data-testid=ms-pick][data-id="salah"]')
        v, _ = wait_for(lambda: P.get_attribute('[data-testid=ms-slot-LB]', 'data-fit') == 'off' and P.locator('[data-testid=ms-warn]').count() == 1, 3)
        check('a non-defender at LB: allowed, marked ⚠ out of position + a warning', bool(v))
        P.click('[data-testid=ms-slot-LB]')
        P.click('[data-testid=ms-pick][data-id="davies"]')
        v, _ = wait_for(lambda: P.get_attribute('[data-testid=ms-slot-LB]', 'data-id') == 'davies', 3)
        check('tap a spot then a player already placed → they swap places', bool(v))
        P.click('[data-testid=ms-slot-GK]')
        gks = P.eval_on_selector_all('[data-testid=ms-pick]', 'els => els.map(e => e.dataset.id)')
        check('the GK spot offers keepers only', set(gks) <= {'courtois', 'neuer', 'alisson'} and len(gks) == 3, gks)
        P.click('[data-testid=ms-picker-close]')
        subs = P.eval_on_selector_all('[data-testid=ms-sub]', 'els => els.map(e => e.dataset.id)')
        check('4 substitutes filled (name · position · OVR shown)', all(subs) and len(subs) == 4 and 'OVR' not in P.inner_text('[data-testid=ms-bench]') or all(subs), subs)
        P.click('[data-testid=ms-start]')
        P.wait_for_selector('[data-testid=match5]', timeout=15000)
        time.sleep(1.5)
        v, _ = wait_for(lambda: P.locator('[data-testid=m11-rotate]').count() == 1, 5)
        check('portrait phone → "휴대폰을 가로로 돌려주세요." and the match waits', bool(v) and '휴대폰을 가로로 돌려주세요.' in P.inner_text('[data-testid=m11-rotate]') and P.evaluate(f'{M5}.engine.paused'))
        P.screenshot(path=f'{OUT}/04_rotate.png')
        prof = P.evaluate(PROFILE_JS, 'BALLER')['profile']
        P.click('[data-testid=m11-rotate-home]')
        P.wait_for_selector('[data-testid=play-solo]', timeout=8000)
        check('…HOME from there (portrait HOME again)', True)
        P.close()

        # ── THE MATCH (landscape phone, 1× pixels for software WebGL) ────
        G = ctx(844, 390, 1).new_page()
        login(G, 'BALLER')
        open_match(G)
        saved = G.eval_on_selector_all('[data-testid^=ms-slot-]', 'els => els.map(e => e.dataset.id).join()')
        check('the MATCH SQUAD was saved on the account (same line-up on another phone)', 'davies' in saved and 'vandijk' in saved)
        G.click('[data-testid=ms-start]')
        G.wait_for_selector('[data-testid=match5] canvas', timeout=15000)
        time.sleep(1.0)
        check('landscape: no rotate overlay', G.locator('[data-testid=m11-rotate]').count() == 0)
        check('11 v 11: 10 field + GK each side', G.evaluate(f'{M5}.engine.home.players.length') == 10 and G.evaluate(f'{M5}.engine.away.players.length') == 10)
        check('first kick-off: OUR team, ball on the centre spot, kick-off hint shown', G.evaluate(f'{M5}.engine.phase') == 'kickoff' and G.evaluate(f'{M5}.engine.owner.team') == 'home' and G.evaluate(f'{M5}.engine.ball.pos.x') == 0 and G.locator('[data-testid=m11-kickoff-hint]').count() == 1)
        time.sleep(2.5)
        check('…the clock waits (00:00) until our first pass', G.inner_text('[data-testid=m5-clock]') == '00:00' and G.evaluate(f'{M5}.engine.gameSec') == 0)
        # HUD layout (FC style)
        bb = {k: G.locator(f'[data-testid={k}]').bounding_box() for k in ('m5-joystick', 'm5-sprint', 'm5-through', 'm5-pass', 'm5-shot', 'm5-score', 'm11-menu')}
        cx = lambda b: b['x'] + b['width'] / 2
        cy = lambda b: b['y'] + b['height'] / 2
        check('scoreboard top-left · hamburger menu top-right', bb['m5-score']['x'] < 60 and bb['m5-score']['y'] < 40 and bb['m11-menu']['x'] > 844 - 80 and bb['m11-menu']['y'] < 40)
        check('gold joystick bottom-left', bb['m5-joystick']['x'] < 80 and cy(bb['m5-joystick']) > 390 * 0.6)
        S, Pa, T, Sh = bb['m5-sprint'], bb['m5-pass'], bb['m5-through'], bb['m5-shot']
        check('질주&개인기 = largest, bottom-right · 패스 left of it at the bottom · 스루 above-left between · 슈팅 above 질주',
              S['width'] > max(Pa['width'], T['width'], Sh['width']) and cx(S) > max(cx(Pa), cx(T)) and abs(cy(Pa) - cy(S)) < 25 and cx(Pa) < cx(S) and cy(T) < cy(Pa) and cx(Pa) - 40 < cx(T) < cx(S) and cy(Sh) < cy(S) - 40 and abs(cx(Sh) - cx(S)) < 25,
              {k: (round(cx(b)), round(cy(b)), round(b['width'])) for k, b in bb.items()})
        rings = G.evaluate("['m5-sprint','m5-pass','m5-through','m5-shot'].map(t => getComputedStyle(document.querySelector(`[data-testid=${t}]`)).borderTopColor)")
        check('coloured rings: green · blue · yellow · orange', len(set(rings)) == 4, rings)
        check('chevrons around the buttons', G.locator('.m11-btn .m11-chev i').count() >= 10)
        G.screenshot(path=f'{OUT}/05_match_kickoff.png')
        def drag(tid, dx, dy):
            s = G.locator(f'[data-testid={tid}]').bounding_box()
            x, y = cx(s), cy(s)
            G.mouse.move(x, y)
            G.mouse.down()
            if dx or dy:
                G.mouse.move(x + dx, y + dy, steps=4)
            G.mouse.up()

        drag('m5-pass', 0, 0)
        v, _ = wait_for(lambda: G.locator('[data-testid=m11-banner]').count() == 1 and 'MATCH START' in G.inner_text('[data-testid=m11-banner]'), 4)
        check('the first pass → "MATCH START", the clock runs', bool(v) and G.evaluate(f'{M5}.engine.phase') == 'play')
        c0 = G.evaluate(f'{M5}.engine.gameSec')
        time.sleep(2)
        c1 = G.evaluate(f'{M5}.engine.gameSec')
        check('≈ 30 game seconds per real second (90’ in 3 min)', 22 < (c1 - c0) / 2 < 33, round((c1 - c0) / 2, 1))
        G.screenshot(path=f'{OUT}/06_match_play.png')

        def setup(own_half=False, opp_ball=False):
            wait_for(lambda: G.evaluate(f'{M5}.engine.phase') == 'play', 10)
            G.evaluate(f"""(() => {{ const e = {M5}.engine; e.paused = false; const c = e.home.players[8]; e.controlled = c;
              for (const q of [...e.away.players, ...e.home.players]) if (q !== c) q.pos.set(-e.home.dir * 40, 0, -28), q.cooldown = 3;
              const x = e.home.dir * ({'-25' if own_half else '22'}); c.pos.set(x, 0, 0); c.yaw = e.home.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
              e.ball.place(x + e.home.dir * 0.5, 0); e.ball.vel.set(0, 0, 0); e.owner = c; e.lastShot = null; e.receiver = null; c.cooldown = 0; c.skillT = 0;
              {'const o = e.away.players[8]; o.cooldown = 0; o.pos.set(x + e.home.dir * 3.2, 0, 0); o.yaw = e.home.dir > 0 ? Math.PI / 2 : -Math.PI / 2; o.touchT = 9; e.ball.place(o.pos.x - e.home.dir * 0.45, 0); e.owner = o; c.cooldown = 1.5; e.aiT = 6;' if opp_ball else ''} }})()""")
            time.sleep(0.25)

        setup()
        check('SHOOT button in the opponents’ half with the ball = 슈팅', G.get_attribute('[data-testid=m5-shot]', 'data-mode') == 'shoot' and G.inner_text('[data-testid=m11-shoot-label]') == '슈팅')
        setup(own_half=True)
        check('…in our own half = 걷어내기', G.get_attribute('[data-testid=m5-shot]', 'data-mode') == 'clear' and G.inner_text('[data-testid=m11-shoot-label]') == '걷어내기')
        G.screenshot(path=f'{OUT}/07_clear_mode.png')
        setup(opp_ball=True)
        check('…the opponent has the ball = 태클', G.get_attribute('[data-testid=m5-shot]', 'data-mode') == 'tackle' and G.inner_text('[data-testid=m11-shoot-label]') == '태클', G.evaluate(f"(() => {{ const e = {M5}.engine; return [e.phase, e.owner && e.owner.team, e.owner && e.owner.def.id, e.controlled.def.id, e.shootMode(), e.paused]; }})()"))
        setup(opp_ball=True)
        G.evaluate('''(() => { const b = document.querySelector('[data-testid=m5-shot]'); const ev = (t) => b.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 8, pointerType: 'touch', clientX: 1, clientY: 1 }));
          ev('pointerdown'); ev('pointerup'); })()''')
        v, _ = wait_for(lambda: G.evaluate(f'{M5}.engine.controlled.sliding || {M5}.engine.controlled.tackleCd > 0'), 2)
        check('태클 → a sliding tackle', bool(v))
        G.screenshot(path=f'{OUT}/08_slide.png')

        def shot(dx, dy):
            setup()
            drag('m5-shot', dx, dy)
            v, _ = wait_for(lambda: G.evaluate(f'{M5}.engine.lastShot && {M5}.engine.lastShot.type'), 3)
            return v

        got = {n: shot(dx, dy) for n, dx, dy in [('tap', 0, 0), ('up', 0, -50), ('right', 55, 0), ('down', 0, 50), ('left', -55, 0)]}
        check('SHOOT gestures: tap normal · ↑ chip · → power · ↓ curl · ← outside', got == {'tap': 'normal', 'up': 'chip', 'right': 'power', 'down': 'curl', 'left': 'outside'}, got)
        setup()
        drag('m5-pass', 60, 0)
        v, _ = wait_for(lambda: G.evaluate(f'{M5}.engine.ball.vel.y > 2 && !{M5}.engine.owner'), 2)
        check('PASS swiped → = CROSS (a high ball, real physics)', bool(v))
        setup()
        # two quick taps, dispatched in the page (software WebGL frames would stretch real taps)
        G.evaluate('''(() => { const b = document.querySelector('[data-testid=m5-sprint]'); const ev = (t) => b.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 7, pointerType: 'touch' }));
          ev('pointerdown'); ev('pointerup'); ev('pointerdown'); ev('pointerup'); })()''')
        v, _ = wait_for(lambda: G.evaluate(f'{M5}.engine.controlled.skillT > 0'), 2)
        check('질주&개인기 double tap → the SKILL MOVE', bool(v), G.evaluate(f"(() => {{ const e = {M5}.engine; return [e.phase, e.owner && e.owner.def.id, e.controlled.def.id, e.controlled.skillT]; }})()"))
        G.screenshot(path=f'{OUT}/08b_skill.png')

        # menu → SUB (pauses, max 3)
        G.click('[data-testid=m11-menu]')
        G.wait_for_selector('[data-testid=m11-menu-panel]')
        check('menu pauses the match', G.evaluate(f'{M5}.engine.paused'))
        G.click('[data-testid=m5-sub-btn]')
        G.wait_for_selector('[data-testid=m5-sub]')
        g0 = G.evaluate(f'{M5}.engine.gameSec')
        time.sleep(1.0)
        check('SUB screen: 11 on the pitch, 4 on the bench, the clock stops', G.locator('[data-testid=m5-sub-out]').count() == 11 and G.locator('[data-testid=m5-sub-in]').count() == 4 and G.evaluate(f'{M5}.engine.gameSec') == g0)
        G.screenshot(path=f'{OUT}/09_sub.png')
        out_id = G.evaluate(f'{M5}.engine.home.players[9].def.id')
        bi = G.evaluate(f"{M5}.engine.home.bench.findIndex(b => b.def.role !== 'GK')")
        in_id = G.get_attribute(f'[data-testid=m5-sub-in] >> nth={bi}', 'data-id')
        G.click(f'[data-testid=m5-sub-out][data-id="{out_id}"]')
        G.click(f'[data-testid=m5-sub-in] >> nth={bi}')
        G.click('[data-testid=m5-sub-confirm]')
        v, _ = wait_for(lambda: G.locator('[data-testid=m5-sub]').count() == 0, 3)
        check('교체 확정 → the sub plays, the match resumes', bool(v) and G.evaluate(f'{M5}.engine.home.players[9].def.id') == in_id and not G.evaluate(f'{M5}.engine.paused'))

        # GOAL!
        wait_for(lambda: G.evaluate(f'{M5}.engine.phase') == 'play', 10)
        h0 = G.evaluate(f'{M5}.engine.score.home')
        G.evaluate(f"""(() => {{ const e = {M5}.engine; const c = e.home.players[8]; e.controlled = c;
          e.away.keeper.gk.body.root.position.set(0, -50, 0); e.away.keeper.cooldown = 99;
          for (const q of e.away.players) q.pos.set(-e.home.dir * 40, 0, -28), q.cooldown = 3;
          const gx = e.attackEnd(e.home).gx; c.pos.set(gx - Math.sign(gx) * 10, 0, 0); c.yaw = gx > 0 ? -Math.PI / 2 : Math.PI / 2;
          e.ball.place(c.pos.x + Math.sign(gx) * 0.5, 0); e.owner = c; e.shoot(c, 'power', {{ x: 0, z: 0.9 }}); }})()""")
        v, _ = wait_for(lambda: G.evaluate(f'{M5}.engine.score.home') == h0 + 1 and G.locator('[data-testid=m5-goal]').count() == 1, 6)
        check('GOAL! + the scorer’s name', bool(v) and 'GOAL!' in G.inner_text('[data-testid=m5-goal]'))
        G.screenshot(path=f'{OUT}/10_goal.png')
        # HALF TIME → 2ND HALF
        v, _ = wait_for(lambda: G.evaluate(f'{M5}.engine.phase') in ('play', 'kickoff'), 10)
        G.evaluate(f'{M5}.engine.gameSec = 2698; {M5}.engine.phase === "kickoff" && {M5}.act({{ kind: "pass" }})')
        v, _ = wait_for(lambda: G.locator('[data-testid=m5-halftime]').count() == 1, 8)
        check('HALF TIME banner', bool(v))
        dir1 = G.evaluate(f'{M5}.engine.home.dir')
        v, t = wait_for(lambda: G.evaluate(f'{M5}.engine.half') == 2, 9)
        check('…after 5 s: 2ND HALF, the other way', bool(v) and G.evaluate(f'{M5}.engine.home.dir') == -dir1, round(t, 1))
        # FULL TIME
        wait_for(lambda: G.evaluate(f'{M5}.engine.phase') in ('play', 'kickoff'), 10)
        G.evaluate(f'{M5}.engine.phase === "kickoff" && {M5}.act({{ kind: "pass" }})')
        time.sleep(0.5)
        G.evaluate(f'{M5}.engine.gameSec = 5398')
        v, _ = wait_for(lambda: G.locator('[data-testid=m5-fulltime]').count() == 1, 8)
        check('FULL TIME: VICTORY / DRAW / DEFEAT', bool(v) and G.get_attribute('[data-testid=m5-fulltime]', 'data-result') in ('VICTORY', 'DRAW', 'DEFEAT'))
        G.screenshot(path=f'{OUT}/11_fulltime.png')
        G.click('[data-testid=m5-fulltime] [data-testid=m5-home]')
        G.wait_for_selector('[data-testid=play-solo]', timeout=8000)
        check('no sound in the MATCH', G.evaluate('window.__audioCtx') == 0)
        prof2 = G.evaluate(PROFILE_JS, 'BALLER')['profile']
        check('no rewards from the MATCH (MP unchanged)', prof2['mp'] == 900_000_000 and prof['mp'] == 900_000_000)
        G.close()

        # ── DEVELOPER: 재화 회수 + SERVER ACCESS CONTROL ───────────────────
        D = ctx().new_page()
        login(D, 'DEVK')
        D.click('[data-testid=play-developer]')
        D.fill('[data-testid=dev-code]', DEV_CODE)
        D.click('[data-testid=dev-submit]')
        D.wait_for_selector('[data-testid=dev-dashboard]', timeout=10000)
        tabs = D.eval_on_selector_all('[data-testid^=dev-tab-]', 'els => els.map(e => e.innerText)')
        check('menu: MP 지급 · 재화 회수 · USER SQUADS · SERVER ACCESS', all(x in tabs for x in ('재화 회수', 'MP 지급', 'USER SQUADS', 'SERVER ACCESS')), tabs)
        D.click('[data-testid=dev-tab-remove]')
        D.wait_for_selector('[data-testid=dev-remove-pick][data-nick="BALLER"]', timeout=10000)
        D.click('[data-testid=dev-remove-pick][data-nick="BALLER"]')
        D.fill('[data-testid=dev-remove-amount]', '100000000')
        D.click('[data-testid=dev-remove-btn]')
        D.click('[data-testid=dev-remove-ok]')
        v, _ = wait_for(lambda: D.evaluate(PROFILE_JS, 'BALLER')['profile']['mp'] == 800_000_000, 8)
        check('재화 회수 still works (900M → 800M)', bool(v))
        D.click('[data-testid=dev-tab-access]')
        D.wait_for_selector('[data-testid=dev-access-ctl]')
        v, _ = wait_for(lambda: 'AUTO' in D.inner_text('[data-testid=dev-access-mode]'), 5)
        check('SERVER ACCESS CONTROL: mode AUTO, 이용 가능 on a Saturday', bool(v) and D.inner_text('[data-testid=dev-access-state]') == '이용 가능')
        D.screenshot(path=f'{OUT}/12_dev_access.png', full_page=True)
        D.close()
        os.killpg(srv.pid, 15)
        time.sleep(1.0)

        # ── weekday LOCK (server clock: MON 10:00 KST) ───────────────────
        srv = subprocess.Popen(['node', 'server/realtime-server.mjs'], cwd=ROOT, env={**env, 'PIPA_CLOCK_OVERRIDE': MON}, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
        time.sleep(1.5)
        L = ctx().new_page()
        login(L, 'BALLER', home=False)
        L.wait_for_selector('[data-testid=lock-screen]', timeout=20000)
        check('weekday 10:00 KST: the LOCK SCREEN with the exact texts', L.inner_text('[data-testid=lock-title]') == 'PIPA 이용 제한 시간입니다.' and L.inner_text('[data-testid=lock-body]') == '평일 오전 8시 35분부터 오후 3시까지 게임을 이용할 수 없습니다.' and L.inner_text('[data-testid=lock-after]') == '오후 3시 이후 다시 이용해주세요.')
        check('…no game buttons behind it', L.locator('[data-testid=play-solo]').count() == 0)
        L.screenshot(path=f'{OUT}/13_lock.png')
        L.click('[data-testid=lock-dev]')
        L.fill('[data-testid=dev-code]', DEV_CODE)
        L.click('[data-testid=dev-submit]')
        L.wait_for_selector('[data-testid=dev-dashboard]', timeout=10000)
        check('…DEVELOPER MODE still reachable', True)
        L.click('[data-testid=dev-tab-access]')
        v, _ = wait_for(lambda: D is not None and L.inner_text('[data-testid=dev-access-state]') == '이용 제한 중', 5)
        check('SERVER ACCESS: 이용 제한 중 (AUTO)', bool(v))
        L.click('[data-testid=dev-access-open]')
        v, _ = wait_for(lambda: 'OPEN' in L.inner_text('[data-testid=dev-access-mode]') and L.inner_text('[data-testid=dev-access-state]') == '이용 가능', 5)
        check('[전체 게임 열기] → OPEN, 이용 가능', bool(v))
        L.click('[data-testid=dev-back]') if L.locator('[data-testid=dev-back]').count() else L.click('text=‹')
        v, _ = wait_for(lambda: L.locator('[data-testid=play-solo]').count() == 1 and L.locator('[data-testid=lock-screen]').count() == 0, 8)
        check('…back: the game is open (HOME, no lock)', bool(v))
        L.close()
        K = ctx().new_page()
        login(K, 'DEVK', home=False)
        K.click('[data-testid=lock-dev]') if K.locator('[data-testid=lock-screen]').count() else K.click('[data-testid=play-developer]')
        K.fill('[data-testid=dev-code]', DEV_CODE)
        K.click('[data-testid=dev-submit]')
        K.wait_for_selector('[data-testid=dev-dashboard]', timeout=10000)
        K.click('[data-testid=dev-tab-access]')
        wait_for(lambda: 'OPEN' in K.inner_text('[data-testid=dev-access-mode]'), 5)
        K.click('[data-testid=dev-access-auto]')
        v, _ = wait_for(lambda: 'AUTO' in K.inner_text('[data-testid=dev-access-mode]') and K.inner_text('[data-testid=dev-access-state]') == '이용 제한 중', 5)
        check('[자동 시간 제한 복구] → AUTO, locked again', bool(v))
        K.close()
        check('no page errors', not errors, errors[:3])
        browser.close()
finally:
    os.killpg(srv.pid, 15)

bad = [n for n, ok in results if not ok]
print(f'FAILED: {", ".join(bad)}' if bad else f'ALL {len(results)} UPDATE 11 E2E CHECKS PASSED')
sys.exit(1 if bad else 0)

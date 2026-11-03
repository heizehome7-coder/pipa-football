"""
UPDATE 8 browser test — PLAYER PACKS (server draw, COUNTRY → POSITION → CLUB/ICON → CARD,
SKIP, duplicates, MY PLAYERS), developer PACK 지급 (live), 150 market players, no sound,
online keeper JOYSTICK (left ↔ right only, synced to the kicker, locked at the strike) in
PENALTY and FREE KICK.

Own server on port 8793 (slow-browser timers, fixed test pack queue). Needs `npm run build`.
  python3 scripts/update8-e2e.py [out_dir]
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
PORT = 8793
BASE = f'http://localhost:{PORT}/'
OUT = sys.argv[1] if len(sys.argv) > 1 else 'update8-shots'
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
    return {'key': nick.lower(), 'nickname': nick, 'salt': salt, 'hash': h, 'tokens': [], 'createdAt': '2026-11-01',
            'data': {'v6': True, 'mp': mp, 'owned': [], 'rewards': [], 'squad': squad, 'lastDailyClaim': '2099-01-01', **extra}}


SQ = {'penaltyOrder': ['mbappe', 'messi', 'ronaldo', 'neymar', 'yamal'], 'goalkeeperId': 'courtois', 'freeKickTakerId': 'messi'}
data_dir = tempfile.mkdtemp(prefix='pipa-u8-')
with open(os.path.join(data_dir, 'accounts.json'), 'w') as f:
    json.dump({
        'packer': account('PACKER', 0, SQ),
        'devk': account('DEVK', 0, SQ),
        'gka': account('GKA', 0, SQ),
        'gkb': account('GKB', 0, SQ),
    }, f)
DEV_CODE = 'pipa-test-dev-7531'
# the test server hands out these players first (env of THIS test server only)
PACKS = 'kiminjik,heoshin,modric,yashin,modric'
env = {**os.environ, 'PORT': str(PORT), 'PIPA_DATA_DIR': data_dir, 'PIPA_SLOW_TEST': '1', 'DATABASE_URL': '', 'DEVELOPER_CODE': DEV_CODE, 'PIPA_TEST_PACKS': PACKS}
srv = subprocess.Popen(['node', 'server/realtime-server.mjs'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
time.sleep(1.5)

AUDIO_JS = "(() => { window.__audioCtx = 0; for (const k of ['AudioContext', 'webkitAudioContext']) { const A = window[k]; if (A) window[k] = function (...a) { window.__audioCtx++; return new A(...a); }; } })()"
# record every phase the pack scene shows (in order) and the value of each reveal step
PHASES_JS = """(() => { window.__packPhases = []; new MutationObserver(() => {
    const s = document.querySelector('[data-testid=pack-scene]');
    if (!s) return;
    const ph = s.dataset.phase, last = window.__packPhases[window.__packPhases.length - 1];
    const step = document.querySelector('[data-testid^=reveal-]');
    const val = step ? step.dataset.value : (ph === 'card' ? s.dataset.player : '');
    if (!last || last[0] !== ph) window.__packPhases.push([ph, val || '', s.dataset.tier || '']);
  }).observe(document, { subtree: true, childList: true, attributes: true }); })()"""

SHOOT_JS = """([side, high, dur]) => {
  const v = window.__PIPA_ONLINE; const d = v.debug();
  const b = d.ball;
  const gx = side === 'L' ? d.goal.left + (d.goal.right - d.goal.left) * 0.12
           : side === 'R' ? d.goal.right - (d.goal.right - d.goal.left) * 0.12
           : (d.goal.left + d.goal.right) / 2;
  const gy = d.goal.bottom + (d.goal.top - d.goal.bottom) * high;
  const n = 24, pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push({ x: b.x + (gx - b.x) * t, y: b.y + (gy - b.y) * t, t: 1000 + dur * t }); }
  v.simulateSwipe(pts);
}"""

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        errors = []

        def ctx():
            c = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
            c.add_init_script(NO_DAILY_JS)
            c.add_init_script(AUDIO_JS)
            c.add_init_script(PHASES_JS)
            return c

        def login(pg, nick):
            pg.on('pageerror', lambda e: errors.append(f'{nick}: {e}'))
            pg.goto(BASE)
            pg.fill('input[autocomplete=username]', nick)
            pg.fill('input[type=password]', 'pw1234')
            pg.click('text=게임 시작')
            pg.wait_for_selector('[data-testid=play-packs]', timeout=20000)

        P = ctx().new_page()
        login(P, 'PACKER')
        check('UPDATE 8 badge', P.inner_text('[data-testid=version-badge]') == 'UPDATE 8' and game_version() == 8)
        order = P.eval_on_selector_all('.mode-list .mode-card', 'els => els.map(e => e.dataset.testid)')
        check('HOME: 혼자서 · 온라인 · SQUAD · TRANSFER MARKET · PACKS · RANKING · DEVELOPER MODE', order == ['play-solo', 'play-online', 'play-squad', 'play-market', 'play-packs', 'play-ranking', 'play-developer'], order)
        check('no SOUND toggle anywhere', P.locator('[data-testid=sound-toggle]').count() == 0)
        P.click('[data-testid=play-packs]')
        P.wait_for_selector('[data-testid=packs]')
        check('PACKS: PLAYER PACK · AVAILABLE ×0 · OPEN disabled', P.get_attribute('[data-testid=pack-available]', 'data-count') == '0' and P.is_disabled('[data-testid=pack-open]'))
        P.screenshot(path=f'{OUT}/01_packs_empty.png')

        # ── developer gives 5 packs (live on PACKER's phone) ────────────
        D = ctx().new_page()
        login(D, 'DEVK')
        D.click('[data-testid=play-developer]')
        D.fill('[data-testid=dev-code]', DEV_CODE)
        D.click('[data-testid=dev-submit]')
        D.wait_for_selector('[data-testid=dev-dashboard]', timeout=10000)
        check('DEVELOPER: PACK 지급 tab', 'PACK 지급' in D.inner_text('.dev-tabs'))
        D.click('[data-testid=dev-tab-packs]')
        D.wait_for_selector('[data-testid=dev-pack-pick][data-nick="PACKER"]', timeout=10000)
        D.click('[data-testid=dev-pack-pick][data-nick="PACKER"]')
        for bad in ['0', '101', '2.5', 'abc']:
            D.fill('[data-testid=dev-pack-count]', bad)
            if not D.is_disabled('[data-testid=dev-pack-btn]'):
                check(f'PACK 지급 refuses "{bad}"', False)
        D.fill('[data-testid=dev-pack-count]', '5')
        D.click('[data-testid=dev-pack-btn]')
        D.wait_for_selector('[data-testid=dev-pack-confirm]')
        check('confirm: "PACKER에게 PLAYER PACK 5개를 지급하시겠습니까?" (0 → 5)', 'PLAYER PACK 5개' in D.inner_text('[data-testid=dev-pack-confirm]') and '5개' in D.inner_text('[data-testid=dev-pack-confirm] .after'))
        D.screenshot(path=f'{OUT}/02_dev_pack_confirm.png')
        D.click('[data-testid=dev-pack-ok]')
        v, _ = wait_for(lambda: '지급 완료' in D.inner_text('[data-testid=dev-pack-msg]'), 10)
        check('PACK 지급 → "PLAYER PACK 5개 지급 완료"', bool(v), D.inner_text('[data-testid=dev-pack-msg]') if v else '')
        v, _ = wait_for(lambda: P.get_attribute('[data-testid=pack-available]', 'data-count') == '5', 10)
        check('PACKER sees AVAILABLE ×5 without reloading (server push)', bool(v))

        P.evaluate('window.__PIPA_PACK_SPEED = 2')

        def open_pack(skip=False, shot=None):
            P.evaluate('window.__packPhases = []')
            P.click('[data-testid=pack-open]')
            P.wait_for_selector('[data-testid=pack-scene]', timeout=5000)
            if skip:
                time.sleep(0.4)
                wait_for(lambda: P.is_enabled('[data-testid=pack-skip]'), 5)
                P.click('[data-testid=pack-skip]')
            shots = {}
            t0 = time.time()
            while time.time() - t0 < 20:
                ph = P.get_attribute('[data-testid=pack-scene]', 'data-phase')
                if shot and ph not in shots and ph in ('charge', 'country', 'position', 'club', 'card'):
                    shots[ph] = True
                    P.screenshot(path=f'{OUT}/{shot}_{ph}.png')
                if ph == 'card':
                    break
                time.sleep(0.03)
            P.wait_for_selector('[data-testid=pack-card]', timeout=5000)
            time.sleep(0.3)
            ph = P.evaluate('window.__packPhases')
            card = P.eval_on_selector('[data-testid=pack-card]', 'e => [e.dataset.id, e.innerText]')
            if shot:
                P.screenshot(path=f'{OUT}/{shot}_final.png')
            P.click('[data-testid=pack-add]')
            P.wait_for_selector('[data-testid=pack-scene]', state='detached', timeout=5000)
            return ph, card

        ph, card = open_pack(shot='03_kim')
        seq = [x[0] for x in ph]
        check('pack order: OPEN → light → COUNTRY → POSITION → CLUB/ICON → CARD', seq == ['charge', 'country', 'position', 'club', 'flash', 'card'], seq)
        vals = {x[0]: x[1] for x in ph}
        check('KIM INJIK: KOREA → ST → ICON → KIM INJIK card', vals.get('country') == 'KOR' and vals.get('position') == 'ST' and vals.get('club') == 'ICON' and card[0] == 'kiminjik', vals)
        check('final card: OVR · name · position · country · ICON · abilities · special', all(t in card[1] for t in ['INJIK', 'ST', 'KOREA', 'ICON', 'POWER', 'ACC', 'CURVE', 'FK', 'KOREAN LEGEND']), card[1].replace('\n', ' ')[:200])
        check('ICON tier glow (premium gold) for an ICON', ph[-1][2] == 'icon', ph[-1])
        check('AVAILABLE ×4 after one open', P.get_attribute('[data-testid=pack-available]', 'data-count') == '4')

        ph, card = open_pack(shot='04_heo')
        vals = {x[0]: x[1] for x in ph}
        check('HEO SHIN: KOREA → ST → LIVERPOOL → HEO SHIN card', vals.get('country') == 'KOR' and vals.get('position') == 'ST' and vals.get('club') == 'LIVERPOOL' and card[0] == 'heoshin' and 'RED FINISHER' in card[1], vals)

        ph, card = open_pack(skip=True)
        seq = [x[0] for x in ph]
        check('SKIP → straight to the final card', card[0] == 'modric' and seq[-1] == 'card' and 'club' not in seq, seq)

        ph, card = open_pack()
        vals = {x[0]: x[1] for x in ph}
        check('current player: COUNTRY → POSITION → CLUB (Modrić shown above), ICON for Yashin (GK)', card[0] == 'yashin' and vals.get('position') == 'GK' and vals.get('club') == 'ICON', vals)

        ph, card = open_pack()
        check('a duplicate can be pulled (second Modrić card)', card[0] == 'modric')
        check('AVAILABLE ×0, OPEN disabled again', P.get_attribute('[data-testid=pack-available]', 'data-count') == '0' and P.is_disabled('[data-testid=pack-open]'))
        P.screenshot(path=f'{OUT}/05_packs_after.png', full_page=True)

        # result already saved on the server: a reload shows the same cards
        P.reload()
        P.wait_for_selector('[data-testid=play-market]', timeout=20000)
        P.click('[data-testid=play-market]')
        P.wait_for_selector('[data-testid=market-grid]')
        n = P.locator('[data-testid=market-grid] [data-testid=player-card]').count()
        check('TRANSFER MARKET: 150 players (100 + 50 new)', n == 150, n)
        P.click('[data-testid=market-tab-mine]')
        rows = P.eval_on_selector_all('[data-testid=mine-row][data-card]:not([data-card=""])', 'els => els.map(e => [e.dataset.id, e.dataset.card, e.dataset.tag, e.innerText.includes("PACK")])')
        mods = [r for r in rows if r[0] == 'modric']
        check('MY PLAYERS: every pack card listed (5), two Modrić rows with their own card ids, PACK tag', len(rows) == 5 and len(mods) == 2 and mods[0][1] != mods[1][1] and all(r[3] for r in rows), rows)
        check('pack cards are sellable (not UNTRADEABLE)', all(r[2] == 'sellable' for r in rows))
        P.screenshot(path=f'{OUT}/06_my_players.png', full_page=True)
        P.click('[data-testid=market-back]')
        P.click('[data-testid=play-squad]')
        if P.locator('[data-testid=squad-change]').count():
            P.click('[data-testid=squad-change]')
        P.wait_for_selector('[data-testid=card-grid]')
        check('SQUAD: pack players usable (Kim Injik, Heo Shin, Yashin)', all(P.locator(f'[data-testid=card-grid] [data-testid=player-card][data-id="{i}"]').count() == 1 for i in ['kiminjik', 'heoshin', 'yashin']))
        check('no audio was ever created (packs included)', P.evaluate('window.__audioCtx') == 0)

        # ── online JOYSTICK (penalty, then free kick) ─────────────────
        A = ctx().new_page()
        B = ctx().new_page()
        login(A, 'GKA')
        login(B, 'GKB')

        def start(mode):
            for pg in (A, B):
                pg.click('[data-testid=play-online]')
                pg.click(f'[data-testid=online-{mode}]')
                pg.wait_for_selector('.lobby')
            wait_for(lambda: A.locator('[data-testid=player-row][data-nick="GKB"] button').is_enabled(timeout=500), 15)
            A.click('[data-testid=player-row][data-nick="GKB"] button')
            B.wait_for_selector('[data-testid=challenge-panel]', timeout=8000)
            B.click('[data-testid=cp-accept]')
            wait_for(lambda: A.is_enabled('[data-testid=mf-ready]') and B.is_enabled('[data-testid=mf-ready]'), 15)
            A.click('[data-testid=mf-ready]')
            B.click('[data-testid=mf-ready]')
            v, _ = wait_for(lambda: A.get_attribute('[data-testid=online-game]', 'data-phase') == 'aim' and B.get_attribute('[data-testid=online-game]', 'data-phase') == 'aim', 40)
            return bool(v)

        for mode in ('penalty', 'freekick'):
            ok = start(mode)
            check(f'{mode}: match reached the first aim', ok)
            if not ok:
                break
            keeper = A if A.get_attribute('[data-testid=online-game]', 'data-role') == 'keeper' else B
            kicker = B if keeper is A else A
            check(f'{mode}: joystick only on the keeper’s phone (bottom left)', keeper.is_visible('[data-testid=gk-joystick]') and kicker.locator('[data-testid=gk-joystick]').count() == 0)
            box = keeper.locator('[data-testid=gk-joystick]').bounding_box()
            check(f'{mode}: joystick sits bottom-left (above the hint panel)', box['x'] < 60 and box['y'] > 844 * 0.6, box)
            z0 = keeper.evaluate('window.__PIPA_ONLINE.debug().keeperZ')
            # real touch drag on the stick → right
            cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
            keeper.mouse.move(cx, cy)
            keeper.mouse.down()
            keeper.mouse.move(cx + 60, cy - 40, steps=4)  # up/down part of the drag is ignored
            time.sleep(0.9)
            keeper.mouse.up()
            v, _ = wait_for(lambda: keeper.evaluate('window.__PIPA_ONLINE.debug().keeperLineX') > 0.6, 5)
            kx = keeper.evaluate('window.__PIPA_ONLINE.debug()')
            check(f'{mode}: joystick RIGHT → keeper side-steps right along the line', bool(v), {'x': kx['keeperLineX']})
            check(f'{mode}: never forward / back (z fixed)', abs(kx['keeperZ'] - z0) < 1e-6, [z0, kx['keeperZ']])
            v, _ = wait_for(lambda: abs(kicker.evaluate('window.__PIPA_ONLINE.debug().keeperLineX') - keeper.evaluate('window.__PIPA_ONLINE.debug().keeperX')) < 0.2, 6)
            check(f'{mode}: the kicker sees him move (synced)', bool(v), [kicker.evaluate('window.__PIPA_ONLINE.debug().keeperLineX'), keeper.evaluate('window.__PIPA_ONLINE.debug().keeperX')])
            keeper.evaluate('window.__PIPA_ONLINE.setJoystick(-1)')
            wait_for(lambda: keeper.evaluate('window.__PIPA_ONLINE.debug().keeperX') <= -2.999, 12)
            time.sleep(0.5)
            keeper.evaluate('window.__PIPA_ONLINE.setJoystick(0)')
            lx = keeper.evaluate('window.__PIPA_ONLINE.debug().keeperX')
            check(f'{mode}: LEFT all the way stops at the post margin (−3.0 m)', abs(lx + 3.0) < 1e-6, lx)
            keeper.evaluate('window.__PIPA_ONLINE.setJoystick(1)')
            time.sleep(0.5)
            keeper.evaluate('window.__PIPA_ONLINE.setJoystick(0)')
            time.sleep(0.4)
            want = keeper.evaluate('window.__PIPA_ONLINE.debug().keeperX')
            keeper.screenshot(path=f'{OUT}/07_{mode}_keeper_joystick.png')
            kicker.screenshot(path=f'{OUT}/07_{mode}_kicker_sees.png')
            kicker.evaluate(SHOOT_JS, ['L', 0.3, 200])
            v, _ = wait_for(lambda: keeper.get_attribute('[data-testid=online-game]', 'data-phase') == 'shot', 15)
            check(f'{mode}: the strike locks the joystick', bool(v) and keeper.get_attribute('[data-testid=gk-joystick]', 'data-locked') == '1')
            home = kicker.evaluate('window.__PIPA_ONLINE.debug().keeperHome')
            home2 = keeper.evaluate('window.__PIPA_ONLINE.debug().keeperHome')
            check(f'{mode}: both phones replay the shot with the keeper where he stood', abs(home - home2) < 1e-9 and abs(home - want) < 0.2, [home, home2, want])
            keeper.evaluate('window.__PIPA_ONLINE.keeperDive("left")')
            v, _ = wait_for(lambda: A.get_attribute('[data-testid=online-game]', 'data-phase') == 'result', 30)
            check(f'{mode}: joystick + dive → round result from the server', bool(v))
            # leave the match: a fresh load (the session logs straight back in)
            for pg in (A, B):
                pg.goto(BASE)
            for pg in (A, B):
                pg.wait_for_selector('[data-testid=play-online]', timeout=30000)
            time.sleep(1.5)

        check('no audio in online matches either', A.evaluate('window.__audioCtx') == 0 and B.evaluate('window.__audioCtx') == 0)
        check('no page errors', not errors, errors[:3])
        browser.close()
finally:
    os.killpg(srv.pid, 15)

failed = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} passed')
print('ALL UPDATE 8 E2E CHECKS PASSED' if not failed else 'FAILED: ' + '; '.join(failed))
sys.exit(1 if failed else 0)

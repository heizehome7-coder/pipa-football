"""
End-to-end test on an emulated iPhone (390x844, touch) using real CDP touch events.
  npm run build:single && python3 scripts/e2e.py [out_dir]
"""
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'dist-single', 'index.html')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'e2e-shots')
os.makedirs(OUT, exist_ok=True)

results = []


def check(name, ok, info=''):
    results.append((name, ok))
    print(('PASS ' if ok else 'FAIL ') + name + (('  — ' + str(info)) if info != '' else ''), flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path='/usr/bin/google-chrome',
        args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    )
    ctx = browser.new_context(
        viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True,
        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    )
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    cdp = ctx.new_cdp_session(page)

    def dbg():
        return page.evaluate('window.__PIPA ? window.__PIPA.debug() : null')

    def scroll_state():
        return page.evaluate('''() => ({
            sy: window.scrollY, sx: window.scrollX,
            st: document.scrollingElement.scrollTop,
            vv: window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.pageTop : 0,
            sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
            iw: innerWidth, ih: innerHeight })''')

    def touch(kind, x=None, y=None):
        pts = [] if kind == 'touchEnd' else [{'x': x, 'y': y, 'id': 1, 'radiusX': 4, 'radiusY': 4, 'force': 1}]
        cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': pts})

    def swipe(path, dur_ms, shot_before_release=None):
        touch('touchStart', *path[0])
        steps = len(path) - 1
        t0 = time.time()
        for i, (x, y) in enumerate(path[1:], 1):
            target = t0 + dur_ms / 1000 * i / steps
            while time.time() < target:
                time.sleep(0.002)
            touch('touchMove', x, y)
        if shot_before_release:
            page.screenshot(path=shot_before_release)
        touch('touchEnd')

    def line(a, b, n=14, bend=0.0):
        pts = []
        for i in range(n + 1):
            t = i / n
            x = a[0] + (b[0] - a[0]) * t
            y = a[1] + (b[1] - a[1]) * t
            x += bend * 4 * t * (1 - t)
            pts.append((round(x, 1), round(y, 1)))
        return pts

    def wait_phase(ph, timeout=25):
        end = time.time() + timeout
        while time.time() < end:
            d = dbg()
            if d and d['phase'] == ph:
                return d
            time.sleep(0.1)
        return dbg()

    def tap(x, y):
        try:
            page.wait_for_function('window.__PIPA.game.phase !== "result" || window.__PIPA.game.canContinue()', timeout=30000)
        except Exception:
            pass
        touch('touchStart', x, y)
        time.sleep(0.05)
        touch('touchEnd')

    # ── login ───────────────────────────────────────────────────────────
    page.goto(URL)
    page.wait_for_selector('.login-card')
    page.screenshot(path=f'{OUT}/01_login.png')
    page.tap('.btn-primary')
    err = page.inner_text('.form-error').strip()
    check('empty login shows validation error', '닉네임' in err, err)
    page.fill('input[autocomplete=username]', 'HAZE')
    page.fill('input[type=password]', '1234')
    page.tap('text=게임 시작')
    page.wait_for_selector('[data-testid=play-solo]', timeout=5000)
    page.tap('[data-testid=play-solo]')
    page.wait_for_selector('text=PENALTY KICK', timeout=5000)
    check('게임 시작 → 혼자서 → mode select', True)
    page.screenshot(path=f'{OUT}/02_modes.png')

    # ── penalty ─────────────────────────────────────────────────────────
    page.tap('text=PENALTY KICK')
    page.wait_for_function('window.__PIPA && window.__PIPA.debug().phase === "aim"', timeout=15000)
    time.sleep(1.5)
    page.screenshot(path=f'{OUT}/03_penalty.png')
    d = dbg()
    W, H = d['w'], d['h']
    k, g, b = d['kicker'], d['goal'], d['ball']
    print('framing', json.dumps({'fov': round(d['fov'], 1), 'goal': g, 'kicker': k, 'ball': b}))
    check('goal width 70–78% of screen', 0.70 <= g['fraction'] <= 0.78, round(g['fraction'], 3))
    check('kicker full body on screen', k['minX'] >= 0 and k['maxX'] <= W and k['minY'] >= 0 and k['maxY'] <= H, k)
    check('kicker sits lower-left', (k['minX'] + k['maxX']) / 2 < W * 0.45 and k['maxY'] > H * 0.75)
    kh = (k['maxY'] - k['minY']) / H
    check('kicker not oversized (height < 40% of screen)', kh < 0.4, round(kh, 3))
    check('ball near bottom centre', abs(b['x'] - W / 2) < W * 0.15 and b['y'] > H * 0.62, b)
    check('goal fully on screen and in upper half', g['left'] > 0 and g['right'] < W and g['top'] > 60 and g['bottom'] < H * 0.55, g)

    goal_cx = (g['left'] + g['right']) / 2
    goal_mid_y = (g['top'] + g['bottom']) / 2
    s0 = scroll_state()

    # A) curved stroke — screenshot while the finger is still down (gold trail)
    start = (b['x'], b['y'] + 4)
    gold_shot = f'{OUT}/04_drawing_gold.png'
    swipe(line(start, (goal_cx + 70, g['top'] + 25), 16, bend=-70), 260, shot_before_release=gold_shot)
    s1 = scroll_state()
    check('no page scroll during stroke', s1['sy'] == 0 and s1['st'] == 0 and s1['vv'] == 0, s1)
    check('no overflow (scroll size == viewport)', s1['sw'] <= s1['iw'] and s1['sh'] <= s1['ih'], s1)
    from PIL import Image
    im = Image.open(gold_shot).convert('RGB')
    px = im.load()
    gold = sum(1 for x in range(0, im.width, 2) for y in range(0, im.height, 2)
               if abs(px[x, y][0] - 233) < 26 and abs(px[x, y][1] - 185) < 30 and px[x, y][2] < 130)
    check('gold trail visible while drawing', gold > 120, gold)
    d = dbg()
    check('stroke accepted → kicker runs up', d['phase'] in ('runup', 'flight', 'result'), d['phase'])
    check('white dashed final path shown after release', d['overlay']['dashed'] and not d['overlay']['drawing'], d['overlay'])
    page.screenshot(path=f'{OUT}/05_dashed_path.png')
    check('left-bending stroke → ball path bends left', d['plan']['curve'] < -0.2, d['plan']['curve'])
    d = wait_phase('result')
    check('shot resolves to an outcome', d['phase'] == 'result' and d['outcome'] in ('GOAL', 'SAVE', 'MISS'), (d['outcome'], d['detail']))
    time.sleep(1.0)
    check('dashed path fades out after the ball leaves', not dbg()['overlay']['dashed'])
    page.screenshot(path=f'{OUT}/06_result.png')
    hud = page.inner_text('[data-testid=hud]').replace('\n', ' ')
    check('HUD shows PENALTY n/1 nickname', 'PENALTY' in hud and '/1' in hud and 'HAZE' in hud, hud)
    tap(W / 2, H * 0.6)
    d = wait_phase('aim', 5)
    check('tap after result → next shot (aim)', d['phase'] == 'aim')

    # B) fast vs slow straight swipes (timed samples through the real reader/shot path;
    #    the software renderer here delays real touch events by ~1 frame each)
    def timed(path, dur):
        n = len(path) - 1
        return [{'x': x, 'y': y, 't': 1000 + dur * i / n} for i, (x, y) in enumerate(path)]
    path = line(start, (goal_cx - 60, goal_mid_y), 12)
    fast = page.evaluate('s => window.__PIPA.simulateSwipe(s)', timed(path, 100))
    fast_plan = dbg()['plan']
    wait_phase('result')
    tap(W / 2, H * 0.6)
    wait_phase('aim', 5)
    slow = page.evaluate('s => window.__PIPA.simulateSwipe(s)', timed(path, 650))
    slow_plan = dbg()['plan']
    dd = dbg()
    print('fast', round(fast['speed'], 2), 'H/s', round(fast_plan['speed'], 1), 'm/s | slow', round(slow['speed'], 2), 'H/s', round(slow_plan['speed'], 1), 'm/s')
    check('fast stroke → faster shot than slow stroke', fast_plan['speed'] > slow_plan['speed'] * 1.6 and fast['input']['power'] > 0.8 and slow['input']['power'] < 0.2)
    check('straight stroke → ~no curve', abs(fast_plan['curve']) < 0.1, fast_plan['curve'])
    check('same stroke at different speeds → same aim (physics decides the arc)', abs(fast_plan['target'][0] - slow_plan['target'][0]) < 0.3, (fast_plan['target'], slow_plan['target']))
    check('UPDATE 3: slower shot needs a higher arc (gravity)', slow_plan['apex'] > fast_plan['apex'], (slow_plan['apex'], fast_plan['apex']))
    if dd['phase'] == 'runup':
        check('keeper idle during run-up', dd['keeper']['action'] == 'none', dd['keeper'])
    wait_phase('result')
    time.sleep(0.35)
    page.screenshot(path=f'{OUT}/07_result_slow.png')
    outcomes = {}
    d = dbg()
    outcomes[d['outcome']] = outcomes.get(d['outcome'], 0) + 1

    # C) a few more shots to see all outcomes
    tests = [
        ('wide', (W - 8, goal_mid_y), 140, 0),
        ('corner', (g['left'] + 14, g['bottom'] - 18), 110, 0),
        ('right-curl', (g['right'] - 30, g['top'] + 30), 150, 70),
    ]
    for name, end, dur, bend in tests:
        time.sleep(0.9)
        tap(W / 2, H * 0.6)
        wait_phase('aim', 5)
        swipe(line(start, end, 14, bend), dur)
        d = wait_phase('result')
        outcomes[d['outcome']] = outcomes.get(d['outcome'], 0) + 1
        print(' ', name, '→', d['outcome'], d['detail'], 'curve', round(d['plan']['curve'], 2))
        if name == 'wide':
            check('stroke ending wide → MISS', d['outcome'] == 'MISS', d['detail'])
            page.screenshot(path=f'{OUT}/08_miss.png')
        if name == 'right-curl':
            check('right-bending stroke → path bends right', d['plan']['curve'] > 0.2, d['plan']['curve'])
    page.screenshot(path=f'{OUT}/09_last.png')
    print('penalty outcomes', outcomes)
    hud = page.inner_text('[data-testid=hud]').replace('\n', ' ')
    check('HUD counted all 6 shots', '/6' in hud, hud)

    # ── free kick ───────────────────────────────────────────────────────
    page.tap('.hud-back')
    page.wait_for_selector('.mode-card')
    page.tap('text=FREE KICK')
    page.wait_for_function('window.__PIPA && window.__PIPA.debug().phase === "aim" && window.__PIPA.game.wall', timeout=15000)
    time.sleep(1.5)
    page.screenshot(path=f'{OUT}/10_freekick.png')
    d = dbg()
    k, g, b = d['kicker'], d['goal'], d['ball']
    print('fk framing', json.dumps({'fov': round(d['fov'], 1), 'goal': g, 'kicker': k, 'ball': b}))
    check('free kick: kicker full body on screen', k['minX'] >= 0 and k['maxX'] <= W and k['minY'] >= 0 and k['maxY'] <= H, k)
    check('free kick: goal on screen', g['left'] > 0 and g['right'] < W and g['top'] > 50)
    fk = {}
    blocked_seen = False
    for i in range(6):
        d = dbg()
        g, b = d['goal'], d['ball']
        st = (b['x'], b['y'] + 4)
        if i % 2 == 0:
            # drive drawn straight through the wall at body height
            wl = d['wall']
            end = (st[0] + (wl['x'] - st[0]) * 1.5, st[1] + (wl['y'] - st[1]) * 1.5)
            page.evaluate('s => window.__PIPA.simulateSwipe(s)', timed(line(st, end, 14), 110))
        else:
            # stroke drawn as an arch over the wall into the far side of the goal
            arch = page.evaluate("""() => {
                const v = window.__PIPA, B = v.game.ballPos, far = B.x > 0 ? -2.2 : 2.2, pts = [];
                for (let k = 0; k <= 30; k++) { const t = k / 30;
                    pts.push(v.worldToScreen({ x: B.x + (far - B.x) * t, y: B.y + (1.9 - B.y) * t + 2.4 * 4 * t * (1 - t), z: B.z * (1 - t) })); }
                return pts.map(p => [p.x, p.y]); }""")
            page.evaluate('s => window.__PIPA.simulateSwipe(s)', timed([tuple(p) for p in arch], 260))
            if i == 1:
                time.sleep(0.3)
                page.screenshot(path=f'{OUT}/11_fk_over_wall_path.png')
        d = wait_phase('result')
        fk[d['outcome']] = fk.get(d['outcome'], 0) + 1
        print('  fk', i, '→', d['outcome'], d['detail'], 'apex', round(d['plan']['apex'], 2))
        if i % 2 == 1:
            check(f'free kick: path drawn over the wall clears it (shot {i})', d['outcome'] != 'BLOCKED', d['outcome'])
        if d['outcome'] == 'BLOCKED' and not blocked_seen:
            blocked_seen = True
            time.sleep(0.4)
            page.screenshot(path=f'{OUT}/12_blocked.png')
        time.sleep(0.9)
        tap(W / 2, H * 0.6)
        wait_phase('aim', 5)
    print('freekick outcomes', fk)
    check('free kick: ball collides with the wall (BLOCKED seen)', blocked_seen)
    s2 = scroll_state()
    check('no scroll / overflow after all play', s2['sy'] == 0 and s2['sw'] <= s2['iw'] and s2['sh'] <= s2['ih'], s2)
    check('no JS errors', not errors, errors[:3])
    page.screenshot(path=f'{OUT}/13_freekick_next.png')
    browser.close()

fails = [n for n, ok in results if not ok]
print('\n' + (f'{len(fails)} FAILED: {fails}' if fails else f'ALL {len(results)} E2E CHECKS PASSED'))
sys.exit(1 if fails else 0)

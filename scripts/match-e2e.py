"""
Online penalty match, end to end, in two real browsers against the PIPA server:
lobby → challenge → accept → ready → 3-2-1 → 10 rounds (drawn shots, human keeper)
→ MATCH RESULT → rematch / lobby, plus a mid-match disconnect.
  npm run build && PIPA_SLOW_TEST=1 npm run server &   then   python3 scripts/match-e2e.py [out_dir]
(PIPA_SLOW_TEST only stretches the server timers for slow, software-rendered test browsers.)
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from squad_seed import seed_script  # noqa: E402

SQUADS = {
    'HAZE': {'penaltyOrder': ['ronaldo', 'messi', 'son', 'mbappe', 'salah'], 'goalkeeperId': 'courtois', 'freeKickTakerId': 'messi'},
    'FRIEND': {'penaltyOrder': ['haaland', 'kane', 'yamal', 'neymar', 'vinicius'], 'goalkeeperId': 'alisson', 'freeKickTakerId': 'kane'},
}
NAMES = {'ronaldo': 'CRISTIANO RONALDO', 'messi': 'LIONEL MESSI', 'son': 'SON HEUNG-MIN', 'mbappe': 'KYLIAN MBAPPÉ', 'salah': 'MOHAMED SALAH',
         'haaland': 'ERLING HAALAND', 'kane': 'HARRY KANE', 'yamal': 'LAMINE YAMAL', 'neymar': 'NEYMAR JR.', 'vinicius': 'VINÍCIUS JÚNIOR',
         'courtois': 'THIBAUT COURTOIS', 'alisson': 'ALISSON BECKER'}

BASE = os.environ.get('PIPA_URL', 'http://localhost:8787/')
OUT = sys.argv[1] if len(sys.argv) > 1 else 'match-shots'
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


SHOOT_JS = """([side, high, dur]) => {
  const v = window.__PIPA_ONLINE; const d = v.debug();
  const b = d.ball;
  const gx = side === 'L' ? d.goal.left + (d.goal.right - d.goal.left) * 0.16
           : side === 'R' ? d.goal.right - (d.goal.right - d.goal.left) * 0.16
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

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
    A_ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=1)
    B_ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=1)
    errors = []

    # record every result banner the moment it appears (slow test machines can't poll fast enough)
    BANNER_JS = """(() => { window.__banners = []; new MutationObserver(() => {
        const el = document.querySelector('[data-testid=result]');
        const k = el && (el.dataset.outcome + '@' + document.querySelector('[data-testid=online-game]')?.dataset.round);
        if (el && window.__banners[window.__banners.length - 1] !== k) window.__banners.push(k);
      }).observe(document, { subtree: true, childList: true }); })()"""

    NAMES_JS = """(() => { window.__names = []; new MutationObserver(() => {
        const el = document.querySelector('[data-testid=name-banner]');
        const t = el && el.innerText.replace(/\\s+/g, ' ').trim();
        if (t && window.__names[window.__names.length - 1] !== t) window.__names.push(t);
      }).observe(document, { subtree: true, childList: true }); })()"""

    def page(ctx, label):
        ctx.add_init_script(BANNER_JS)
        ctx.add_init_script(NAMES_JS)
        ctx.add_init_script(seed_script(SQUADS))
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(f'{label}: {e}'))
        return pg

    def login(pg, nick):
        pg.goto(BASE)
        pg.fill('input[autocomplete=username]', nick)
        pg.fill('input[type=password]', 'pw1234')
        pg.click('text=게임 시작')
        pg.click('[data-testid=play-online]')
        pg.click('[data-testid=online-penalty]')
        pg.wait_for_selector('.lobby')

    A = page(A_ctx, 'A')
    B = page(B_ctx, 'B')
    login(A, 'HAZE')
    login(B, 'FRIEND')
    wait_for(lambda: A.locator('[data-testid=player-row][data-nick="FRIEND"] button').is_enabled(timeout=500))
    A.click('[data-testid=player-row][data-nick="FRIEND"] button')
    B.wait_for_selector('[data-testid=challenge-panel]', timeout=5000)
    B.click('[data-testid=cp-accept]')
    v, _ = wait_for(lambda: A.is_visible('[data-testid=match-found]') and B.is_visible('[data-testid=match-found]'))
    check('lobby → challenge → accept → MATCH FOUND on both (stage-1 flow intact)', bool(v))

    # 1. same match / room id from the server
    v, _ = wait_for(lambda: A.get_attribute('[data-testid=match-found]', 'data-room-id') and B.get_attribute('[data-testid=match-found]', 'data-room-id'))
    ra = A.get_attribute('[data-testid=match-found]', 'data-room-id')
    rb = B.get_attribute('[data-testid=match-found]', 'data-room-id')
    check('1. both browsers in the same server room', bool(ra) and ra == rb and ra.startswith('pipa_match_'), ra)

    # 2. ready screen
    check('2. ready screen: PIPA · ONLINE MATCH · A VS B · [준비하기]',
          'ONLINE MATCH' in A.inner_text('body') and A.inner_text('[data-testid=mf-ready]') == '준비하기' and 'VS' in A.inner_text('.mf-versus'))
    A.click('[data-testid=mf-ready]')
    v, _ = wait_for(lambda: '상대방을 기다리는 중...' in A.inner_text('body') and '준비 완료' in B.inner_text('.mf-player.opp'))
    check('2. one ready → "상대방을 기다리는 중..." and opponent sees 준비 완료', bool(v))
    A.screenshot(path=f'{OUT}/01_ready_waiting.png')
    time.sleep(0.3)
    check('2. not started with only one ready', A.is_visible('[data-testid=match-found]'))

    # 3. both ready → countdown on both
    B.click('[data-testid=mf-ready]')
    v, _ = wait_for(lambda: A.is_visible('[data-testid=countdown]') and B.is_visible('[data-testid=countdown]'), 5, 0.02)
    check('3. both ready → 3/2/1 countdown on both screens', bool(v))
    A.screenshot(path=f'{OUT}/02_countdown.png')
    off_a = A.evaluate('window.__PIPA_MATCH.serverNow() - Date.now()')
    off_b = B.evaluate('window.__PIPA_MATCH.serverNow() - Date.now()')
    v, _ = wait_for(lambda: A.get_attribute('[data-testid=online-game]', 'data-phase') == 'aim' and B.get_attribute('[data-testid=online-game]', 'data-phase') == 'aim', 15)
    check('3. kick-off → round 1 on both', bool(v))

    # 4. roles
    role = lambda pg: pg.get_attribute('[data-testid=online-game]', 'data-role')
    ra, rb = role(A), role(B)
    check('4. one KICKER and one GOALKEEPER', {ra, rb} == {'kicker', 'keeper'}, f'A={ra} B={rb}')
    time.sleep(1.0)
    A.screenshot(path=f'{OUT}/03_round1_{ra}.png')
    B.screenshot(path=f'{OUT}/04_round1_{rb}.png')
    kd = (A if ra == 'kicker' else B).evaluate('window.__PIPA_ONLINE.debug()')
    gd = (A if ra == 'keeper' else B).evaluate('window.__PIPA_ONLINE.debug()')
    check('4. kicker view = penalty camera (goal wide, kicker lower-left)', 0.6 < (kd['goal']['right'] - kd['goal']['left']) / kd['w'] < 0.85, f"{(kd['goal']['right'] - kd['goal']['left']) / kd['w']:.2f}")
    gfrac = (gd['goal']['right'] - gd['goal']['left']) / gd['w']
    check('4. keeper view looks at the goal from the pitch like the kicker (not mirrored, keeper seen from the front)',
          gd['goal']['left'] < gd['goal']['right'] and gd['keeperScreen']['y'] < gd['kickerScreen']['y'], f"keeper y {gd['keeperScreen']['y']:.0f} kicker y {gd['kickerScreen']['y']:.0f}")
    check('4. keeper view: whole goal on screen — both posts with margin, crossbar below the HUD, 70–85% wide',
          gd['goal']['left'] > 8 and gd['goal']['right'] < gd['w'] - 8 and gd['goal']['top'] > 90 and 0.70 <= gfrac <= 0.85 and 50 <= gd['fov'] <= 75,
          f"posts {gd['goal']['left']:.0f}–{gd['goal']['right']:.0f}/{gd['w']} · bar y {gd['goal']['top']:.0f} · {gfrac:.2f} · fov {gd['fov']:.0f}")

    plan = [  # (shot side on the kicker's screen, height, swipe ms, keeper action)
        ('L', 0.25, 160, 'swipe-left-correct'),
        ('R', 0.3, 150, 'none'),
        ('C', 0.4, 260, 'none'),
        ('R', 0.75, 140, 'key-wrong'),
        ('L', 0.3, 170, 'late'),
        ('R', 0.3, 160, 'swipe-right-correct'),
        ('L', 0.75, 150, 'none'),
        ('C', 0.2, 200, 'swipe-down'),
        ('R', 0.3, 170, 'key-correct'),
        ('L', 0.3, 160, 'none'),
    ]
    roles_seen = []
    outcomes = []
    for r, (side, high, dur, keeper_act) in enumerate(plan, start=1):
        v, _ = wait_for(lambda: A.get_attribute('[data-testid=online-game]', 'data-phase') == 'aim'
                        and A.get_attribute('[data-testid=online-game]', 'data-round') == str(r)
                        and B.get_attribute('[data-testid=online-game]', 'data-round') == str(r), 25)
        if not v:
            check(f'round {r} started', False)
            break
        K = A if role(A) == 'kicker' else B
        G = B if K is A else A
        roles_seen.append('A' if K is A else 'B')
        hud_k = K.inner_text('[data-testid=round-label]')
        if r == 2:
            check('HUD shows ROUND n/10 and role', hud_k == 'ROUND 2/10' and K.inner_text('[data-testid=role-label]') == 'KICKER' and G.inner_text('[data-testid=role-label]') == 'GOALKEEPER', hud_k)
        time.sleep(0.25)
        # both look at the goal from the pitch: the shot's screen side = the keeper's swipe side
        keeper_right_is = {'L': 'left', 'R': 'right', 'C': 'down'}[side]
        if keeper_act == 'swipe-left-correct' or keeper_act == 'swipe-right-correct':
            dx = 160 if keeper_right_is == 'right' else -160
            G.mouse.move(195, 500)
            G.mouse.down()
            G.mouse.move(195 + dx / 2, 495, steps=4)
            G.mouse.move(195 + dx, 490, steps=4)
            G.mouse.up()
            time.sleep(0.15)
            if r == 1:
                check('7. keeper swipes before the shot → dive locked in, hidden from the kicker',
                      '다이빙' in G.inner_text('[data-testid=coach]') and K.evaluate('window.__PIPA_MATCH.getSnapshot().state.dive') is None)
                G.screenshot(path=f'{OUT}/05_keeper_prepicked.png')
        elif keeper_act == 'swipe-down':
            G.mouse.move(195, 420)
            G.mouse.down()
            G.mouse.move(197, 520, steps=6)
            G.mouse.up()
        K.evaluate(SHOOT_JS, [side, high, dur])
        if r == 1:
            K.screenshot(path=f'{OUT}/06_kicker_dashed_path.png')
        # 5/6. shot relayed, run-up on both
        v, _ = wait_for(lambda: A.evaluate('window.__PIPA_ONLINE.debug().shotRound') == r and B.evaluate('window.__PIPA_ONLINE.debug().shotRound') == r, 5, 0.02)
        if r == 1:
            check('5. kicker’s drawn shot reaches the keeper’s screen via the server', bool(v))
            # when each phone starts the run-up (local clock = server runStart − its measured offset)
            sa_ = A.evaluate("[window.__PIPA_ONLINE.debug().runStartLocal, window.__PIPA_MATCH.serverNow() - Date.now()]")
            sb_ = B.evaluate("[window.__PIPA_ONLINE.debug().runStartLocal, window.__PIPA_MATCH.serverNow() - Date.now()]")
            check('6. both phones start the kick on the same server timestamp (within 50 ms)', abs(sa_[0] - sb_[0]) < 50, f'{abs(sa_[0] - sb_[0]):.0f} ms · offsets {sa_[1]:.0f}/{sb_[1]:.0f} ms')
        if keeper_act in ('key-wrong', 'key-correct'):
            # react with arrow keys during the run-up (PC controls)
            wait_for(lambda: G.evaluate('window.__PIPA_ONLINE.debug().runClock') > 0.55, 3, 0.01)
            want = keeper_right_is if keeper_act == 'key-correct' else ('left' if keeper_right_is == 'right' else 'right')
            G.keyboard.press('ArrowRight' if want == 'right' else 'ArrowLeft')
        if keeper_act == 'late':
            wait_for(lambda: G.evaluate('window.__PIPA_ONLINE.debug().runClock') > 1.25, 4, 0.01)
            G.mouse.move(195, 500)
            G.mouse.down()
            G.mouse.move(40, 500, steps=6)
            G.mouse.up()
        if r == 1:
            wait_for(lambda: K.evaluate('window.__PIPA_ONLINE.debug().phase') == 'flight', 4, 0.01)
            time.sleep(0.12)
            K.screenshot(path=f'{OUT}/07_kicker_flight.png')
            G.screenshot(path=f'{OUT}/08_keeper_flight.png')
        hist = lambda pg: pg.evaluate('window.__PIPA_MATCH.getSnapshot().state.history')
        v, _ = wait_for(lambda: len(hist(A)) >= r and len(hist(B)) >= r, 20, 0.1)
        ha, hb = hist(A), hist(B)
        if not v or ha[r - 1] != hb[r - 1]:
            check(f'8. round {r}: same server result on both phones', False, f'{ha[-1:]} vs {hb[-1:]}')
            break
        oa = ha[r - 1]['outcome']
        outcomes.append(oa)
        if r == 1:
            check('7. correct pre-picked dive saves a low corner shot', oa == 'SAVE', oa)
        sa = (A.get_attribute('[data-testid=score-me]', 'data-score'), A.get_attribute('[data-testid=score-opp]', 'data-score'))
        sb = (B.get_attribute('[data-testid=score-me]', 'data-score'), B.get_attribute('[data-testid=score-opp]', 'data-score'))
        if sa != (sb[1], sb[0]):
            check(f'round {r}: scores agree', False, f'{sa} vs {sb}')
        print(f'   round {r}: kicker={"A" if K is A else "B"} keeper={keeper_act:20s} → {oa} ({ha[r - 1]["detail"]})  score A{sa}', flush=True)
        if r == 2:
            wait_for(lambda: A.is_visible('[data-testid=round-intro]') or B.is_visible('[data-testid=round-intro]'), 10, 0.1)
            B.screenshot(path=f'{OUT}/11_next_round.png')

    la = A.evaluate('window.__PIPA_ONLINE.debug().localOutcomes')
    lb = B.evaluate('window.__PIPA_ONLINE.debug().localOutcomes')
    norm = lambda o: 'MISS' if o == 'BLOCKED' else o
    synced_local = sum(1 for i, o in enumerate(outcomes, start=1) if norm(la.get(str(i))) == o and norm(lb.get(str(i))) == o)
    ba = A.evaluate('window.__banners')
    bb = B.evaluate('window.__banners')
    want = [f'{o}@{i}' for i, o in enumerate(outcomes, start=1)]
    check('8. both screens showed the same GOAL!/SAVE!/MISS! banner every round (= server result)', ba == want and bb == want, f'A {ba} · B {bb}')
    # UPDATE 4: each side's own squad — the kicker's takers in order, the other side's GK
    side_nick = {'A': 'HAZE', 'B': 'FRIEND'}
    kicks = {'A': 0, 'B': 0}
    want_names = []
    for side in roles_seen:
        sq = SQUADS[side_nick[side]]
        other = SQUADS[side_nick['B' if side == 'A' else 'A']]
        want_names.append((NAMES[sq['penaltyOrder'][kicks[side] % 5]], NAMES[other['goalkeeperId']]))
        kicks[side] += 1
    na = ' | '.join(A.evaluate('window.__names'))
    nb = ' | '.join(B.evaluate('window.__names'))
    missing = [k for k, g in want_names if k not in na or k not in nb]
    check('UPDATE 4: every round shows the right kicker (each side’s own order) on both phones', not missing, missing or want_names[:4])
    check('UPDATE 4: the defending side’s own GK is shown (COURTOIS / ALISSON)', 'GK · THIBAUT COURTOIS' in na and 'GK · ALISSON BECKER' in na)
    check('9. roles alternate every round (A,B,A,B…)', all(roles_seen[i] != roles_seen[i + 1] for i in range(len(roles_seen) - 1)) and len(roles_seen) == 10, ''.join(roles_seen))
    check('8. all 10 results identical on both screens', len(outcomes) == 10)
    check('6. each phone’s own replay matched the server’s result (deterministic sync)', synced_local >= 9, f'{synced_local}/{len(outcomes)} · A {la} · B {lb}')
    check('mix of outcomes (human keeper matters)', 'SAVE' in outcomes and 'GOAL' in outcomes, ','.join(outcomes))

    # 10. final result
    v, _ = wait_for(lambda: A.is_visible('[data-testid=match-result]') and B.is_visible('[data-testid=match-result]'), 25)
    check('10. after 10 rounds both see MATCH RESULT', bool(v))
    va = A.get_attribute('[data-testid=match-result]', 'data-verdict')
    vb = B.get_attribute('[data-testid=match-result]', 'data-verdict')
    fa = (A.inner_text('[data-testid=final-me]'), A.inner_text('[data-testid=final-opp]'))
    fb = (B.inner_text('[data-testid=final-me]'), B.inner_text('[data-testid=final-opp]'))
    goals_a = sum(1 for i, o in enumerate(outcomes) if o == 'GOAL' and roles_seen[i] == 'A')
    goals_b = sum(1 for i, o in enumerate(outcomes) if o == 'GOAL' and roles_seen[i] == 'B')
    check('10. final score = sum of round results, same on both', fa == (fb[1], fb[0]) and fa == (str(goals_a), str(goals_b)), f'A {fa} B {fb}')
    ok_verdict = (va, vb) in (('VICTORY', 'DEFEAT'), ('DEFEAT', 'VICTORY'), ('DRAW', 'DRAW'))
    check('10. VICTORY / DEFEAT / DRAW consistent', ok_verdict and ((goals_a > goals_b) == (va == 'VICTORY')), f'{va}/{vb}')
    # UPDATE 6: the server pays the winner +10,000,000 MP (loser / draw: 0 MP)
    ra_ = A.get_attribute('[data-testid=final-reward]', 'data-reward')
    rb_ = B.get_attribute('[data-testid=final-reward]', 'data-reward')
    want = {'VICTORY': '10000000', 'DEFEAT': '0', 'DRAW': '0'}
    check('UPDATE 6: VICTORY shows +10,000,000 MP, DEFEAT / DRAW 0 MP', ra_ == want[va] and rb_ == want[vb]
          and (va != 'VICTORY' or '+10,000,000 MP' in A.inner_text('[data-testid=final-reward]')), f'{va}:{ra_} {vb}:{rb_}')
    win = A if va == 'VICTORY' else B if vb == 'VICTORY' else None
    if win:
        tok = win.evaluate("JSON.parse(localStorage.getItem('pipa.session.v1')).token")
        v, _ = wait_for(lambda: win.evaluate("t => fetch('/api/me', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({token: t})}).then(r => r.json())", tok)['mp'] == 10_000_000, 10, 0.3)
        check('UPDATE 6: the winner’s server balance is +10,000,000 MP (paid once)', bool(v))
    A.screenshot(path=f'{OUT}/12_final_A.png')
    B.screenshot(path=f'{OUT}/13_final_B.png')

    # rematch
    A.click('[data-testid=rematch]')
    v, _ = wait_for(lambda: '상대방이 다시 대결을 원해요' in B.inner_text('body'))
    check('다시 대결: the other player is asked', bool(v))
    B.click('[data-testid=rematch]')
    v, _ = wait_for(lambda: A.is_visible('[data-testid=countdown]') and B.is_visible('[data-testid=countdown]'), 10, 0.03)
    check('다시 대결: both accept → new countdown 0:0', bool(v) and A.get_attribute('[data-testid=score-me]', 'data-score') == '0')
    wait_for(lambda: A.get_attribute('[data-testid=online-game]', 'data-phase') == 'aim', 15)

    # disconnect mid-match
    B.close()
    v, dt = wait_for(lambda: '상대방의 연결이 종료되었습니다.' in A.inner_text('body'), 8)
    check('mid-match disconnect → "상대방의 연결이 종료되었습니다." (no endless wait)', bool(v), f'{dt:.2f}s')
    A.screenshot(path=f'{OUT}/14_opponent_left.png')
    A.click('[data-testid=back-to-lobby]')
    v, _ = wait_for(lambda: A.is_visible('.lobby'))
    check('[온라인 로비로 돌아가기] → ONLINE LOBBY', bool(v))
    check('UPDATE badge on the lobby after the match', A.inner_text('[data-testid=version-badge]').startswith('UPDATE'))
    check('no JS errors', not errors, errors[:3])
    print(f'   clock offsets A {off_a:.0f} ms, B {off_b:.0f} ms')
    browser.close()

fails = [n for n, ok in results if not ok]
print('\n' + (f'{len(fails)} FAILED: {fails}' if fails else f'ALL {len(results)} MATCH E2E CHECKS PASSED'))
sys.exit(1 if fails else 0)

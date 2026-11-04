"""
UPDATE 4 — squad system in a real (mobile) browser:
first login → BUILD YOUR SQUAD → 5+1 → order/FK → SAVE → home (혼자서/온라인/SQUAD)
→ SELECT KICKER → penalty with that player + name banner → free kick with the FK taker
→ SQUAD editing persists → no forced setup on next login.
  npm run build && npm run server &   then   python3 scripts/squad-e2e.py [out_dir]
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from squad_seed import NO_DAILY_JS, game_version  # noqa: E402

BASE = os.environ.get('PIPA_URL', 'http://localhost:8787/')
OUT = sys.argv[1] if len(sys.argv) > 1 else 'squad-shots'
os.makedirs(OUT, exist_ok=True)
results = []


def check(name, ok, info=''):
    results.append((name, ok))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  — {info}' if info != '' else ''), flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    ctx.add_init_script(NO_DAILY_JS)
    errors = []
    # record every name banner the moment it appears (slow test browsers)
    ctx.add_init_script("""(() => { window.__names = []; new MutationObserver(() => {
        const el = document.querySelector('[data-testid=name-banner]');
        const t = el && el.innerText.replace(/\\s+/g, ' ').trim();
        if (t && window.__names[window.__names.length - 1] !== t) window.__names.push(t);
      }).observe(document, { subtree: true, childList: true }); })()""")
    names = lambda: pg.evaluate('window.__names')
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)))

    def login(nick):
        pg.goto(BASE)
        pg.fill('input[autocomplete=username]', nick)
        pg.fill('input[type=password]', 'pw1234')
        pg.click('text=게임 시작')

    login('HAZE')
    pg.wait_for_selector('[data-testid=squad-pick]', timeout=8000)
    check('first login → BUILD YOUR SQUAD', 'BUILD YOUR SQUAD' in pg.inner_text('body'))
    check('UPDATE badge (current version)', pg.inner_text('[data-testid=version-badge]') == f'UPDATE {game_version()}')
    check('UPDATE 5: cards show OVR + POWER/ACCURACY/CURVE', pg.inner_text('[data-testid=player-card][data-id="messi"] [data-testid=card-ovr]').startswith('92') and 'PWR' in pg.inner_text('[data-testid=player-card][data-id="messi"]'))
    n = pg.locator('[data-testid=player-card]').count()
    check('UPDATE 6: BUILD YOUR SQUAD shows the 15 free starters (market players must be bought)', n == 15, n)
    pg.screenshot(path=f'{OUT}/01_build_squad.png')

    card = lambda pid: pg.locator(f'[data-testid=player-card][data-id="{pid}"] .pcard-hit')
    sel = lambda pid: pg.get_attribute(f'[data-testid=player-card][data-id="{pid}"]', 'data-selected') == '1'
    for pid in ['ronaldo', 'messi', 'son', 'mbappe', 'salah']:
        card(pid).click()
    check('5 field players selected (✓ SELECTED)', all(sel(x) for x in ['ronaldo', 'messi', 'son', 'mbappe', 'salah'])
          and pg.inner_text('[data-testid=player-card][data-id="son"] .pcard-state') == '✓ SELECTED')
    card('haaland').click()
    pg.wait_for_selector('[data-testid=squad-toast]', timeout=3000)
    check('6th field player refused with the message', pg.inner_text('[data-testid=squad-toast]') == '키커는 최대 5명까지 선택할 수 있습니다.' and not sel('haaland'))
    pg.screenshot(path=f'{OUT}/02_max_five.png')
    pg.click('[data-testid=filter-GOALKEEPER]')
    check('GOALKEEPER filter shows the 3 starter keepers', pg.locator('[data-testid=player-card]').count() == 3)
    card('neuer').click()
    card('courtois').click()
    check('picking another GK replaces the first', sel('courtois') and not sel('neuer'))
    pg.click('[data-testid=filter-ALL]')
    pg.click('[data-testid=player-card][data-id="kane"] .pcard-info')
    pg.wait_for_selector('[data-testid=player-detail]')
    det = pg.inner_text('[data-testid=player-detail]')
    check('tap ⓘ → detail: name (Korean), position, country, all 7 abilities + SPECIAL ABILITY, SELECT', '해리 케인' in det and 'ENGLAND' in det and 'SELECT' in det
          and all(k in det for k in ['POWER', 'ACCURACY', 'CURVE', 'KNUCKLE', 'LOW SHOT', 'FREE KICK', 'COMPOSURE']) and 'PENALTY PRECISION' in det)
    pg.screenshot(path=f'{OUT}/03_detail.png')
    pg.click('text=닫기')
    check('count shows 5/5 + GK 1/1, next enabled', '5' in pg.inner_text('[data-testid=squad-count]') and pg.is_enabled('[data-testid=squad-next]'))
    pg.click('[data-testid=squad-next]')
    pg.wait_for_selector('[data-testid=squad-arrange]')
    order = lambda: pg.eval_on_selector_all('[data-testid=taker-row]:not(.gk-row)', 'els => els.map(e => e.dataset.id)')
    check('MY SQUAD: PENALTY TAKERS 1–5 + GOALKEEPER', order() == ['ronaldo', 'messi', 'son', 'mbappe', 'salah'] and pg.get_attribute('[data-testid=gk-row]', 'data-id') == 'courtois'
          and 'PENALTY TAKERS' in pg.inner_text('body') and 'GOALKEEPER' in pg.inner_text('body'))
    pg.locator('[data-testid=taker-row][data-id="son"] [data-testid=move-up]').click()
    check('▲ moves a taker up', order() == ['ronaldo', 'son', 'messi', 'mbappe', 'salah'], order())
    pg.locator('[data-testid=taker-row][data-id="ronaldo"] [data-testid=move-down]').click()
    check('▼ moves a taker down', order() == ['son', 'ronaldo', 'messi', 'mbappe', 'salah'], order())
    pg.locator('[data-testid=taker-row][data-id="messi"] [data-testid=fk-toggle]').click()
    check('⭐ FREE KICK taker set', 'FREE KICK' in pg.inner_text('[data-testid=taker-row][data-id="messi"]'))
    pg.screenshot(path=f'{OUT}/04_my_squad.png')
    pg.click('[data-testid=squad-save]')
    pg.wait_for_selector('[data-testid=play-squad]')
    check('SAVE → home with 혼자서 / 온라인 / SQUAD', pg.is_visible('[data-testid=play-solo]') and pg.is_visible('[data-testid=play-online]') and pg.is_visible('[data-testid=play-squad]'))
    stored = pg.evaluate("JSON.parse(localStorage.getItem('pipa.squad.v1.haze'))")
    check('saved: penaltyOrder / goalkeeperId / freeKickTakerId / selectedPlayers',
          stored['penaltyOrder'] == ['son', 'ronaldo', 'messi', 'mbappe', 'salah'] and stored['goalkeeperId'] == 'courtois' and stored['freeKickTakerId'] == 'messi' and len(stored['selectedPlayers']) == 5, stored)
    pg.screenshot(path=f'{OUT}/05_home.png')

    # penalty → SELECT KICKER → game with that player
    pg.click('[data-testid=play-solo]')
    pg.click('text=PENALTY KICK')
    pg.wait_for_selector('[data-testid=select-kicker]')
    check('PENALTY → SELECT KICKER with my 5', pg.locator('[data-testid=player-card]').count() == 5)
    pg.screenshot(path=f'{OUT}/06_select_kicker.png')
    pg.click('[data-testid=player-card][data-id="ronaldo"] .pcard-hit')
    pg.wait_for_function('window.__PIPA && window.__names.length > 0', timeout=15000)
    pg.screenshot(path=f'{OUT}/07_penalty_ronaldo.png')
    check('kicker name shown: 크리스티아누 호날두', any('크리스티아누 호날두' in n for n in names()), names())
    d = pg.evaluate('window.__PIPA.debug()')
    check('the existing penalty game runs (aim phase, drawn shots)', d['phase'] == 'aim')
    time.sleep(2.6)
    check('name banner fades after ~2 s', pg.locator('[data-testid=name-banner]').count() == 0)
    # shoot once to make sure gameplay is unchanged
    b = d['ball']
    pts = [{'x': b['x'] + (d['goal']['right'] - 60 - b['x']) * i / 20, 'y': b['y'] + (d['goal']['bottom'] - 40 - b['y']) * i / 20, 't': 1000 + 160 * i / 20} for i in range(21)]
    r = pg.evaluate('s => window.__PIPA.simulateSwipe(s)', pts)
    check('drawing a shot still works with a real player', r is not None and pg.evaluate('window.__PIPA.debug().phase') in ('runup', 'flight', 'result'))
    pg.click('.hud-back')
    pg.wait_for_selector('text=FREE KICK')
    pg.click('text=FREE KICK')
    pg.wait_for_function("window.__names.some(n => n.includes('리오넬 메시'))", timeout=15000)
    check('FREE KICK → my free-kick taker appears (리오넬 메시)', any('리오넬 메시' in n for n in names()), names())
    time.sleep(1.0)
    pg.screenshot(path=f'{OUT}/08_freekick_messi.png')
    fk = pg.evaluate('window.__PIPA.debug()')
    check('free kick game runs with the wall', fk['phase'] == 'aim' and fk['wall'] is not None)
    pg.click('.hud-back')
    pg.click('text=‹ 뒤로')

    # SQUAD menu → change → saved
    pg.click('[data-testid=play-squad]')
    pg.wait_for_selector('[data-testid=squad-arrange]')
    check('SQUAD menu opens MY SQUAD with the saved order', order() == ['son', 'ronaldo', 'messi', 'mbappe', 'salah'])
    pg.click('[data-testid=squad-change]')
    card('salah').click()
    card('haaland').click()
    pg.click('[data-testid=squad-next]')
    pg.click('[data-testid=squad-save]')
    pg.wait_for_selector('[data-testid=play-squad]')
    stored = pg.evaluate("JSON.parse(localStorage.getItem('pipa.squad.v1.haze'))")
    check('changing a player in SQUAD is saved', 'haaland' in stored['penaltyOrder'] and 'salah' not in stored['penaltyOrder'], stored['penaltyOrder'])

    # next login: no forced setup
    pg.click('text=로그아웃')
    login('HAZE')
    pg.wait_for_selector('[data-testid=play-squad]', timeout=8000)
    check('next login goes straight to home (no forced BUILD YOUR SQUAD)', pg.locator('[data-testid=squad-pick]').count() == 0)

    # accounts: reopening the page logs straight in (saved session)
    pg.goto(BASE)
    pg.wait_for_selector('[data-testid=play-squad]', timeout=15000)
    check('ACCOUNT: reopening the page → auto-login to home', pg.locator('input[type=password]').count() == 0)

    # another device: same account → squad comes from the server
    ctx2 = browser.new_context(viewport={'width': 390, 'height': 760}, device_scale_factor=1)
    ctx2.add_init_script(NO_DAILY_JS)
    p2 = ctx2.new_page()
    p2.goto(BASE)
    p2.fill('input[autocomplete=username]', 'haze')
    p2.fill('input[type=password]', 'wrong-pass')
    p2.click('text=게임 시작')
    p2.wait_for_function("document.querySelector('[data-testid=login-error]').innerText.includes('이미 사용 중')", timeout=15000)
    check('ACCOUNT: same nickname + other password → "이미 사용 중인 닉네임"', True)
    p2.fill('input[type=password]', 'pw1234')
    p2.click('text=게임 시작')
    p2.wait_for_selector('[data-testid=play-squad]', timeout=15000)
    srv_sq = p2.evaluate("JSON.parse(localStorage.getItem('pipa.squad.v1.haze'))")
    check('ACCOUNT: new device, right password → squad loaded from the server', srv_sq and 'haaland' in srv_sq['penaltyOrder'], srv_sq)
    ctx2.close()

    # mobile: touch scrolling on the squad screens
    ctx3 = browser.new_context(viewport={'width': 360, 'height': 640}, device_scale_factor=1, is_mobile=True, has_touch=True)
    ctx3.add_init_script(NO_DAILY_JS)
    p3 = ctx3.new_page()
    p3.goto(BASE)
    p3.fill('input[autocomplete=username]', 'MOBI')
    p3.fill('input[type=password]', 'pw1234')
    p3.tap('text=게임 시작')
    p3.wait_for_selector('[data-testid=squad-pick]', timeout=15000)
    cdp = ctx3.new_cdp_session(p3)
    def swipe_scroll(sel):
        box = p3.locator(sel).bounding_box()
        before = p3.evaluate(f"document.querySelector('{sel}').scrollTop")
        x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] * 0.8
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
        for i in range(1, 16):
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y - i * 16}]})
            p3.wait_for_timeout(16)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        p3.wait_for_timeout(600)
        return before, p3.evaluate(f"document.querySelector('{sel}').scrollTop")
    b, a = swipe_scroll('.card-grid')
    check('MOBILE: touch swipe scrolls the player cards (BUILD YOUR SQUAD)', a > b + 40, (b, a))
    for pid in ['ronaldo', 'messi', 'son', 'mbappe', 'salah']:
        p3.locator(f'[data-testid=player-card][data-id="{pid}"] .pcard-hit').tap()
    p3.locator('[data-testid=player-card][data-id="courtois"] .pcard-hit').scroll_into_view_if_needed()
    p3.locator('[data-testid=player-card][data-id="courtois"] .pcard-hit').tap()
    p3.tap('[data-testid=squad-next]')
    p3.wait_for_selector('[data-testid=squad-arrange]')
    scrollable = p3.evaluate("(() => { const e = document.querySelector('[data-testid=squad-arrange]'); return e.scrollHeight > e.clientHeight + 1; })()")
    if scrollable:
        b, a = swipe_scroll('[data-testid=squad-arrange]')
        check('MOBILE: touch swipe scrolls the order / free-kick screen', a > b + 20, (b, a))
    else:
        check('MOBILE: order screen fits without scrolling', True)
    ctx3.close()

    check('no JS errors', not errors, errors[:3])
    browser.close()

fails = [n for n, ok in results if not ok]
print('\n' + (f'{len(fails)} FAILED: {fails}' if fails else f'ALL {len(results)} SQUAD E2E CHECKS PASSED'))
sys.exit(1 if fails else 0)

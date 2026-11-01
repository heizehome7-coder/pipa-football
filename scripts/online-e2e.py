"""
Realtime E2E with separate browser contexts (separate storage = separate players)
against the PIPA realtime server.
  npm run build && npm run server &   then   python3 scripts/online-e2e.py [out_dir]
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from squad_seed import seed_script  # noqa: E402

BASE = os.environ.get('PIPA_URL', 'http://localhost:8787/')
OUT = sys.argv[1] if len(sys.argv) > 1 else 'online-shots'
os.makedirs(OUT, exist_ok=True)
results = []


def check(name, ok, info=''):
    results.append((name, ok))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  — {info}' if info != '' else ''), flush=True)


def wait_for(fn, timeout=8.0, step=0.05):
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


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    A_ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
    B_ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    C_ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    for c in (A_ctx, B_ctx, C_ctx):
        c.add_init_script(seed_script({'제작자': None, 'MINHO': None, 'JIN': None}))
    errors = []

    def page(ctx, label):
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(f'{label}: {e}'))
        return pg

    def login(pg, nick):
        pg.goto(BASE)
        pg.fill('input[autocomplete=username]', nick)
        pg.fill('input[type=password]', 'pw1234')
        pg.click('text=게임 시작')
        pg.wait_for_selector('[data-testid=play-online]', timeout=5000)

    A = page(A_ctx, 'A')
    B = page(B_ctx, 'B')
    login(A, '제작자')
    A.screenshot(path=f'{OUT}/01_playtype.png')
    check('login → 혼자서 / 온라인 choice', A.is_visible('[data-testid=play-solo]') and A.is_visible('[data-testid=play-online]'))
    badge = A.locator('[data-testid=version-badge]').bounding_box()
    check('UPDATE badge top-right on the play-type screen', A.inner_text('[data-testid=version-badge]').startswith('UPDATE ') and badge['x'] > 390 * 0.5 and badge['y'] < 80, badge)
    A.click('[data-testid=play-online]')
    A.wait_for_selector('.lobby')
    login(B, 'MINHO')
    B.click('[data-testid=play-online]')
    B.wait_for_selector('.lobby')

    rows = lambda pg: pg.eval_on_selector_all('[data-testid=player-row]', 'els => els.map(e => e.dataset.nick)')
    v, dt = wait_for(lambda: rows(A) == ['MINHO'] and rows(B) == ['제작자'])
    check('A and B see each other in the online list (not themselves)', bool(v), f'{dt:.2f}s · A sees {rows(A)} · B sees {rows(B)}')
    check('my card shows ● ONLINE + nickname', 'ONLINE' in A.inner_text('[data-testid=me-card]') and '제작자' in A.inner_text('[data-testid=me-card]'))
    A.screenshot(path=f'{OUT}/02_lobby_A.png')

    # third player joins later → appears live without reload
    C = page(C_ctx, 'C')
    login(C, 'JIN')
    C.click('[data-testid=play-online]')
    C.wait_for_selector('.lobby')
    v, dt = wait_for(lambda: sorted(rows(A)) == ['JIN', 'MINHO'])
    check('a newly logged-in player appears live (no refresh)', bool(v), f'{dt:.2f}s')

    class Btn:
        def __init__(self, pg, nick):
            self.l = pg.locator(f'[data-testid=player-row][data-nick="{nick}"] button')

        def inner_text(self):
            return self.l.inner_text(timeout=800)

        def is_disabled(self):
            return self.l.is_disabled(timeout=800)

        def is_enabled(self):
            return self.l.is_enabled(timeout=800)

        def click(self):
            self.l.click(timeout=3000)

    def btn(pg, nick):
        return Btn(pg, nick)

    # ── reject flow ─────────────────────────────────────────────
    btn(A, 'MINHO').click()
    t_sent = time.time()
    v, dt = wait_for(lambda: B.is_visible('[data-testid=challenge-panel]'), 5, 0.02)
    check('B gets the request instantly (no refresh)', bool(v), f'{time.time() - t_sent:.2f}s after click')
    check('panel text: "제작자님이 대결을 신청했습니다."', '제작자님이' in B.inner_text('[data-testid=challenge-panel]'))
    check('A sees "MINHO님에게 대결을 신청했습니다." and "신청 중..."',
          'MINHO님에게 대결을 신청했습니다.' in A.inner_text('[data-testid=outgoing]') and btn(A, 'MINHO').inner_text() == '신청 중...')
    check('A cannot send a second request while pending', btn(A, 'MINHO').is_disabled() and btn(A, 'JIN').is_disabled())
    v, _ = wait_for(lambda: btn(C, '제작자').inner_text() == '응답 대기 중' and btn(C, '제작자').is_disabled())
    check('third player sees both as "응답 대기 중" (disabled)', bool(v))
    A.screenshot(path=f'{OUT}/03_A_requested.png')
    B.screenshot(path=f'{OUT}/04_B_request_panel_mobile.png')
    B.click('[data-testid=cp-reject]')
    v, dt = wait_for(lambda: 'MINHO님이 대결 신청을 거절했습니다.' in A.inner_text('body'))
    check('reject → A told "MINHO님이 대결 신청을 거절했습니다."', bool(v), f'{dt:.2f}s')
    A.screenshot(path=f'{OUT}/05_A_rejected.png')
    v, _ = wait_for(lambda: btn(A, 'MINHO').inner_text() == '대결 신청' and btn(A, 'MINHO').is_enabled())
    check('대결 신청 button usable again after reject', bool(v))

    # ── accept flow (B is in the single-player menu, not the lobby) ─────
    B.click('.lobby-back')
    B.wait_for_selector('[data-testid=play-solo]')
    B.click('[data-testid=play-solo]')
    B.wait_for_selector('text=PENALTY KICK')
    btn(A, 'MINHO').click()
    v, dt = wait_for(lambda: B.is_visible('[data-testid=challenge-panel]'), 5, 0.02)
    check('request reaches B even outside the lobby (single-player menu)', bool(v), f'{dt:.2f}s')
    B.screenshot(path=f'{OUT}/06_B_request_over_menu.png')
    B.click('[data-testid=cp-accept]')
    t_acc = time.time()
    v, _ = wait_for(lambda: A.is_visible('[data-testid=match-found]') and B.is_visible('[data-testid=match-found]'), 5, 0.02)
    check('accept → BOTH screens switch to MATCH FOUND', bool(v), f'{time.time() - t_acc:.2f}s')
    ida = A.get_attribute('[data-testid=match-found]', 'data-match-id')
    idb = B.get_attribute('[data-testid=match-found]', 'data-match-id')
    check('both browsers share the same match/challenge id', ida == idb and bool(ida), ida)
    check('A: "제작자 VS MINHO" + "상대방이 대결을 수락했습니다."',
          A.inner_text('[data-testid=mf-me]') == '제작자' and A.inner_text('[data-testid=mf-opp]') == 'MINHO'
          and A.inner_text('[data-testid=mf-sub]') == '상대방이 대결을 수락했습니다.')
    v, _ = wait_for(lambda: btn(C, 'MINHO').inner_text() == '대결 중')
    check('others see the matched players as "대결 중"', bool(v))
    A.click('[data-testid=mf-ready]')
    v, _ = wait_for(lambda: '준비 완료' in B.inner_text('.mf-player.opp'))
    check('경기 준비 on A shows on B in realtime', bool(v))
    A.screenshot(path=f'{OUT}/07_A_match_found.png')
    B.screenshot(path=f'{OUT}/08_B_match_found.png')

    # ── disconnect after matching ───────────────────────────────
    B.close()
    v, dt = wait_for(lambda: '상대방의 연결이 종료되었습니다.' in A.inner_text('[data-testid=mf-sub]'), 8)
    check('B closes the browser → A sees "상대방의 연결이 종료되었습니다."', bool(v), f'{dt:.2f}s')
    A.screenshot(path=f'{OUT}/09_A_opponent_left.png')
    v, _ = wait_for(lambda: 'MINHO' not in rows(C))
    check('closed browser disappears from the online list', bool(v))
    A.click('text=온라인 로비로')
    A.wait_for_selector('.lobby')

    # ── pending request, receiver disconnects ───────────────────
    btn(A, 'JIN').click()
    wait_for(lambda: C.is_visible('[data-testid=challenge-panel]'), 5)
    C.close()
    v, dt = wait_for(lambda: '상대방의 연결이 종료되었습니다.' in A.inner_text('body') and not A.is_visible('[data-testid=outgoing]'), 8)
    check('receiver disconnects while pending → request cancelled, sender told', bool(v), f'{dt:.2f}s')

    # single-player still reachable
    A.click('.lobby-back')
    A.click('[data-testid=play-solo]')
    check('혼자서 → existing PENALTY / FREE KICK menu', A.is_visible('text=PENALTY KICK') and A.is_visible('text=FREE KICK'))
    check('no JS errors', not errors, errors[:3])
    browser.close()

fails = [n for n, ok in results if not ok]
print('\n' + (f'{len(fails)} FAILED: {fails}' if fails else f'ALL {len(results)} ONLINE E2E CHECKS PASSED'))
sys.exit(1 if fails else 0)

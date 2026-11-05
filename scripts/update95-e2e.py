"""
UPDATE 9.5 browser test — HOME pack badge (all pack kinds), 관심 선수 (★ + filter, saved on the
account), developer FV · 토큰 · 팩 지급, 감자의 제왕 best score + recent games, the six "CLUB TBA"
players now with a club, smaller goal, version badge 9.5.

Own server on port 8799. Needs `npm run build`.
  python3 scripts/update95-e2e.py [out_dir]
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
PORT = 8799
BASE = f'http://localhost:{PORT}/'
OUT = sys.argv[1] if len(sys.argv) > 1 else 'update95-shots'
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
now_iso = lambda m: time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime(time.time() - m * 60))
data_dir = tempfile.mkdtemp(prefix='pipa-u95-')
with open(os.path.join(data_dir, 'accounts.json'), 'w') as f:
    json.dump({
        'fan': account('FAN', 0, SQ, unopenedPacks=1, goodPacks=2, legendPacks=3, fv=0,
                       potatoLog=[{'id': 'a1', 'score': 5, 'reward': {'mp': 10_000_000}, 'finishedAt': now_iso(30)},
                                  {'id': 'a2', 'score': 11, 'reward': {'pack': 'good'}, 'finishedAt': now_iso(20)},
                                  {'id': 'a3', 'score': 8, 'reward': {'mp': 30_000_000}, 'finishedAt': now_iso(10)}]),
        'devk': account('DEVK', 0, SQ),
    }, f)
DEV_CODE = 'pipa-test-dev-7531'
PACKS = 'kwonchanghoon,honghyunseok'
env = {**os.environ, 'PORT': str(PORT), 'PIPA_DATA_DIR': data_dir, 'DATABASE_URL': '', 'DEVELOPER_CODE': DEV_CODE, 'PIPA_TEST_PACKS': PACKS}
srv = subprocess.Popen(['node', 'server/realtime-server.mjs'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
time.sleep(1.5)
GOAL = json.loads(subprocess.check_output(['npx', 'tsx', '-e', "import { FIELD } from './src/game/core/config'; import { KEEPER_LINE } from './src/online/match/protocol'; console.log(JSON.stringify({ w: FIELD.goalHalfWidth, h: FIELD.goalHeight, k: KEEPER_LINE.maxX }))"], cwd=ROOT))

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        errors = []

        def ctx():
            c = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
            c.add_init_script(NO_DAILY_JS)
            return c

        def login(pg, nick):
            pg.on('pageerror', lambda e: errors.append(f'{nick}: {e}'))
            pg.goto(BASE)
            pg.fill('input[autocomplete=username]', nick)
            pg.fill('input[type=password]', 'pw1234')
            pg.click('text=게임 시작')
            pg.wait_for_selector('[data-testid=play-events]', timeout=20000)

        check('goal a touch smaller (7.14 m × 2.38 m) · keeper line ±2.92 m', GOAL == {'w': 3.57, 'h': 2.38, 'k': 2.92}, GOAL)
        P = ctx().new_page()
        login(P, 'FAN')
        check('UPDATE badge (current version)', P.inner_text('[data-testid=version-badge]') == f'UPDATE {game_version()}' and game_version() >= 9.5, P.inner_text('[data-testid=version-badge]'))
        v, _ = wait_for(lambda: P.inner_text('[data-testid=home-pack-count]') == '6', 8)
        check('HOME PACKS badge counts every pack kind (1 PLAYER + 2 GOOD + 3 LEGEND = 6)', bool(v), P.inner_text('[data-testid=home-pack-count]') if P.locator('[data-testid=home-pack-count]').count() else '-')
        P.screenshot(path=f'{OUT}/01_home_badge.png')

        # ── 관심 선수 ─────────────────────────────────────────────────
        P.click('[data-testid=play-market]')
        P.wait_for_selector('[data-testid=market-grid]')
        P.click('[data-testid=mfilter-FAVORITE]')
        time.sleep(0.2)
        check('★ 관심 filter with none yet → hint', P.locator('[data-testid=market-grid] [data-testid=player-card]').count() == 0 and '☆' in P.inner_text('[data-testid=market-empty]'))
        P.click('[data-testid=mfilter-ALL]')
        P.fill('[data-testid=market-search]', '야신')
        time.sleep(0.2)
        P.click('.mcard-wrap:has([data-id="yashin"]) [data-testid=fav-star]')
        P.fill('[data-testid=market-search]', '모드리치')
        time.sleep(0.2)
        P.click('.mcard-wrap:has([data-id="modric"]) [data-testid=fav-star]')
        P.fill('[data-testid=market-search]', '')
        time.sleep(0.2)
        P.click('[data-testid=player-card][data-id="pele"] .pcard-info')
        P.wait_for_selector('[data-testid=market-detail]')
        P.click('[data-testid=detail-fav]')
        check('detail: ☆ 관심 → ★ 관심', '★' in P.inner_text('[data-testid=detail-fav]'))
        P.click('[data-testid=market-detail] >> text=닫기')
        P.click('[data-testid=mfilter-FAVORITE]')
        time.sleep(0.3)
        ids = P.eval_on_selector_all('[data-testid=market-grid] [data-testid=player-card]', 'els => els.map(e => e.dataset.id)')
        check('★ 관심 filter → exactly the 3 favourites', sorted(ids) == ['modric', 'pele', 'yashin'], ids)
        check('filter chip shows the count', '3' in P.inner_text('[data-testid=mfilter-FAVORITE]'))
        P.screenshot(path=f'{OUT}/02_market_favorites.png')
        P.click('.mcard-wrap:has([data-id="modric"]) [data-testid=fav-star]')
        time.sleep(0.4)
        ids = P.eval_on_selector_all('[data-testid=market-grid] [data-testid=player-card]', 'els => els.map(e => e.dataset.id)')
        check('★ again → removed from 관심', sorted(ids) == ['pele', 'yashin'], ids)
        P.fill('[data-testid=market-search]', '펠레')
        time.sleep(0.2)
        check('관심 filter + search together', P.eval_on_selector_all('[data-testid=market-grid] [data-testid=player-card]', 'els => els.map(e => e.dataset.id)') == ['pele'])
        time.sleep(0.5)
        # another device: the favourites come from the server
        Q = ctx().new_page()
        login(Q, 'FAN')
        Q.click('[data-testid=play-market]')
        Q.wait_for_selector('[data-testid=market-grid]')
        Q.click('[data-testid=mfilter-FAVORITE]')
        v, _ = wait_for(lambda: sorted(Q.eval_on_selector_all('[data-testid=market-grid] [data-testid=player-card]', 'els => els.map(e => e.dataset.id)')) == ['pele', 'yashin'], 8)
        check('a second phone shows the same 관심 선수 (saved on the account)', bool(v))
        Q.close()
        P.click('[data-testid=market-back]')

        # ── PACK: the former "CLUB TBA" players have clubs ────────────
        P.click('[data-testid=play-packs]')
        P.wait_for_selector('[data-testid=packs]')
        P.evaluate('window.__PIPA_PACK_SPEED = 4')
        P.click('[data-testid=pack-open]')
        clubs = []
        _, _ = wait_for(lambda: P.locator('[data-testid=reveal-club]').count() == 1, 10, 0.02)
        if P.locator('[data-testid=reveal-club]').count():
            clubs.append(P.get_attribute('[data-testid=reveal-club]', 'data-value'))
        P.wait_for_selector('[data-testid=pack-card]', timeout=10000)
        check('권창훈 → JEJU SK (no more CLUB TBA)', clubs == ['JEJU SK'] and P.get_attribute('[data-testid=pack-card]', 'data-id') == 'kwonchanghoon', clubs)
        P.click('[data-testid=pack-add]')
        P.wait_for_selector('[data-testid=pack-scene]', state='detached')
        v, _ = wait_for(lambda: P.get_attribute('[data-testid=pack-available]', 'data-count') == '0', 5)
        P.click('[data-testid=packs-back]')
        v, _ = wait_for(lambda: P.inner_text('[data-testid=home-pack-count]') == '5', 8)
        check('HOME badge after opening one → 5', bool(v))

        # ── 감자의 제왕: best + recent ───────────────────────────────
        P.click('[data-testid=play-events]')
        P.click('[data-testid=event-potato]')
        P.wait_for_selector('[data-testid=potato-stats]', timeout=8000)
        check('내 최고 점수 11점 · 플레이 3회', P.get_attribute('[data-testid=potato-stats]', 'data-best') == '11' and P.get_attribute('[data-testid=potato-stats]', 'data-played') == '3' and '11점' in P.inner_text('[data-testid=potato-best]'))
        rec = P.eval_on_selector_all('[data-testid=potato-recent] li b', 'els => els.map(e => e.innerText)')
        check('recent games, newest first (8 · 11 · 5) with rewards', rec == ['8점', '11점', '5점'] and 'GOOD PACK' in P.inner_text('[data-testid=potato-recent]') and '30,000,000 MP' in P.inner_text('[data-testid=potato-recent]'), rec)
        P.screenshot(path=f'{OUT}/03_potato_stats.png', full_page=True)

        # ── developer: FV · 토큰 · 팩 지급 ──────────────────────────
        D = ctx().new_page()
        login(D, 'DEVK')
        D.click('[data-testid=play-developer]')
        D.fill('[data-testid=dev-code]', DEV_CODE)
        D.click('[data-testid=dev-submit]')
        D.wait_for_selector('[data-testid=dev-dashboard]', timeout=10000)
        D.click('[data-testid=dev-tab-items]')
        D.wait_for_selector('[data-testid=dev-item-pick][data-nick="FAN"]', timeout=10000)
        D.click('[data-testid=dev-item-pick][data-nick="FAN"]')

        def grant(item, n):
            D.click(f'[data-testid=dev-item-{item}]')
            D.fill('[data-testid=dev-item-count]', str(n))
            D.click('[data-testid=dev-item-btn]')
            D.wait_for_selector('[data-testid=dev-item-confirm]')
            txt = D.inner_text('[data-testid=dev-item-confirm]')
            D.click('[data-testid=dev-item-ok]')
            v, _ = wait_for(lambda: '지급 완료' in D.inner_text('[data-testid=dev-item-msg]'), 10)
            return bool(v), txt

        for bad in ['0', '100001', '2.5', 'abc']:
            D.click('[data-testid=dev-item-fv]')
            D.fill('[data-testid=dev-item-count]', bad)
            if not D.is_disabled('[data-testid=dev-item-btn]'):
                check(f'FV 지급 refuses "{bad}"', False)
        ok, txt = grant('fv', 500)
        check('FV 500 지급 (confirm: 500 FV · 현재 0 → 500)', ok and '500 FV' in txt and '지급 후' in txt, txt.replace('\n', ' | '))
        D.screenshot(path=f'{OUT}/04_dev_items.png')
        ok2, _ = grant('red', 2)
        ok3, _ = grant('good', 1)
        ok4, _ = grant('legend', 1)
        check('홍 토큰 2 · GOOD PACK 1 · LEGEND PACK 1 지급', ok2 and ok3 and ok4)
        # the user's phone is told right away
        v, _ = wait_for(lambda: P.inner_text('[data-testid=potato-fv]').startswith('500'), 10)
        check('FAN sees 500 FV without reloading', bool(v), P.inner_text('[data-testid=potato-fv]'))
        P.click('[data-testid=potato-back]')
        P.click('[data-testid=event-hong]')
        v, _ = wait_for(lambda: P.get_attribute('[data-testid=hong-token-red]', 'data-count') == '2', 8)
        check('…and 홍 ×2 in 홍 나와라 뚝딱', bool(v))
        P.click('[data-testid=hong-back]')
        P.click('[data-testid=events-back]')
        v, _ = wait_for(lambda: P.inner_text('[data-testid=home-pack-count]') == '7', 8)
        check('…and the HOME badge 5 + 2 = 7', bool(v), P.inner_text('[data-testid=home-pack-count]'))
        check('no page errors', not errors, errors[:3])
        browser.close()
finally:
    os.killpg(srv.pid, 15)

bad = [n for n, ok in results if not ok]
print(f'FAILED: {", ".join(bad)}' if bad else f'ALL {len(results)} UPDATE 9.5 E2E CHECKS PASSED')
sys.exit(1 if bad else 0)

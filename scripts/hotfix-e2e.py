"""
UPDATE 7 hotfix browser test — DEVELOPER MODE · USER SQUADS (read-only, server data) +
the reworked goalkeeper in a real browser (Lev Yashin · BLACK SPIDER card).

Starts its own PIPA server (port 8792, test developer code) with seeded accounts:
  DEVK      — the developer's own login
  SQUADKID  — owns Yashin + Casillas, server squad: ronaldo messi son mbappe salah · GK yashin · FK son
  NOSQUAD   — never saved a squad on the server
  ALPHA1 / ALPHA2 — for the partial-nickname search

  python3 scripts/hotfix-e2e.py [out_dir]     (needs `npm run build` first)
"""
import hashlib
import json
import os
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.request

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from squad_seed import seed_script, NO_DAILY_JS, game_version  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8792
BASE = f'http://localhost:{PORT}/'
OUT = sys.argv[1] if len(sys.argv) > 1 else 'hotfix-shots'
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


def account(nick, password, squad, owned=(), mp=0, level=0):
    salt = secrets.token_hex(16)
    h = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=32, maxmem=64 * 1024 * 1024).hex()
    data = {'v6': True, 'mp': mp, 'owned': list(owned), 'rewards': [], 'level': level}
    if squad:
        data['squad'] = squad
    return {'key': nick.lower(), 'nickname': nick, 'salt': salt, 'hash': h, 'tokens': [], 'createdAt': '2026-11-01', 'data': data}


def post(path, body):
    req = urllib.request.Request(BASE.rstrip('/') + path, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


STARTER = {'penaltyOrder': ['mbappe', 'messi', 'ronaldo', 'neymar', 'yamal'], 'goalkeeperId': 'courtois', 'freeKickTakerId': 'messi'}
KID = {'penaltyOrder': ['ronaldo', 'messi', 'son', 'mbappe', 'salah'], 'goalkeeperId': 'yashin', 'freeKickTakerId': 'son'}
data_dir = tempfile.mkdtemp(prefix='pipa-hf-')
with open(os.path.join(data_dir, 'accounts.json'), 'w') as f:
    json.dump({
        'devk': account('DEVK', 'pw1234', STARTER),
        'squadkid': account('SQUADKID', 'pw1234', KID, owned=['yashin', 'casillas'], mp=123_000_000, level=7),
        'nosquad': account('NOSQUAD', 'pw1234', None),
        'alpha1': account('ALPHA1', 'pw1234', STARTER),
        'alpha2': account('ALPHA2', 'pw1234', STARTER),
    }, f)
DEV_CODE = 'pipa-test-dev-7531'
env = {**os.environ, 'PORT': str(PORT), 'PIPA_DATA_DIR': data_dir, 'PIPA_SLOW_TEST': '1', 'DATABASE_URL': '', 'DEVELOPER_CODE': DEV_CODE}
srv = subprocess.Popen(['node', 'server/realtime-server.mjs'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
time.sleep(1.5)

try:
    # ── 1. API: developer token required, read-only ───────────────────
    st, body = post('/api/dev/squad', {'nickname': 'SQUADKID'})
    check('API: /api/dev/squad without a developer token → refused', st in (401, 403) and not body.get('user'), f'{st} {body}')
    st, body = post('/api/dev/squad', {'devToken': 'x' * 40, 'nickname': 'SQUADKID'})
    check('API: a made-up developer token → refused', st in (401, 403) and not body.get('user'), f'{st}')
    st, body = post('/api/dev/auth', {'code': DEV_CODE})
    tok = body.get('devToken')
    st, body = post('/api/dev/squad', {'devToken': tok, 'nickname': 'squadkid'})
    u = body.get('user') or {}
    check('API: the squad exactly as the server stores it', st == 200 and u.get('squad') == KID and u.get('nickname') == 'SQUADKID', f'{st} {u.get("squad")}')
    check('API: owned players included (Yashin, Casillas)', {'yashin', 'casillas'} <= set(u.get('ownedAll', [])) and u.get('squadUsable') is True, str(u.get('ownedAll')))
    with open(os.path.join(data_dir, 'accounts.json')) as f:
        before = f.read()
    post('/api/dev/squad', {'devToken': tok, 'nickname': 'squadkid'})
    with open(os.path.join(data_dir, 'accounts.json')) as f:
        check('API: looking at a squad changes nothing on the server (read-only)', f.read() == before)

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        errors = []
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
        ctx.add_init_script(NO_DAILY_JS)
        # this phone holds a DIFFERENT (local) squad for SQUADKID — the developer view must ignore it
        FAKE = {'penaltyOrder': ['haaland', 'kane', 'yamal', 'neymar', 'vinicius'], 'goalkeeperId': 'alisson', 'freeKickTakerId': 'kane'}
        ctx.add_init_script(seed_script({'DEVK': STARTER, 'SQUADKID': FAKE}))
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(BASE)
        pg.fill('input[autocomplete=username]', 'DEVK')
        pg.fill('input[type=password]', 'pw1234')
        pg.click('text=게임 시작')
        pg.wait_for_selector('[data-testid=play-developer]', timeout=20000)
        check('version badge = current version', pg.inner_text('[data-testid=version-badge]') == f'UPDATE {game_version()}', pg.inner_text('[data-testid=version-badge]'))
        pg.click('[data-testid=play-developer]')
        pg.wait_for_selector('[data-testid=dev-access]')
        pg.fill('[data-testid=dev-code]', DEV_CODE)
        pg.click('[data-testid=dev-submit]')
        pg.wait_for_selector('[data-testid=dev-dashboard]', timeout=10000)
        tabs = pg.inner_text('.dev-tabs')
        check('DEVELOPER DASHBOARD has a USER SQUADS tab next to the others', all(t in tabs for t in ['최근 접속자', '유저 전적', 'MP 관리', 'USER SQUADS']), tabs.replace('\n', ' | '))
        pg.click('[data-testid=dev-tab-squads]')
        pg.wait_for_selector('[data-testid=dev-squads]')
        reqs = []
        pg.on('request', lambda r: reqs.append((r.url, r.post_data)) if '/api/dev/squad' in r.url else None)

        # exact nickname
        pg.fill('[data-testid=dev-sq-input]', 'squadkid')
        pg.click('[data-testid=dev-sq-go]')
        v, _ = wait_for(lambda: pg.locator('[data-testid=dev-sq-user]').count() == 1, 10)
        check('search SQUADKID → the user', bool(v) and pg.get_attribute('[data-testid=dev-sq-user]', 'data-nick') == 'SQUADKID')
        check('the request carries the developer token', bool(reqs) and 'devToken' in (reqs[-1][1] or ''))
        order = pg.eval_on_selector_all('[data-testid=dev-sq-order] [data-testid=dev-sq-card]', 'els => els.map(e => e.dataset.id)')
        nums = pg.eval_on_selector_all('[data-testid=dev-sq-order] .pcard-order', 'els => els.map(e => e.innerText.trim())')
        check('PENALTY ORDER 1–5 = the server squad (not this phone’s local squad)', order == KID['penaltyOrder'] and nums == ['1', '2', '3', '4', '5'], f'{order} {nums}')
        gk = pg.eval_on_selector_all('[data-testid=dev-sq-gk] [data-testid=dev-sq-card]', 'els => els.map(e => [e.dataset.id, e.innerText])')
        check('GOALKEEPER card: Yashin · OVR · GK · BLACK SPIDER', len(gk) == 1 and gk[0][0] == 'yashin' and '야신' in gk[0][1] and 'BLACK SPIDER' in gk[0][1] and '99' in gk[0][1] and 'GK' in gk[0][1], str(gk))
        fk = pg.eval_on_selector_all('[data-testid=dev-sq-fk] [data-testid=dev-sq-card]', 'els => els.map(e => [e.dataset.id, e.innerText])')
        check('FREE KICK TAKER card: Son (+ his special)', len(fk) == 1 and fk[0][0] == 'son' and '⚡' in fk[0][1], str(fk))
        cards = pg.eval_on_selector_all('[data-testid=dev-sq-user] [data-testid=dev-sq-card]', 'els => els.map(e => e.innerText)')
        check('every card shows name, OVR, position and special', all(('OVR' in c and '⚡' in c) for c in cards) and len(cards) == 7, f'{len(cards)} cards')
        head = pg.inner_text('.dev-sq-head')
        check('header: LV / MP / owned count from the server', 'LV 7' in head and '123,000,000' in head, head.replace('\n', ' '))
        pg.screenshot(path=f'{OUT}/01_user_squad.png', full_page=True)
        # read-only: tapping a card selects nothing, there is no save button
        pg.locator('[data-testid=dev-sq-order] [data-testid=player-card]').first.click(force=True)
        check('read-only: cards cannot be selected, no save / edit buttons',
              pg.eval_on_selector_all('[data-testid=dev-sq-user] [data-testid=player-card]', 'els => els.every(e => e.dataset.selected === "0")')
              and not any(w in pg.inner_text('[data-testid=dev-squads]') for w in ['저장', '변경', 'SAVE']))
        pg.click('[data-testid=dev-sq-owned-btn]')
        owned = pg.eval_on_selector_all('[data-testid=dev-sq-owned] [data-testid=dev-sq-card]', 'els => els.map(e => e.dataset.id)')
        check('보유 선수 보기: owned players as cards (Yashin, Casillas + starters in the squad)', {'yashin', 'casillas', 'ronaldo'} <= set(owned), str(owned))
        overflow = pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        check('fits a 390 px phone (no sideways scroll)', overflow <= 0, overflow)
        pg.screenshot(path=f'{OUT}/02_owned.png', full_page=True)

        # partial nickname → pick from the matches
        pg.fill('[data-testid=dev-sq-input]', 'alph')
        pg.click('[data-testid=dev-sq-go]')
        v, _ = wait_for(lambda: pg.locator('[data-testid=dev-sq-match]').count() == 2, 10)
        check('partial nickname → matching users to pick from', bool(v), pg.eval_on_selector_all('[data-testid=dev-sq-match]', 'els => els.map(e => e.dataset.nick)'))
        pg.click('[data-testid=dev-sq-match][data-nick="ALPHA2"]')
        v, _ = wait_for(lambda: pg.get_attribute('[data-testid=dev-sq-user]', 'data-nick') == 'ALPHA2', 10)
        check('pick ALPHA2 → its squad', bool(v))

        pg.fill('[data-testid=dev-sq-input]', 'NOSQUAD')
        pg.click('[data-testid=dev-sq-go]')
        v, _ = wait_for(lambda: pg.is_visible('[data-testid=dev-sq-none]'), 10)
        check('a user without a server squad → "서버에 저장된 스쿼드가 없어요"', bool(v))
        pg.fill('[data-testid=dev-sq-input]', 'zzznobody')
        pg.click('[data-testid=dev-sq-go]')
        v, _ = wait_for(lambda: '그런 유저가 없어요' in pg.inner_text('[data-testid=dev-sq-msg]'), 10)
        check('unknown nickname → "그런 유저가 없어요"', bool(v))

        # the other tabs still work
        pg.click('[data-testid=dev-tab-recent]')
        v, _ = wait_for(lambda: pg.locator('[data-testid=dev-user]').count() >= 5, 10)
        check('최근 접속자 tab still works (search box back)', bool(v) and pg.is_visible('[data-testid=dev-search]'))
        pg.click('[data-testid=dev-tab-mp]')
        check('MP 관리 tab still works', pg.is_visible('[data-testid=dev-mp]'))

        check('no page errors', not errors, errors)
        browser.close()
finally:
    os.killpg(srv.pid, 15)

failed = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} passed')
print('ALL HOTFIX E2E CHECKS PASSED' if not failed else 'FAILED: ' + '; '.join(failed))
sys.exit(1 if failed else 0)

"""
UPDATE 7 browser test — DAILY LOGIN, LEVEL / XP / FV, LEVEL REWARDS, RANKING (+ live refresh),
PROFILE, SELL (user listing sold first, 30 % fee, live sale notice), CANCEL LISTING,
goal vibration (UPDATE 8: the game has no sound — checked that nothing makes any),
and an online PENALTY SHOOTOUT that ends with XP + LEVEL UP + NEW REWARD.

Own server on port 8791 (slow-browser timers) with seeded accounts. Needs `npm run build`.
  python3 scripts/update7-e2e.py [out_dir]
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
PORT = 8791
BASE = f'http://localhost:{PORT}/'
OUT = sys.argv[1] if len(sys.argv) > 1 else 'update7-shots'
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
            'data': {'v6': True, 'mp': mp, 'owned': [], 'rewards': [], 'squad': squad, **extra}}


SQ = lambda fk='messi', extra=None: {'penaltyOrder': (extra or []) + ['mbappe', 'messi', 'ronaldo', 'neymar', 'yamal'][len(extra or []):], 'goalkeeperId': 'courtois', 'freeKickTakerId': fk}
data_dir = tempfile.mkdtemp(prefix='pipa-u7-')
with open(os.path.join(data_dir, 'accounts.json'), 'w') as f:
    json.dump({
        # LV 9, 270/280 XP — one finished online match → LEVEL 10 (NEW REWARD 200 FV); LV 5 reward not claimed yet
        'seller': account('SELLER', 0, SQ('messi', ['gundogan']), owned=['gundogan', 'felix', 'coman'], level=9, xp=270),
        'buyer': account('BUYER', 2_000_000_000, SQ(), level=3, xp=10, lastDailyClaim='2099-01-01'),
        'topmp': account('TOPMP', 3_000_000_000, SQ(), level=20, xp=0, lastDailyClaim='2099-01-01',
                         stats={'penalty': {'wins': 4, 'losses': 1, 'draws': 0}, 'freekick': {'wins': 2, 'losses': 0, 'draws': 1}}),
    }, f)
env = {**os.environ, 'PORT': str(PORT), 'PIPA_DATA_DIR': data_dir, 'PIPA_SLOW_TEST': '1', 'DATABASE_URL': ''}
srv = subprocess.Popen(['node', 'server/realtime-server.mjs'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
time.sleep(1.5)

# record vibration calls (phones only) without a real device
VIBE_JS = """(() => { window.__vibes = []; try { Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (ms) => { window.__vibes.push(ms); return true; } }); } catch (e) {} })()"""

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
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
        errors = []

        def ctx(daily=True):
            c = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=1)
            c.add_init_script(VIBE_JS)
            # UPDATE 8: count every AudioContext the page tries to make (must stay 0)
            c.add_init_script("(() => { window.__audioCtx = 0; for (const k of ['AudioContext', 'webkitAudioContext']) { const A = window[k]; if (A) window[k] = function (...a) { window.__audioCtx++; return new A(...a); }; } })()")
            if not daily:
                c.add_init_script(NO_DAILY_JS)
            return c

        def login(pg, nick):
            pg.goto(BASE)
            pg.fill('input[autocomplete=username]', nick)
            pg.fill('input[type=password]', 'pw1234')
            pg.click('text=게임 시작')

        S_ctx = ctx()
        S = S_ctx.new_page()
        S.on('pageerror', lambda e: errors.append(f'S: {e}'))
        login(S, 'SELLER')

        # ── DAILY LOGIN ───────────────────────────────────────────
        v, _ = wait_for(lambda: S.is_visible('[data-testid=daily]'), 20)
        check('DAILY LOGIN popup on the first login of the (server) day', bool(v))
        days = S.eval_on_selector_all('[data-testid=daily-day]', 'els => els.map(e => e.dataset.day + ":" + e.dataset.state + ":" + e.innerText.replace(/\\n/g, " "))')
        check('7-day track: DAY 1 2M … DAY 5 10M, DAY 6/7 PLAYER PACK; today = DAY 1', len(days) == 7 and days[0].startswith('1:today') and '10M' in days[4] and 'PACK' in days[5] and 'PACK' in days[6], days)
        S.screenshot(path=f'{OUT}/01_daily.png')
        S.click('[data-testid=daily-claim]')
        v, _ = wait_for(lambda: '+2,000,000 MP' in S.inner_text('[data-testid=daily-got]'), 10)
        check('CLAIM → DAY 1 보상 받음 · +2,000,000 MP', bool(v))
        S.click('[data-testid=daily-close]')
        v, _ = wait_for(lambda: S.get_attribute('[data-testid=mp-badge]', 'data-mp') == '2000000', 10)
        check('MP badge = 2,000,000 (server balance)', bool(v))
        S.reload()
        S.wait_for_selector('[data-testid=progress-header]', timeout=20000)
        time.sleep(2)
        check('same day again → no second daily reward popup', not S.is_visible('[data-testid=daily]'))

        # ── HOME header: nickname · LV / XP · MP · FV ──────────────────
        hdr = S.inner_text('[data-testid=progress-header]')
        check('HOME: nickname, LV. 9, XP bar 270 / 280 XP, MP and FV', 'SELLER' in hdr and S.inner_text('[data-testid=level-label]') == 'LV. 9'
              and S.inner_text('[data-testid=xp-label]') == '270 / 280 XP' and S.get_attribute('[data-testid=fv-badge]', 'data-fv') == '0', hdr.replace('\n', ' | '))
        check('HOME menu: 혼자서 · 온라인 · SQUAD · TRANSFER MARKET · RANKING · DEVELOPER MODE',
              all(S.is_visible(f'[data-testid={t}]') for t in ['play-solo', 'play-online', 'play-squad', 'play-market', 'play-ranking', 'play-developer']))
        check(f'UPDATE {game_version()} badge', S.inner_text('[data-testid=version-badge]') == f'UPDATE {game_version()}')
        S.screenshot(path=f'{OUT}/02_home.png')

        # ── LEVEL REWARDS ─────────────────────────────────────────
        check('REWARD available badge (LV 5 not claimed yet)', S.is_visible('[data-testid=reward-available]'))
        S.click('[data-testid=xpbar]')
        S.wait_for_selector('[data-testid=level-rewards]')
        states = S.eval_on_selector_all('[data-testid=reward-row]', 'els => els.map(e => e.dataset.level + ":" + e.dataset.state)')
        check('LEVEL REWARDS track LV 5…50: LV 5 CLAIM, LV 10+ LOCKED', states[0] == '5:claim' and all(x.endswith('locked') for x in states[1:]) and states[-1] == '50:locked', states)
        S.click('[data-testid=reward-row][data-level="5"] [data-testid=claim]')
        v, _ = wait_for(lambda: S.get_attribute('[data-testid=reward-row][data-level="5"]', 'data-state') == 'claimed', 10)
        check('CLAIM → LV 5 +100 FV, now CLAIMED (server keeps claimedLevelRewards)', bool(v) and '100 FV' in S.inner_text('[data-testid=level-msg]'))
        S.screenshot(path=f'{OUT}/03_levels.png')
        tok = S.evaluate("JSON.parse(localStorage.getItem('pipa.session.v1')).token")
        again = S.evaluate("t => fetch('/api/level/claim', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({token: t, level: 5})}).then(r => r.status)", tok)
        check('claiming LV 5 again (e.g. after refresh) is refused by the server', again == 409)
        S.click('[data-testid=levels-back]')
        v, _ = wait_for(lambda: S.get_attribute('[data-testid=fv-badge]', 'data-fv') == '100', 10)
        check('FV 100 on HOME, separate from MP', bool(v) and S.get_attribute('[data-testid=mp-badge]', 'data-mp') == '2000000')

        # ── RANKING + PROFILE ─────────────────────────────────────
        S.click('[data-testid=play-ranking]')
        S.wait_for_selector('[data-testid=rank-row]', timeout=10000)
        rows = S.eval_on_selector_all('[data-testid=rank-row]', 'els => els.map(e => e.dataset.rank + ":" + e.dataset.nick)')
        check('MP RANKING: TOPMP 1st, BUYER 2nd, SELLER 3rd (server MP)', rows[:3] == ['1:TOPMP', '2:BUYER', '3:SELLER'], rows)
        check('MY RANK shown (3위)', S.get_attribute('[data-testid=my-rank]', 'data-rank') == '3')
        S.click('[data-testid=rank-tab-penalty]')
        v, _ = wait_for(lambda: 'WINS' in S.inner_text('[data-testid=rank-list]'), 10)
        first = S.eval_on_selector_all('[data-testid=rank-row]', 'els => els.map(e => e.dataset.nick + "|" + e.innerText.replace(/\\n/g, " "))')
        check('PENALTY WINS: TOPMP 4 WINS first', bool(v) and first[0].startswith('TOPMP|') and '4 WINS' in first[0], first[:3])
        S.click('[data-testid=rank-tab-freekick]')
        v, _ = wait_for(lambda: '2 WINS' in S.inner_text('[data-testid=rank-row] >> nth=0'), 10)
        check('FREE KICK WINS kept separate (TOPMP 2 WINS)', bool(v))
        S.click('[data-testid=rank-row][data-nick="TOPMP"]')
        v, _ = wait_for(lambda: S.inner_text('[data-testid=profile-name]') == 'TOPMP', 10)
        prof = S.inner_text('[data-testid=profile]')
        check('PROFILE: LEVEL 20, MP, FV, PENALTY 4W / 1L, FREE KICK 2W / 0L / 1D', bool(v) and 'LEVEL 20' in prof and '3,000,000,000 MP' in prof
              and S.inner_text('[data-testid=profile-penalty]') == '4W / 1L' and S.inner_text('[data-testid=profile-freekick]') == '2W / 0L / 1D', prof.replace('\n', ' | '))
        S.screenshot(path=f'{OUT}/04_profile.png')
        S.click('[data-testid=profile]', position={'x': 5, 'y': 5})
        S.click('[data-testid=ranking-back]')

        # ── SELL ──────────────────────────────────────────────────
        S.click('[data-testid=play-market]')
        S.click('[data-testid=market-tab-mine]')
        S.wait_for_selector('[data-testid=my-players]')
        tag = lambda pid: S.get_attribute(f'[data-testid=mine-row][data-id="{pid}"]', 'data-tag')
        check('MY PLAYERS: starters UNTRADEABLE, Gündoğan (in squad) blocked, Félix / Coman sellable',
              tag('messi') == 'untradeable' and 'UNTRADEABLE' in S.inner_text('[data-testid=mine-row][data-id="messi"]') and tag('gundogan') == 'squad' and tag('felix') == 'sellable')
        S.click('[data-testid=mine-row][data-id="gundogan"] [data-testid=sell-blocked]')
        v, _ = wait_for(lambda: '현재 스쿼드에서 사용 중인 선수입니다.' in S.inner_text('[data-testid=market-toast]'), 5)
        check('a squad player → "현재 스쿼드에서 사용 중인 선수입니다."', bool(v))
        S.click('[data-testid=mine-row][data-id="felix"] [data-testid=sell-player]')
        S.wait_for_selector('[data-testid=sell-dialog]')
        S.fill('[data-testid=sell-price]', '100,000,000')
        check('price below 80 % of value → 판매 등록 disabled', S.is_disabled('[data-testid=sell-submit]'))
        S.fill('[data-testid=sell-price]', '180,000,000')
        dlg = S.inner_text('[data-testid=sell-dialog]')
        check('SELL dialog: 판매 가격 180,000,000 · 수수료 54,000,000 (30%) · 받을 금액 126,000,000 · [판매 등록] [취소]',
              S.inner_text('[data-testid=sell-fee]') == '54,000,000 MP' and S.inner_text('[data-testid=sell-net]') == '126,000,000 MP' and '판매 등록' in dlg and '취소' in dlg, dlg.replace('\n', ' | '))
        S.screenshot(path=f'{OUT}/05_sell.png')
        S.click('[data-testid=sell-submit]')
        v, _ = wait_for(lambda: S.get_attribute('[data-testid=mine-row][data-id="felix"]', 'data-tag') == 'listed', 10)
        check('판매 등록 → LISTED (no MP yet)', bool(v) and S.get_attribute('[data-testid=mp-badge]', 'data-mp') == '2000000')
        # list Coman too, then cancel it
        S.click('[data-testid=mine-row][data-id="coman"] [data-testid=sell-player]')
        S.click('[data-testid=sell-submit]')
        wait_for(lambda: S.get_attribute('[data-testid=mine-row][data-id="coman"]', 'data-tag') == 'listed', 10)
        S.click('[data-testid=mine-row][data-id="coman"][data-tag="listed"] [data-testid=cancel-listing]')
        v, _ = wait_for(lambda: S.get_attribute('[data-testid=mine-row][data-id="coman"]', 'data-tag') == 'sellable', 10)
        check('CANCEL LISTING → back in MY PLAYERS', bool(v))
        S.click('[data-testid=market-back]')

        # ── BUYER buys: the user listing first; SELLER told live ─────────
        B_ctx = ctx(daily=False)
        B = B_ctx.new_page()
        B.on('pageerror', lambda e: errors.append(f'B: {e}'))
        login(B, 'BUYER')
        B.wait_for_selector('[data-testid=play-market]', timeout=20000)
        B.click('[data-testid=play-market]')
        B.wait_for_selector('[data-testid=player-card][data-id="felix"]')
        v, _ = wait_for(lambda: B.is_visible('[data-testid=player-card][data-id="felix"] [data-testid=card-user]'), 10)
        check('BUYER sees Félix as a USER listing (USER ×1, 180,000,000 MP)', bool(v) and '180,000,000' in B.inner_text('[data-testid=player-card][data-id="felix"] [data-testid=card-price]'))
        B.click('[data-testid=player-card][data-id="felix"] .pcard-info')
        B.click('[data-testid=buy]')
        B.wait_for_selector('[data-testid=buy-confirm]')
        check('buy confirm says it is a user listing', B.is_visible('[data-testid=confirm-source]'))
        B.click('[data-testid=confirm-buy]')
        v, _ = wait_for(lambda: '주앙 펠릭스 영입 완료' in B.inner_text('[data-testid=market-toast]'), 15)
        check('BUYER: 영입 완료 (paid 180,000,000)', bool(v) and B.get_attribute('[data-testid=mp-badge]', 'data-mp') == str(2_000_000_000 - 180_000_000))
        v, _ = wait_for(lambda: S.is_visible('[data-testid=sale-toast]'), 10)
        st = S.inner_text('[data-testid=sale-toast]') if v else ''
        check('SELLER (online) sees "J. FELIX 판매 완료! +126,000,000 MP" at once', bool(v) and '판매 완료!' in st and '+126,000,000 MP' in st, st)
        v, _ = wait_for(lambda: S.get_attribute('[data-testid=mp-badge]', 'data-mp') == str(2_000_000 + 126_000_000), 10)
        check('SELLER MP +126,000,000 (70 %) without refresh', bool(v))
        S.screenshot(path=f'{OUT}/06_sale_toast.png')
        B.click('[data-testid=market-back]')

        # ── VIBRATION, NO SOUND (solo penalty) — UPDATE 8 removed every sound ────
        S.click('[data-testid=play-solo]')
        S.click('text=PENALTY KICK')
        S.click('[data-testid=player-card][data-id="messi"] .pcard-hit')
        S.wait_for_function('window.__PIPA && window.__PIPA.debug().phase === "aim"', timeout=20000)
        S.mouse.click(30, 300)  # a user gesture (would have unlocked audio before UPDATE 8)
        check('UPDATE 8: no SOUND toggle in the game HUD, no sound engine', S.locator('[data-testid=sound-toggle]').count() == 0 and S.evaluate('typeof window.__PIPA_SOUND') == 'undefined')
        goal_seen = False
        for k in range(8):
            S.wait_for_function('window.__PIPA.debug().phase === "aim"', timeout=40000)
            S.evaluate("""(fx) => { const v = window.__PIPA, d = v.debug(), b = d.ball, g = d.goal;
                const gx = g.left + (g.right - g.left) * fx, gy = g.bottom + (g.top - g.bottom) * 0.25, pts = [];
                for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push({ x: b.x + (gx - b.x) * t, y: b.y + (gy - b.y) * t, t: 1000 + 160 * t }); }
                v.simulateSwipe(pts); }""", 0.08 if k % 2 else 0.92)
            S.wait_for_function('window.__PIPA.debug().phase === "result"', timeout=40000)
            outcome = S.evaluate('window.__PIPA.debug().outcome')
            if outcome == 'GOAL':
                check('GOAL → one short vibration (45 ms)', S.evaluate('window.__vibes') == [45], S.evaluate('window.__vibes'))
                goal_seen = True
                break
            else:
                check(f'{outcome} → no vibration', not S.evaluate('window.__vibes'))
            S.wait_for_function('window.__PIPA.game.canContinue()', timeout=30000)
            S.mouse.click(195, 420)
        check('a GOAL happened in the vibration test', goal_seen)
        check('UPDATE 8: kicks and goals made no audio at all (0 AudioContext)', S.evaluate('window.__audioCtx') == 0, S.evaluate('window.__audioCtx'))
        S.wait_for_function('window.__PIPA.game.canContinue()', timeout=30000)
        S.mouse.click(195, 420)
        S.wait_for_function('window.__PIPA.debug().phase === "aim"', timeout=30000)
        S.reload()
        S.wait_for_selector('[data-testid=progress-header]', timeout=20000)
        check('UPDATE 8: no SOUND toggle on the home screen', S.locator('[data-testid=sound-toggle]').count() == 0)

        # ── ONLINE MATCH → XP · LEVEL UP · NEW REWARD · live RANKING ──
        T_ctx = ctx(daily=False)
        T = T_ctx.new_page()
        login(T, 'TOPMP')
        T.wait_for_selector('[data-testid=play-ranking]', timeout=20000)
        T.click('[data-testid=play-ranking]')
        T.click('[data-testid=rank-tab-penalty]')
        T.wait_for_selector('[data-testid=rank-row]')
        for pg in (S, B):
            pg.click('[data-testid=play-online]')
            pg.click('[data-testid=online-penalty]')
            pg.wait_for_selector('.lobby')
        wait_for(lambda: S.locator('[data-testid=player-row][data-nick="BUYER"] button').is_enabled(timeout=500), 15)
        S.click('[data-testid=player-row][data-nick="BUYER"] button')
        B.wait_for_selector('[data-testid=challenge-panel]', timeout=8000)
        B.click('[data-testid=cp-accept]')
        wait_for(lambda: S.is_enabled('[data-testid=mf-ready]') and B.is_enabled('[data-testid=mf-ready]'), 15)
        S.click('[data-testid=mf-ready]')
        B.click('[data-testid=mf-ready]')
        for r in range(1, 11):
            v, _ = wait_for(lambda: S.get_attribute('[data-testid=online-game]', 'data-round') == str(r) and S.get_attribute('[data-testid=online-game]', 'data-phase') == 'aim'
                            and B.get_attribute('[data-testid=online-game]', 'data-phase') == 'aim', 45)
            if not v:
                check(f'round {r} reached', False)
                break
            kick = S if S.get_attribute('[data-testid=online-game]', 'data-role') == 'kicker' else B
            # SELLER scores in the corner, BUYER shoots at the keeper's body
            kick.evaluate(SHOOT_JS, ['L' if r % 4 < 2 else 'R', 0.2, 170] if kick is S else ['C', 0.5, 300])
            wait_for(lambda: S.get_attribute('[data-testid=online-game]', 'data-phase') == 'result' or S.is_visible('[data-testid=match-result]'), 45)
        v, _ = wait_for(lambda: S.is_visible('[data-testid=match-result]') and B.is_visible('[data-testid=match-result]'), 60)
        check('online PENALTY SHOOTOUT finished', bool(v))
        check('UPDATE 8: the online match made no audio either', S.evaluate('window.__audioCtx') == 0)
        v, _ = wait_for(lambda: S.is_visible('[data-testid=xp-gain]'), 15)
        xs = S.inner_text('[data-testid=xp-gain]') if v else ''
        verdict = S.get_attribute('[data-testid=match-result]', 'data-verdict')
        want = {'VICTORY': 120, 'DRAW': 80, 'DEFEAT': 60}[verdict]
        check(f'result screen: +{want} XP for {verdict} (server)', bool(v) and S.get_attribute('[data-testid=xp-gain]', 'data-xp') == str(want), xs)
        check('LEVEL UP! LV. 9 → LV. 10 with glow', S.is_visible('[data-testid=level-up]') and 'LV. 9' in xs and 'LV. 10' in xs, xs)
        check('NEW REWARD · 200 FV AVAILABLE', '200 FV AVAILABLE' in S.inner_text('[data-testid=new-reward]'))
        bx = B.get_attribute('[data-testid=xp-gain]', 'data-xp')
        check('the opponent also gets XP for finishing (loser +60 / draw +80)', bx in ('60', '80', '120'), bx)
        if verdict == 'VICTORY':
            check('winner still gets +10,000,000 MP', S.get_attribute('[data-testid=final-reward]', 'data-reward') == '10000000')
        S.screenshot(path=f'{OUT}/07_level_up.png')
        win_nick = 'SELLER' if verdict == 'VICTORY' else 'BUYER' if verdict == 'DEFEAT' else None
        if win_nick:
            v, _ = wait_for(lambda: any(win_nick in x and '1 WINS' in x for x in T.eval_on_selector_all('[data-testid=rank-row]', 'els => els.map(e => e.innerText)')), 20)
            check('RANKING open on a third phone updates by itself (no refresh)', bool(v))
        T.screenshot(path=f'{OUT}/08_ranking_live.png')
        # replaying the end can't pay XP twice
        me = S.evaluate("t => fetch('/api/me', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({token: t})}).then(r => r.json())", tok)
        check('server: LEVEL 10 with the right XP, counted once', me['level'] == 10 and me['xp'] == 270 + want - 280, f"LV {me['level']} XP {me['xp']}")
        check('no JS errors', not errors, errors[:3])
        browser.close()
finally:
    os.killpg(srv.pid, 15)

fails = [n for n, ok in results if not ok]
print('\n' + (f'{len(fails)} FAILED: {fails}' if fails else f'ALL {len(results)} UPDATE 7 E2E CHECKS PASSED'))
sys.exit(1 if fails else 0)

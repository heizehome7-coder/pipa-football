"""
Checks the claude.ai artifact-room adapter end to end: two pages run the
single-file build with a stand-in `window.claude` whose `room`/`user`
follow the runtime contract (presence merge, null removes a field,
onPeers snapshots incl. sameTab, clear-on-leave), shared via BroadcastChannel.
  npm run build:single && python3 scripts/artifact-room-e2e.py
"""
import os, sys, time
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from squad_seed import seed_script  # noqa: E402

URL = 'file://' + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dist-single', 'index.html')
FAKE = r"""
(() => {
  const peer = 'p' + Math.random().toString(36).slice(2, 10);
  const uid = 'u_' + Math.random().toString(36).slice(2, 10);
  function makeRoom(name) {
    const ch = new BroadcastChannel('fake-room-' + name);
    let mine = {}; const others = new Map(); const subs = new Set();
    const snap = () => Object.freeze([
      Object.freeze({ peer, by: uid, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze({ ...mine }), updatedAt: Date.now() }),
      ...[...others].map(([p, v]) => Object.freeze({ peer: p, by: v.by, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: Object.freeze(v.presence), updatedAt: v.at })),
    ]);
    const emit = () => { const s = snap(); subs.forEach(f => f({ peers: s, joined: [], left: [], updated: [] })); };
    const post = (t) => ch.postMessage({ t, peer, by: uid, presence: mine });
    ch.onmessage = (e) => { const m = e.data; if (m.peer === peer) return;
      if (m.t === 'bye') { others.delete(m.peer); emit(); return; }
      if (m.t === 'hello') post('p');
      others.set(m.peer, { presence: m.presence, by: m.by, at: Date.now() }); emit(); };
    addEventListener('pagehide', () => post('bye'));
    post('hello');
    return {
      presence: async (patch) => { mine = { ...mine }; for (const k in patch) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; } post('p'); emit(); },
      peers: snap,
      onPeers: (h) => { const f = (c) => h(c); subs.add(f); queueMicrotask(() => h({ peers: snap(), joined: snap(), left: [], updated: [] })); return () => subs.delete(f); },
      onConnection: (h) => { queueMicrotask(() => h(true)); return () => {}; },
      connected: () => true,
      emit: async () => {}, on: () => () => {},
      join: async (n) => { const r = makeRoom(name + '/' + n); return { ...r, name: n, leave: async () => { r.presence({}); } }; },
    };
  }
  const room = makeRoom('lobby');
  const user = { id: async () => uid, isOwner: async () => false, canEdit: async () => false };
  window.claude = { use: async (n) => (n === 'room' ? room : n === 'user' ? user : null) };
})();
"""
res = []
def check(n, ok, info=''):
    res.append(ok); print(('PASS ' if ok else 'FAIL ') + n + (f'  — {info}' if info != '' else ''), flush=True)
def wait(fn, t=10):
    end = time.time() + t
    while time.time() < end:
        try:
            if fn(): return True
        except Exception: pass
        time.sleep(0.1)
    return False

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    ctx.add_init_script(seed_script({'제작자': None, 'MINHO': None}))
    ctx.add_init_script(FAKE)
    errs = []
    def login(nick):
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(URL); pg.fill('input[autocomplete=username]', nick); pg.fill('input[type=password]', 'pw1234')
        pg.click('text=게임 시작'); pg.click('[data-testid=play-online]'); pg.click('[data-testid=online-penalty]'); pg.wait_for_selector('.lobby')
        return pg
    A = login('제작자')
    # friend has the page open but has not logged in to PIPA yet
    F = ctx.new_page(); F.goto(URL)
    check('diagnostic: page viewer count shows a friend who has not logged in yet',
          wait(lambda: '지금 이 페이지를 연 사람 1명' in A.inner_text('[data-testid=players-empty]')))
    A.screenshot(path='/tmp/claude-0/-home-claude/20a8aa8f-4134-5bc5-a2fa-70ccff349922/scratchpad/diag.png')
    F.close()
    B = login('MINHO')
    rows = lambda pg: pg.eval_on_selector_all('[data-testid=player-row]', 'e => e.map(x => x.dataset.nick)')
    check('artifact room: both players listed live', wait(lambda: rows(A) == ['MINHO'] and rows(B) == ['제작자']), (rows(A), rows(B)))
    check('artifact room: status shows ONLINE', 'ONLINE' in A.inner_text('[data-testid=me-card]'))
    # phone in the background: B's timers freeze (no heartbeat) but it is still connected
    B.evaluate('clearInterval(window.__PIPA_LOBBY.timer)')
    time.sleep(42)
    check('a connected player whose phone froze timers for 40 s stays listed', rows(A) == ['MINHO'], rows(A))
    B.evaluate("window.__PIPA_LOBBY.timer = setInterval(() => window.__PIPA_LOBBY.tick(), 500)")
    A.click('[data-testid=player-row][data-nick="MINHO"] button')
    check('artifact room: request appears on B', wait(lambda: B.is_visible('[data-testid=challenge-panel]')))
    B.click('[data-testid=cp-accept]')
    check('artifact room: both reach MATCH FOUND', wait(lambda: A.is_visible('[data-testid=match-found]') and B.is_visible('[data-testid=match-found]')))
    ia = A.get_attribute('[data-testid=match-found]', 'data-match-id'); ib = B.get_attribute('[data-testid=match-found]', 'data-match-id')
    check('artifact room: same match id on both pages', ia == ib and bool(ia), ia)
    B.close()
    check('artifact room: closing B ends the match on A', wait(lambda: '상대방의 연결이 종료되었습니다.' in A.inner_text('[data-testid=mf-sub]')))
    check('no JS errors', not errs, errs[:2])
    b.close()
print('\n' + ('ALL ARTIFACT-ROOM CHECKS PASSED' if all(res) else 'SOME CHECKS FAILED'))
sys.exit(0 if all(res) else 1)

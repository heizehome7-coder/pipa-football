/**
 * Lobby protocol tests: several clients on an in-memory realtime hub with a
 * controllable clock. Covers presence, challenge → accept / reject / expire,
 * duplicate prevention, busy players, simultaneous requests and disconnects.
 *   npx tsx scripts/lobby-test.ts
 */
import { MemoryChannel, MemoryHub } from '../src/online/channel/MemoryChannel';
import { LobbyClient } from '../src/online/LobbyClient';

let clock = 1_000_000;
const now = () => clock;
let failures = 0;
function check(name: string, ok: boolean, info: unknown = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== '' ? '  — ' + JSON.stringify(info) : ''}`);
  if (!ok) failures++;
}

async function world(...names: string[]) {
  const hub = new MemoryHub(now);
  const clients = names.map((n, i) => {
    const ch = new MemoryChannel(hub);
    const c = new LobbyClient(ch, { nickname: n, userId: `u${i}` }, { now, tickMs: 1e9, noticeMs: 1e9 });
    return { c, ch };
  });
  for (const x of clients) await x.c.start();
  for (const x of clients) x.c.enterLobby();
  await hub.settle();
  const settle = async () => {
    for (let i = 0; i < 4; i++) {
      clients.forEach((x) => x.c.tick());
      await hub.settle();
    }
  };
  await settle();
  return { hub, clients, settle, snap: (i: number) => clients[i].c.getSnapshot() };
}
const notices = (s: ReturnType<LobbyClient['getSnapshot']>) => s.notices.map((n) => n.text);

// 1. presence
{
  const w = await world('HAZE', 'MINHO', 'JIN');
  const a = w.snap(0);
  check('each client sees the other online players, not itself', a.players.map((p) => p.nickname).join(',') === 'JIN,MINHO' && a.connection === 'online');
  check('statuses are published (in_lobby)', a.players.every((p) => p.status === 'in_lobby'));
  w.clients[2].c.stop();
  await w.settle();
  check('a player who closes the app disappears from the list', w.snap(0).players.map((p) => p.nickname).join(',') === 'MINHO');
}

// 2. challenge → incoming → accept → both MATCH FOUND with the same id
{
  const w = await world('HAZE', 'MINHO');
  const [A, B] = w.clients;
  const bPeer = w.snap(0).players[0].peer;
  check('challenge accepted for an available player', A.c.challenge(bPeer));
  await w.settle();
  const a1 = w.snap(0);
  const b1 = w.snap(1);
  check('sender shows "신청 중" state and cannot send again', a1.outgoing?.receiverNickname === 'MINHO' && a1.players[0].requestedByMe && !A.c.challenge(bPeer));
  check('challenge record has the required fields', !!a1.outgoing && ['challengeId', 'senderId', 'senderNickname', 'receiverId', 'status', 'createdAt'].every((k) => k in a1.outgoing!));
  check('receiver gets the request in realtime', b1.incoming?.senderNickname === 'HAZE' && b1.incoming.status === 'pending');
  check('both show as pending to others', a1.me.status === 'pending' && b1.me.status === 'pending');
  B.c.accept();
  await w.settle();
  const a2 = w.snap(0);
  const b2 = w.snap(1);
  check('accept → both clients enter the match', !!a2.match && !!b2.match);
  check('both share the same match/challenge id and room', a2.match?.matchId === b2.match?.matchId && a2.match?.roomName === b2.match?.roomName, a2.match?.matchId);
  check('opponents are each other', a2.match?.opponent.nickname === 'MINHO' && b2.match?.opponent.nickname === 'HAZE');
  check('both see each other joined; status in_match', !!a2.match?.opponentJoined && !!b2.match?.opponentJoined && a2.me.status === 'in_match');
  A.c.setReady();
  await w.settle();
  check('경기 준비 is seen by the opponent', !!w.snap(1).match?.opponentReady);
}

// 3. reject
{
  const w = await world('HAZE', 'MINHO');
  const [A, B] = w.clients;
  A.c.challenge(w.snap(0).players[0].peer);
  await w.settle();
  B.c.reject();
  await w.settle();
  const a = w.snap(0);
  check('reject → sender is told and can challenge again', a.outgoing === null && notices(a).includes('MINHO님이 대결 신청을 거절했습니다.') && a.players[0].canChallenge);
  check('receiver panel closes', w.snap(1).incoming === null && !w.snap(1).match);
}

// 4. expire after 30 s
{
  const w = await world('HAZE', 'MINHO');
  const [A] = w.clients;
  A.c.challenge(w.snap(0).players[0].peer);
  await w.settle();
  clock += 31_000;
  await w.settle();
  check('no answer in 30 s → expired, sender told', notices(w.snap(0)).includes('대결 신청 시간이 만료되었습니다.') && w.snap(0).outgoing === null);
  check('receiver panel disappears on expiry', w.snap(1).incoming === null);
  clock += 3_000;
  await w.settle();
  check('button usable again after expiry', w.snap(0).players[0].canChallenge);
}

// 5. busy players: third party can't challenge someone pending / in a match
{
  const w = await world('A', 'B', 'C');
  const [A, B, C] = w.clients;
  const peerOf = (i: number, name: string) => w.snap(i).players.find((p) => p.nickname === name)!.peer;
  A.c.challenge(peerOf(0, 'B'));
  await w.settle();
  const cView = w.snap(2).players;
  check('others see pending players as "응답 대기 중" with button disabled',
    cView.find((p) => p.nickname === 'A')?.busyLabel === '응답 대기 중' && !cView.find((p) => p.nickname === 'B')?.canChallenge);
  check('challenging a pending player is refused', !C.c.challenge(peerOf(2, 'B')));
  B.c.accept();
  await w.settle();
  const cView2 = w.snap(2).players;
  check('matched players show "대결 중" and cannot be challenged', cView2.every((p) => p.busyLabel === '대결 중' && !p.canChallenge));
}

// 6. simultaneous challenges A→B and B→A → one shared match
{
  const w = await world('HAZE', 'MINHO');
  const [A, B] = w.clients;
  const bPeer = w.snap(0).players[0].peer;
  const aPeer = w.snap(1).players[0].peer;
  A.c.challenge(bPeer);
  B.c.challenge(aPeer); // before either sees the other's request
  await w.settle();
  const a = w.snap(0);
  const b = w.snap(1);
  check('race: both end in ONE match with the same id', !!a.match && !!b.match && a.match.matchId === b.match.matchId, [a.match?.matchId, b.match?.matchId]);
  check('race: no leftover panels or pending requests', !a.incoming && !b.incoming && !a.outgoing && !b.outgoing);
}

// 7. B already challenged A, then A presses 대결 신청 on B → uses the existing request
{
  const w = await world('HAZE', 'MINHO');
  const [A, B] = w.clients;
  B.c.challenge(w.snap(1).players[0].peer);
  await w.settle();
  const existing = w.snap(0).incoming?.challengeId;
  A.c.challenge(w.snap(0).players[0].peer);
  await w.settle();
  check('existing pending request is reused (no second challenge)', w.snap(0).match?.matchId === existing && w.snap(1).match?.matchId === existing);
}

// 8. disconnects
{
  const w = await world('HAZE', 'MINHO');
  const [A, B] = w.clients;
  A.c.challenge(w.snap(0).players[0].peer);
  await w.settle();
  B.c.stop(); // receiver closes the browser while the request is pending
  await w.settle();
  check('receiver disconnects → request cancelled, sender told', w.snap(0).outgoing === null && notices(w.snap(0)).includes('상대방의 연결이 종료되었습니다.'));
}
{
  const w = await world('HAZE', 'MINHO');
  const [A] = w.clients;
  A.c.challenge(w.snap(0).players[0].peer);
  await w.settle();
  A.c.stop(); // sender disappears
  await w.settle();
  check('sender disconnects → receiver panel closes with a notice', w.snap(1).incoming === null && notices(w.snap(1)).includes('상대방의 연결이 종료되었습니다.'));
}
{
  const w = await world('HAZE', 'MINHO');
  const [A, B] = w.clients;
  A.c.challenge(w.snap(0).players[0].peer);
  await w.settle();
  B.c.accept();
  await w.settle();
  B.c.stop();
  await w.settle();
  check('opponent leaves after MATCH FOUND → match marked ended', w.snap(0).match?.ended === 'opponent_left');
  A.c.leaveMatch();
  await w.settle();
  check('back to the lobby after leaving the match', !w.snap(0).match && w.snap(0).me.status === 'in_lobby');
}
{
  // heartbeat: a frozen client (no more presence updates) is dropped after the stale window
  const w = await world('HAZE', 'MINHO');
  w.clients[1].ch.frozen = true;
  clock += 20_000;
  await w.settle();
  check('frozen client still listed within the heartbeat window', w.snap(0).players.length === 1);
  clock += 20_000;
  await w.settle();
  check('missed heartbeats → removed from the online list', w.snap(0).players.length === 0);
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll lobby protocol checks passed');
process.exit(failures ? 1 : 0);

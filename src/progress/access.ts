/**
 * UPDATE 11 patch — weekday play time limit (Asia/Seoul): MON–FRI 08:35–15:00 KST nobody plays
 * (login works, the developer screen works). Weekends are open. The SERVER's clock decides
 * (a phone's clock can't get round it); the developer can open the whole game any time
 * (SERVER ACCESS CONTROL) and switch the automatic limit back on.
 */
export const ACCESS_TEXT = {
  title: 'PIPA 이용 제한 시간입니다.',
  body: '평일 오전 8시 35분부터 오후 3시까지 게임을 이용할 수 없습니다.',
  after: '오후 3시 이후 다시 이용해주세요.',
} as const;
const KST = 9 * 3600_000;
const FROM = 8 * 60 + 35;
const TO = 15 * 60;

/** is this moment inside the weekday window (KST)? + when it ends (ms) */
export function accessWindow(nowMs: number) {
  const k = new Date(nowMs + KST);
  const dow = k.getUTCDay(); // 0 Sun … 6 Sat (in Seoul)
  const min = k.getUTCHours() * 60 + k.getUTCMinutes();
  const inside = dow >= 1 && dow <= 5 && min >= FROM && min < TO;
  const dayStart = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - KST;
  return { inside, endsAt: inside ? dayStart + TO * 60_000 : null, dow, minute: min };
}

/**
 * UPDATE 10 — WEEKLY MISSIONS (same for everyone, reset every Monday 00:00 Korea time).
 * The server counts progress from real match results and real play time, and pays each
 * reward once per week.
 */
const M = 1_000_000;

export type MissionId = 'perfect' | 'playtime' | 'online3' | 'goals10' | 'fkwin';
export interface Mission {
  id: MissionId;
  title: string;
  desc: string;
  goal: number;
  unit: string;
  reward: { fv?: number; mp?: number };
}
export const MISSIONS: Mission[] = [
  { id: 'perfect', title: 'PERFECT SHOOTOUT', desc: '온라인 승부차기에서 내 킥을 한 번도 놓치지 않고(5번 이상 모두 성공) 승리', goal: 1, unit: '회', reward: { fv: 120 } },
  { id: 'playtime', title: 'PLAY FOR 5 MINUTES', desc: '싱글 · 온라인 실제 경기 플레이 시간 5분', goal: 300, unit: '초', reward: { fv: 50 } },
  { id: 'online3', title: 'ONLINE CHALLENGER', desc: '온라인 경기 3판 끝까지 완료 (승패 무관)', goal: 3, unit: '판', reward: { fv: 30 } },
  { id: 'goals10', title: 'GOAL MACHINE', desc: '온라인 경기에서 총 10골 (승부차기 + 프리킥)', goal: 10, unit: '골', reward: { mp: 20 * M } },
  { id: 'fkwin', title: 'FREE KICK WINNER', desc: '온라인 프리킥 대결 1회 승리', goal: 1, unit: '승', reward: { fv: 50 } },
];

const DAY = 86_400_000;
/** this week's key: the Monday (Korea time) it started, e.g. "2026-11-02" */
export function weekKey(ms: number) {
  const k = new Date(ms + 9 * 3600_000); // Korea time as UTC fields
  const dow = (k.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - dow * DAY);
  return monday.toISOString().slice(0, 10);
}
/** ms until the next Monday 00:00 KST */
export function msToReset(ms: number) {
  const start = Date.parse(`${weekKey(ms)}T00:00:00+09:00`);
  return start + 7 * DAY - ms;
}

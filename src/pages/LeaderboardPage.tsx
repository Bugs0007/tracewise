import { useEffect, useState } from 'react';
import { accountsConfigured, fetchBoard, useAccount } from '@/account/account';
import type { BoardRow, BoardScope } from '@/account/leaderboard';
import { useApp } from '@/store/store';
import { href } from '@/router';

const TABS: [BoardScope, string][] = [
  ['all', 'All time'],
  ['week', 'This week'],
];

export default function LeaderboardPage() {
  const [scope, setScope] = useState<BoardScope>('all');
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const signedIn = useAccount((a) => a.status === 'signed-in');
  const optedIn = useApp((s) => s.settings.leaderboard);

  useEffect(() => {
    if (!accountsConfigured) return;
    let alive = true;
    setRows(null);
    setFailed(false);
    fetchBoard(scope)
      .then((r) => alive && setRows(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [scope]);

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <h1>Leaderboard</h1>
      {!accountsConfigured ? (
        <div className="callout info" data-testid="board-unavailable">
          The leaderboard needs accounts, which are not set up on this copy of Tracewise. Your progress is saved on this device either way.
        </div>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Players who opt in appear here by level only. No names, no photos, no points: just a rank and a level. Ranks use total XP (all time) or XP earned this week (resets every Monday, UTC).
          </p>
          <div className="seg" role="group" aria-label="Leaderboard period" style={{ marginBottom: 14 }}>
            {TABS.map(([v, l]) => (
              <button key={v} aria-pressed={scope === v} onClick={() => setScope(v)} data-testid={`board-${v}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="card col" style={{ gap: 0, padding: 0 }}>
            {failed && <div className="callout warn" style={{ margin: 12 }}>The leaderboard could not be loaded. Try again in a moment.</div>}
            {!failed && rows === null && <div className="dim" style={{ padding: 16 }}>Loading…</div>}
            {rows?.length === 0 && <div className="dim" style={{ padding: 16 }}>{scope === 'week' ? 'Nobody has earned XP this week yet.' : 'Nobody has joined yet. Be the first.'}</div>}
            {rows?.length ? (
              <ol style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="board-list">
                {rows.map((r, i) => (
                  <li
                    key={i}
                    className="row"
                    aria-current={r.isMe ? 'true' : undefined}
                    style={{ justifyContent: 'space-between', padding: '12px 16px', borderTop: i ? '1px solid var(--line)' : undefined, fontWeight: r.isMe ? 700 : 400, borderLeft: r.isMe ? '4px solid var(--accent)' : '4px solid transparent' }}
                  >
                    <span className="mono" style={{ minWidth: 48 }}>#{r.rank}</span>
                    <span>Level {r.level}</span>
                    <span className="dim" style={{ minWidth: 40, textAlign: 'right' }}>{r.isMe ? 'You' : ''}</span>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
          {!signedIn || !optedIn ? (
            <p className="dim" style={{ fontSize: 13 }}>
              To appear here, sign in and turn on “Show my level on the leaderboard” in <a href={href('/settings')}>Settings</a>.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

import { dueReviews, useApp } from '@/store/store';
import { href } from '@/router';
import './pages.css';

export default function PracticePage() {
  const due = useApp((s) => dueReviews(s).length);
  const rows: { to: string; title: string; text: string; note?: string }[] = [
    { to: '/review', title: 'Review queue', text: 'Things you got wrong come back after 1, 2, 4, 7, 15 and 30 days until they stick.', note: due ? `${due} due` : 'Nothing due' },
    { to: '/review?quick=1', title: 'Quick 10', text: 'Ten minutes of due reviews, quick questions and one bug to fix.' },
    { to: '/gym', title: 'Syntax gym', text: 'Retype real Python, JavaScript and React idioms until your fingers know them.' },
    { to: '/lab', title: 'Visualizer lab', text: 'Open any of the visualizers on its own. Change the input and step through it.' },
    { to: '/lab/trace', title: 'Trace your own Python', text: 'Write a function, pick the arguments, and step through what your code does.' },
    { to: '/lab/architect', title: 'Architecture lab', text: 'Wire components together, run traffic through the design, and find the bottleneck.' },
  ];
  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <h1>Practice</h1>
      <p className="muted">Short sessions that build recall. None of them give hints.</p>
      <div className="plain-list">
        {rows.map((r) => (
          <a key={r.to} href={href(r.to)} className="plain-row">
            <div className="grow">
              <h3>{r.title}</h3>
              <p>{r.text}</p>
            </div>
            {r.note && <span className="chip">{r.note}</span>}
          </a>
        ))}
      </div>
    </div>
  );
}

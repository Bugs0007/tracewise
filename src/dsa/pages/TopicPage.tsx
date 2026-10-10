import { useEffect, useState } from 'react';
import { href } from '@/router';
import { useApp } from '@/store/store';
import { CodeBlock, Md } from '@/ui/common';
import { Icon } from '@/ui/Icon';
import { TOPIC_BY_ID, TOPICS, problemsOf } from '../catalog';
import { AVAILABLE_PROBLEMS, loadTopic } from '../loader';
import { problemState, topicProgress } from '../progress';
import type { TopicContent, TopicId } from '../types';
import { BossFight } from './BossFight';
import '@/pages/pages.css';
import './dsa.css';

const STATE_LABEL = { solved: 'Solved', review: 'To review', started: 'Started', new: '' } as const;

export default function TopicPage({ topic }: { topic: TopicId }) {
  const meta = TOPIC_BY_ID[topic];
  const dsa = useApp((s) => s.dsa);
  const [content, setContent] = useState<TopicContent | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setContent(undefined);
    loadTopic(topic).then((c) => alive && setContent(c));
    return () => {
      alive = false;
    };
  }, [topic]);

  const list = problemsOf(topic);
  const prog = topicProgress(dsa, topic);
  const at = TOPICS.findIndex((t) => t.id === topic);
  const prevT = TOPICS[at - 1];
  const nextT = TOPICS[at + 1];

  return (
    <div className="page dsa-page">
      <div className="crumbs">
        <a href={href('/dsa')}>NeetCode 150</a>
        <span aria-hidden>/</span>
        <span>
          Topic {at + 1} of {TOPICS.length}
        </span>
      </div>
      <div className="page-head" style={{ marginTop: 6 }}>
        <div className="grow">
          <h1 style={{ margin: 0 }} data-testid="topic-title">
            {meta.title}
          </h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {meta.blurb}
          </p>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          <b style={{ color: 'var(--ink)' }}>{prog.solved}</b> of {prog.total} solved
        </p>
      </div>

      {content && (
        <div className="dsa-topic-guide">
          <section>
            <h2>The pattern</h2>
            {content.intro.map((p, i) => (
              <p key={i}>
                <Md text={p} />
              </p>
            ))}
          </section>
          <section>
            <h2>How to recognise it</h2>
            <ul className="dsa-checklist">
              {content.checklist.map((c, i) => (
                <li key={i}>
                  <Md text={c} />
                </li>
              ))}
            </ul>
          </section>
          <section className="wide">
            <h2>Reusable template</h2>
            {content.template.map((t) => (
              <div key={t.title}>
                <h3 className="dsa-tpl-title">{t.title}</h3>
                <CodeBlock code={t.code} lang="python" />
              </div>
            ))}
          </section>
        </div>
      )}
      {content === null && <div className="callout info">The guide for this topic is still being written. The problem list below is ready to use as the problems arrive.</div>}

      <section className="dsa-problems" aria-label="Problems">
        <h2>Problems</h2>
        <ol className="dsa-plist">
          {list.map((p, i) => {
            const st = problemState(dsa.problems[p.id]);
            const ready = AVAILABLE_PROBLEMS.has(p.id);
            return (
              <li key={p.id}>
                <a className={`dsa-prow ${st}${ready ? '' : ' soon'}`} href={href(`/dsa/${p.topic}/${p.id}`)} data-testid={`problem-${p.id}`}>
                  <span className="n">{i + 1}</span>
                  <span className="t">{p.title}</span>
                  <span className={`chip diff-${p.difficulty.toLowerCase()}`}>{p.difficulty}</span>
                  <span className="s" aria-label={STATE_LABEL[st] || (ready ? 'Not started' : 'Coming soon')}>
                    {st === 'solved' ? <Icon name="check" size={15} stroke={3} /> : st === 'review' ? <Icon name="reset" size={15} /> : !ready ? 'soon' : ''}
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      </section>

      {content && <BossFight topic={topic} content={content} />}

      <nav className="dsa-pager" aria-label="Neighbouring topics">
        {prevT ? <a href={href(`/dsa/${prevT.id}`)}>← {prevT.title}</a> : <span />}
        {nextT && <a href={href(`/dsa/${nextT.id}`)}>{nextT.title} →</a>}
      </nav>
    </div>
  );
}

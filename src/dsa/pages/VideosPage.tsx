// #/dsa/videos            every topic as a playlist
// #/dsa/videos/<topic>?v=  one topic: the concept video first, then one video per problem
import { useEffect, useMemo, useState } from 'react';
import { href, navigate, useRoute } from '@/router';
import { Icon } from '@/ui/Icon';
import { TOPIC_BY_ID, TOPICS, problemsOf } from '../catalog';
import { loadProblem, loadTopic } from '../loader';
import type { ProblemContent, TopicContent, TopicId } from '../types';
import { conceptVideo, problemVideo, videoSeconds, type Video } from '../video/script';
import { VideoPlayer } from '../video/VideoPlayer';
import '@/pages/pages.css';
import './dsa.css';

const mins = (s: number) => `${Math.max(1, Math.round(s / 60))} min`;

function useWatched(): [Set<string>, (id: string) => void] {
  const [w, setW] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('video:watched') ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const mark = (id: string) =>
    setW((old) => {
      const n = new Set(old).add(id);
      try {
        localStorage.setItem('video:watched', JSON.stringify([...n]));
      } catch {
        /* per-visit only */
      }
      return n;
    });
  return [w, mark];
}

export default function VideosPage({ topic }: { topic?: string }) {
  if (topic && topic in TOPIC_BY_ID) return <Playlist key={topic} topic={topic as TopicId} />;
  return <VideoIndex />;
}

function VideoIndex() {
  const [watched] = useWatched();
  return (
    <div className="page">
      <div className="crumbs">
        <a href={href('/dsa')}>NeetCode 150</a>
        <span aria-hidden>/</span>
        <span>Videos</span>
      </div>
      <h1 style={{ margin: '6px 0 4px' }}>Videos</h1>
      <p className="muted" style={{ margin: 0, maxWidth: '62ch' }}>
        Lean back and listen. Each topic starts with a concept video, then one narrated video per problem: the idea, the code, the real algorithm running step by step, and the edge cases. Subtitles are on by default.
      </p>
      <div className="vtopics">
        {TOPICS.map((t, i) => {
          const list = problemsOf(t.id);
          const done = ['concept', ...list.map((p) => p.id)].filter((id) => watched.has(`${t.id}:${id}`)).length;
          return (
            <a key={t.id} className="vtopic" href={href(`/dsa/videos/${t.id}`)} data-testid={`video-topic-${t.id}`}>
              <span className="dim mono">{String(i + 1).padStart(2, '0')}</span>
              <h3>{t.title}</h3>
              <p>{t.blurb}</p>
              <span className="dim">
                {list.length + 1} videos{done ? ` · ${done} watched` : ''}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

interface Loaded {
  topic: TopicContent | null;
  problems: (ProblemContent | null)[];
}

function Playlist({ topic }: { topic: TopicId }) {
  const meta = TOPIC_BY_ID[topic];
  const list = problemsOf(topic);
  const { query } = useRoute();
  const sel = query.get('v') ?? 'concept';
  const [data, setData] = useState<Loaded | null>(null);
  const [autoNext, setAutoNext] = useState(true);
  const [started, setStarted] = useState(false);
  const [watched, mark] = useWatched();

  useEffect(() => {
    let alive = true;
    Promise.all([loadTopic(topic), Promise.all(list.map((p) => loadProblem(p.id)))]).then(([t, ps]) => alive && setData({ topic: t, problems: ps }));
    return () => {
      alive = false;
    };
  }, [topic]); // eslint-disable-line react-hooks/exhaustive-deps

  const videos: Video[] = useMemo(() => {
    if (!data) return [];
    const out: Video[] = [];
    const demoAt = data.problems.findIndex(Boolean);
    if (data.topic) out.push(conceptVideo(meta, data.topic, demoAt >= 0 ? { meta: list[demoAt], content: data.problems[demoAt]! } : undefined));
    list.forEach((p, i) => data.problems[i] && out.push(problemVideo(p, data.problems[i]!)));
    return out;
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const idx = Math.max(0, videos.findIndex((v) => v.id === sel));
  const video = videos[idx];
  const at = TOPICS.findIndex((t) => t.id === topic);
  const nextTopic = TOPICS[at + 1];
  const go = (id: string) => navigate(`/dsa/videos/${topic}?v=${id}`);

  const onEnded = () => {
    if (!video) return;
    mark(`${topic}:${video.id}`);
    if (!autoNext) return;
    const nxt = videos[idx + 1];
    if (nxt) go(nxt.id);
    else if (nextTopic) navigate(`/dsa/videos/${nextTopic.id}`);
  };

  return (
    <div className="page vpage">
      <div className="crumbs">
        <a href={href('/dsa')}>NeetCode 150</a>
        <span aria-hidden>/</span>
        <a href={href('/dsa/videos')}>Videos</a>
        <span aria-hidden>/</span>
        <span>{meta.title}</span>
      </div>
      <div className="vlayout">
        <div className="vmain">
          {!video ? (
            <div className="vplayer">
              <div className="vscreen">
                <div className="vs vs-title">
                  <p className="dim">Loading videos…</p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <VideoPlayer key={video.id} video={video} onEnded={onEnded} autoStart={started} />
              <div className="row" style={{ marginTop: 10, gap: 12, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 20 }} className="grow">
                  {video.title}
                </h2>
                <label className="dim" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} /> Play next automatically
                </label>
                {video.kind === 'problem' && (
                  <a className="btn sm" href={href(`/dsa/${topic}/${video.id}`)}>
                    <Icon name="code" size={15} /> Practice this problem
                  </a>
                )}
              </div>
            </>
          )}
        </div>
        <aside className="vlist" aria-label={`${meta.title} videos`} onClickCapture={() => setStarted(true)}>
          <div className="vlist-head">
            <b>{meta.title}</b>
            <span className="dim">{videos.length ? mins(videos.reduce((t, v) => t + videoSeconds(v), 0)) + ' total' : ''}</span>
          </div>
          <ol>
            {videos.map((v, i) => (
              <li key={v.id}>
                <a
                  href={href(`/dsa/videos/${topic}?v=${v.id}`)}
                  className={i === idx ? 'now' : ''}
                  aria-current={i === idx ? 'true' : undefined}
                  data-testid={`video-item-${v.id}`}
                >
                  <span className="vnum mono">{watched.has(`${topic}:${v.id}`) ? <Icon name="check" size={14} /> : i === 0 && v.kind === 'concept' ? '★' : i}</span>
                  <span className="grow">{v.title}</span>
                  <span className="dim mono">{mins(videoSeconds(v))}</span>
                </a>
              </li>
            ))}
          </ol>
          {nextTopic && (
            <a className="btn sm ghost" href={href(`/dsa/videos/${nextTopic.id}`)} style={{ marginTop: 8 }}>
              Next topic: {nextTopic.title} <Icon name="arrow-right" size={14} />
            </a>
          )}
        </aside>
      </div>
    </div>
  );
}

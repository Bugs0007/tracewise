// Router for the NeetCode 150 track:  #/dsa  ·  #/dsa/<topic>  ·  #/dsa/<topic>/<slug>  ·  #/dsa/gallery
import { lazy } from 'react';
import { PROBLEM_BY_ID, TOPIC_BY_ID } from '../catalog';
import type { TopicId } from '../types';
import { href } from '@/router';

const IndexPage = lazy(() => import('./DsaIndexPage'));
const TopicPage = lazy(() => import('./TopicPage'));
const ProblemPage = lazy(() => import('./ProblemPage'));
const GalleryPage = lazy(() => import('./GalleryPage'));

export default function DsaPage({ topic, slug }: { topic?: string; slug?: string }) {
  if (!topic) return <IndexPage />;
  if (topic === 'gallery') return <GalleryPage />;
  if (!(topic in TOPIC_BY_ID)) return <NotFound what="topic" />;
  if (!slug) return <TopicPage topic={topic as TopicId} />;
  const meta = PROBLEM_BY_ID[slug];
  if (!meta || meta.topic !== topic) return <NotFound what="problem" />;
  return <ProblemPage key={slug} slug={slug} />;
}

function NotFound({ what }: { what: string }) {
  return (
    <div className="page">
      <h1>Unknown {what}</h1>
      <a href={href('/dsa')}>Back to the NeetCode 150 track</a>
    </div>
  );
}

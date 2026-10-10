// Every visualizer primitive in a few states. Not linked from the UI (open #/dsa/gallery);
// used to review the look in light, dark and on a phone, and checked by the same panel validator as the traces.
import { useMemo } from 'react';
import { href } from '@/router';
import { PanelView, isWide } from '@/player/panels';
import { checkPanel } from '../viz/check';
import { galleryItems } from '../viz/gallery';
import '@/player/player.css';
import '@/features/task.css';
import './dsa.css';

export default function GalleryPage() {
  const items = useMemo(galleryItems, []);
  return (
    <div className="page dsa-page">
      <div className="crumbs">
        <a href={href('/dsa')}>NeetCode 150</a>
        <span aria-hidden>/</span>
        <span>Visualizer primitives</span>
      </div>
      <h1>Visualizer primitives</h1>
      <p className="muted">Every primitive the traces are built from, in a few states.</p>
      <div className="dsa-gallery">
        {items.map((it) => {
          const bad = it.panels.flatMap(checkPanel);
          return (
            <section key={it.name} className="dsa-gal-item" data-testid="gallery-item">
              <h3>
                {it.name} {bad.length > 0 && <span className="chip bad">{bad.join('; ')}</span>}
              </h3>
              <div className="stage">
                <div className="panels">
                  {it.panels.map((p, i) => (
                    <div key={i} className={`pnl${isWide(p) ? ' wide' : ''}`}>
                      <PanelView panel={p} />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

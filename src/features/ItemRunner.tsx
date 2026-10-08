// Renders one review / quick-session item: a question, a typing task, a bug or a boss.
import { useMemo, useState } from 'react';
import type { Question, Unit } from '@/content/types';
import { levelStarter } from '@/content/ladder';
import { TaskRunner } from './TaskRunner';
import { QuestionCard } from '@/pages/UnitPage';
import { Md } from '@/ui/common';
import { Icon } from '@/ui/Icon';
import type { ReviewKind } from '@/store/save';

export type ItemKind = ReviewKind | 'quiz';

export interface SessionItem {
  unitId: string;
  kind: ItemKind;
  /** for 'quiz': which question (index into [predict, ...quiz]) */
  q?: number;
  fromQueue?: boolean;
}

export const KIND_LABEL: Record<ItemKind, string> = {
  predict: 'Predict',
  quiz: 'Quick question',
  practice: 'Type it (signature only)',
  debug: 'Fix the bug',
  boss: 'Boss rematch',
};

export function questionsOf(u: Unit): Question[] {
  return [u.predict, ...(u.quiz ?? [])];
}

export function ItemRunner({ unit, item, onDone }: { unit: Unit; item: SessionItem; onDone: (success: boolean) => void }) {
  const [finished, setFinished] = useState<boolean | null>(null);
  const finish = (ok: boolean) => {
    if (finished !== null) return;
    setFinished(ok);
    onDone(ok);
  };
  const q = useMemo(() => {
    const qs = questionsOf(unit);
    return item.kind === 'predict' ? unit.predict : qs[(item.q ?? 0) % qs.length];
  }, [unit, item]);

  if (item.kind === 'predict' || item.kind === 'quiz') return <QuestionCard q={q} onAnswer={finish} />;

  const task = item.kind === 'practice' ? unit.practice : item.kind === 'debug' ? unit.debug : unit.boss;
  const starter = item.kind === 'practice' ? levelStarter(unit.practice, 3) : item.kind === 'debug' ? unit.debug.buggy : unit.boss.starter;
  const statement = item.kind === 'practice' ? unit.practice.statement : item.kind === 'debug' ? unit.debug.statement : unit.boss.statement;
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card flat">
        {item.kind === 'boss' && <h3 style={{ margin: '0 0 4px' }}>{unit.boss.title}</h3>}
        <Md text={statement} />
      </div>
      <TaskRunner key={`${unit.id}:${item.kind}`} task={task} starter={starter} onResult={(r) => r.status === 'pass' && finish(true)} />
      {finished === null && (
        <div className="row">
          <span className="spacer" />
          <button className="btn ghost sm" onClick={() => finish(false)}>
            <Icon name="x" size={14} /> I'm stuck — show me later
          </button>
        </div>
      )}
    </div>
  );
}

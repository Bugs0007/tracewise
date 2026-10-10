// Trace generation helpers. A trace generator is `viz.run(input)`: it executes the
// real algorithm and records a frame at each meaningful moment. Frames are never
// written by hand, so the visualization is correct for any input the learner types.
import { Recorder } from '@/engine/recorder';

/** At most this many predict-the-next-step checkpoints are attached to one trace. */
export const MAX_CHECKPOINTS = 3;

/**
 * Recorder with authored predict checkpoints.
 *
 *   r.step('check', 'Is 3 already in seen?', panels, vars);
 *   r.predict('hit', 'Is 3 already in the set?', ['Yes: return True', 'No: add it'], seen.has(3) ? 0 : 1);
 *   // ... the next r.step() shows the outcome
 *
 * `predict` attaches to the frame recorded last. Only the first call for each `kind`
 * is kept (and at most MAX_CHECKPOINTS overall), so a long input still yields
 * a few checkpoints at the key moments instead of one on every iteration.
 */
export class TraceRecorder extends Recorder {
  private kinds = new Set<string>();

  get checkpoints(): number {
    return this.kinds.size;
  }

  predict(kind: string, question: string, options: string[], answer: number, explain?: string): void {
    if (!this.frames.length || this.kinds.has(kind) || this.kinds.size >= MAX_CHECKPOINTS) return;
    if (answer < 0 || answer >= options.length) throw new Error(`predict "${kind}": answer ${answer} is not an option`);
    this.kinds.add(kind);
    this.attachPredict({ question, options, answer, explain });
  }

  /** like predict(), but builds the options from one correct and some wrong values, moving the correct one around with `seed` */
  predictChoice(kind: string, question: string, correct: string, wrong: string[], seed: number, explain?: string): void {
    const c = choices(correct, wrong, seed);
    this.predict(kind, question, c.options, c.answer, explain);
  }
}

/** Normalise -0 to 0 (JS gives -0 for 0 * -1; Python does not). */
export const nz = (n: number): number => (n === 0 ? 0 : n);

/**
 * Build predict options with the correct one at a position that varies with `seed`
 * (so the right answer is not always first). Wrong options that repeat the right one are dropped.
 */
export function choices(correct: string, wrong: string[], seed = 0): { options: string[]; answer: number } {
  const w = [...new Set(wrong.filter((x) => x !== correct))].slice(0, 3);
  const at = Math.abs(seed) % (w.length + 1);
  const options = [...w.slice(0, at), correct, ...w.slice(at)];
  return { options, answer: at };
}

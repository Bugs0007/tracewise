// Tiny synthesized sound effects (no audio assets). Off by default; enabled in Settings.
let ctx: AudioContext | null = null;

type SoundName = 'xp' | 'level' | 'win' | 'fail' | 'tick' | 'correct';

const TUNES: Record<SoundName, [number, number][]> = {
  tick: [[660, 0.04]],
  correct: [[660, 0.07], [880, 0.09]],
  xp: [[784, 0.06], [1046, 0.08]],
  fail: [[220, 0.12], [180, 0.14]],
  level: [[523, 0.08], [659, 0.08], [784, 0.08], [1046, 0.16]],
  win: [[523, 0.07], [784, 0.07], [1046, 0.07], [1318, 0.18]],
};

export function playSound(name: SoundName): void {
  try {
    ctx ??= new AudioContext();
    let t = ctx.currentTime;
    for (const [freq, dur] of TUNES[name]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = name === 'fail' ? 'sawtooth' : 'triangle';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
      t += dur * 0.85;
    }
  } catch {}
}

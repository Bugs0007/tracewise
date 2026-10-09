import { Recorder } from '@/engine/recorder';
import type { Tone, VizDef } from '@/engine/types';
import type { Unit } from '@/content/types';
import { MOCK_NOTE, flowGraph, kvPanel, step, type FlowDef } from '@/content/lib/ai-finish-2';

const code = `
def recommend(needs_facts, needs_style, examples):
    if needs_facts:                                          #@facts
        if needs_style and examples >= 100:                  #@both
            return "rag+fine-tune"                           #@ragft
        return "rag"                                         #@rag
    if needs_style:                                          #@style
        if examples >= 100:                                  #@enough
            return "fine-tune"                               #@ft
        return "prompting"                                   #@few
    return "prompting"                                       #@plain
`;

const FLOW: FlowDef = {
  title: 'Which technique?',
  width: 660,
  height: 310,
  nodes: [
    { id: 'q1', label: 'Needs facts it lacks?', x: 330, y: 35, w: 170 },
    { id: 'q2a', label: 'Needs fixed style?', x: 190, y: 115, w: 150 },
    { id: 'q2b', label: 'Needs fixed style?', x: 480, y: 115, w: 150 },
    { id: 'q3a', label: '100+ examples?', x: 90, y: 195, w: 130 },
    { id: 'q3b', label: '100+ examples?', x: 400, y: 195, w: 130 },
    { id: 'ragft', label: 'RAG + fine-tune', x: 70, y: 275, w: 120, shape: 'pill' },
    { id: 'rag', label: 'RAG', x: 205, y: 275, w: 90, shape: 'pill' },
    { id: 'ft', label: 'Fine-tune', x: 360, y: 275, w: 100, shape: 'pill' },
    { id: 'prompt', label: 'Prompting', x: 560, y: 275, w: 110, shape: 'pill' },
  ],
  edges: [
    { from: 'q1', to: 'q2a', label: 'yes' },
    { from: 'q1', to: 'q2b', label: 'no' },
    { from: 'q2a', to: 'q3a', label: 'yes' },
    { from: 'q2a', to: 'rag', label: 'no' },
    { from: 'q3a', to: 'ragft', label: 'yes' },
    { from: 'q3a', to: 'rag', label: 'no' },
    { from: 'q2b', to: 'q3b', label: 'yes' },
    { from: 'q2b', to: 'prompt', label: 'no' },
    { from: 'q3b', to: 'ft', label: 'yes' },
    { from: 'q3b', to: 'prompt', label: 'no' },
  ],
};

const WHY: Record<string, string> = {
  'rag+fine-tune': 'Facts come from retrieval, behaviour from tuning',
  rag: 'Facts change or are private: retrieve them, do not bake them in',
  'fine-tune': 'Only style or format matters and you have enough examples',
  prompting: 'Start here: cheapest, fastest to change, nothing to train',
};

interface In {
  needs_facts: string;
  needs_style: string;
  examples: number;
}

function clean(i: In) {
  const yn = (v: string, name: string) => {
    if (v !== 'yes' && v !== 'no') throw new Error(`${name} must be yes or no.`);
    return v === 'yes';
  };
  const examples = Math.round(Number(i.examples));
  if (!Number.isFinite(examples) || examples < 0 || examples > 1e6) throw new Error('examples must be a non-negative number.');
  return { facts: yn(i.needs_facts, 'needs_facts'), style: yn(i.needs_style, 'needs_style'), examples };
}

function decide(facts: boolean, style: boolean, examples: number): string {
  if (facts) return style && examples >= 100 ? 'rag+fine-tune' : 'rag';
  return style && examples >= 100 ? 'fine-tune' : 'prompting';
}

const LEAF: Record<string, string> = { 'rag+fine-tune': 'ragft', rag: 'rag', 'fine-tune': 'ft', prompting: 'prompt' };

const viz: VizDef<In> = {
  id: 'ai-ft-rag-prompt',
  title: 'Fine-tuning vs RAG vs prompting',
  code,
  language: 'python',
  inputs: [
    { key: 'needs_facts', label: 'Needs private or fresh facts?', kind: 'select', options: ['yes', 'no'], default: 'yes' },
    { key: 'needs_style', label: 'Needs a fixed style or format?', kind: 'select', options: ['yes', 'no'], default: 'no' },
    { key: 'examples', label: 'Labelled examples available', kind: 'number', default: 150 },
  ],
  presets: [
    { label: 'Company docs Q&A', input: { needs_facts: 'yes', needs_style: 'no', examples: 0 } },
    { label: 'Brand voice, many examples', input: { needs_facts: 'no', needs_style: 'yes', examples: 500 } },
    { label: 'Style but few examples', input: { needs_facts: 'no', needs_style: 'yes', examples: 20 } },
    { label: 'Facts and strict format', input: { needs_facts: 'yes', needs_style: 'yes', examples: 300 } },
    { label: 'Plain task', input: { needs_facts: 'no', needs_style: 'no', examples: 0 } },
  ],
  run(input) {
    const { facts, style, examples } = clean(input);
    const r = new Recorder(code);
    const nodes: Record<string, Tone> = {};
    const edges: Record<string, Tone> = {};
    const view = (extra = {}) => [flowGraph(FLOW, { nodes: { ...nodes }, edges: { ...edges } }), kvPanel('Your requirements', { 'needs facts': facts, 'needs style': style, examples, ...extra })];
    step(r, 'facts', 'Walk the tree with your requirements: facts first, because tuning does not reliably teach facts', view(), { facts, style, examples });
    const go = (from: string, to: string, anchor: string, caption: string) => {
      r.op();
      nodes[from] = 'visited';
      edges[from + '>' + to] = 'active';
      nodes[to] = 'active';
      step(r, anchor, caption, view(), { at: to });
    };
    nodes.q1 = 'active';
    if (facts) {
      go('q1', 'q2a', 'style', 'Yes: the model lacks the facts, so retrieval (RAG) is part of the answer');
      if (style) {
        go('q2a', 'q3a', 'both', 'Output must also follow a fixed style or format: is tuning realistic?');
        if (examples >= 100) go('q3a', 'ragft', 'ragft', `${examples} >= 100 examples: tune the behaviour, retrieve the facts`);
        else go('q3a', 'rag', 'rag', `Only ${examples} examples (< 100): keep RAG and put the style in the prompt`);
      } else go('q2a', 'rag', 'rag', 'No special style needed: RAG with a good prompt is enough');
    } else {
      go('q1', 'q2b', 'style', 'No missing facts: the question is only about behaviour');
      if (style) {
        go('q2b', 'q3b', 'enough', 'A fixed style or format is needed: are there enough examples to tune on?');
        if (examples >= 100) go('q3b', 'ft', 'ft', `${examples} >= 100 examples: fine-tuning can lock in the style`);
        else go('q3b', 'prompt', 'few', `Only ${examples} examples (< 100): few-shot prompting instead`);
      } else go('q2b', 'prompt', 'plain', 'Nothing special: a clear prompt is the cheapest thing that works');
    }
    const choice = decide(facts, style, examples);
    nodes[LEAF[choice]] = 'found';
    step(r, choice === 'prompting' ? 'plain' : choice === 'rag' ? 'rag' : choice === 'fine-tune' ? 'ft' : 'ragft', `Recommendation: ${choice}. ${WHY[choice]}`, view({ recommendation: choice }), { choice });
    return { frames: r.frames, result: { choice } };
  },
  reference(input) {
    const { facts, style, examples } = clean(input);
    return { choice: decide(facts, style, examples) };
  },
};

const unit: Unit = {
  id: 'ai-ft-rag-prompt',
  hook: '"Should we fine-tune?" is the most common design question in LLM interviews. The strong answer starts with prompting, adds retrieval for facts, and tunes only for behaviour you can demonstrate with data.',
  predict: {
    prompt: 'Your assistant must answer questions about internal documents that change weekly. Which approach fits best?',
    options: ['Fine-tune on the documents every week', 'Retrieve relevant passages at query time (RAG)', 'Make the system prompt longer and longer', 'Use a bigger model and hope'],
    answer: 1,
    explain: 'Facts that change belong in a store you can update, not in the weights. Fine-tuning is slow to refresh and does not reliably memorise facts; RAG also lets you cite sources.',
  },
  viz,
  deeper: {
    points: [
      'Prompting: zero training, instant iteration. Limits: context size, per-call cost, inconsistent format on hard cases.',
      'RAG: adds knowledge at query time from a store you control. Handles fresh and private data, supports citations and permissions; quality depends on retrieval.',
      'Fine-tuning: changes behaviour (tone, format, narrow skills) and can shorten prompts. Needs good labelled data, evaluation and re-training when the base model changes.',
      'They combine: RAG for facts, fine-tuning for style, prompting for everything else. Evaluate each step on a golden set before adding the next.',
      'Order of attack: prompt, then retrieval, then tuning, only when the evaluation shows the gap.',
    ],
    pitfalls: ['Fine-tuning to inject facts', 'Tuning with a handful of examples', 'Skipping evaluation, so you cannot tell whether the added complexity helped'],
  },
  practice: {
    language: 'python',
    fnName: 'recommend',
    statement: 'recommend(needs_facts, needs_style, examples) returns "rag+fine-tune" if facts are needed and style is needed with at least 100 examples; "rag" if facts are needed otherwise; "fine-tune" if only style is needed and there are at least 100 examples; "prompting" in every other case.',
    signature: 'def recommend(needs_facts, needs_style, examples):',
    solution: `def recommend(needs_facts, needs_style, examples):
    tunable = @@needs_style and examples >= 100@@
    if needs_facts:
        return @@"rag+fine-tune" if tunable else "rag"@@
    if tunable:
        return @@"fine-tune"@@
    return "prompting"`,
    tests: [
      { args: [true, false, 0], expected: 'rag', name: 'facts only' },
      { args: [true, true, 300], expected: 'rag+fine-tune', name: 'facts and a tunable style' },
      { args: [true, true, 20], expected: 'rag', name: 'facts, style but too few examples' },
      { args: [false, true, 100], expected: 'fine-tune', name: 'exactly 100 examples' },
      { args: [false, true, 99], expected: 'prompting', name: '99 examples is not enough' },
      { args: [false, false, 5000], expected: 'prompting', name: 'no style requirement' },
    ],
  },
  debug: {
    language: 'python',
    fnName: 'pick_approach',
    statement: 'pick_approach(needs_facts, needs_style, examples) returns "rag" when the task needs facts the model lacks, "fine-tune" when only a fixed style is needed and there are at least 100 examples, else "prompting". Tasks that need facts AND have a style requirement wrongly get "fine-tune".',
    buggy: `def pick_approach(needs_facts, needs_style, examples):
    if needs_style and examples >= 100:
        return "fine-tune"
    if needs_facts:
        return "rag"
    return "prompting"`,
    fixed: `def pick_approach(needs_facts, needs_style, examples):
    if needs_style and not needs_facts and examples >= 100:
        return "fine-tune"
    if needs_facts:
        return "rag"
    return "prompting"`,
    tests: [
      { args: [true, false, 0], expected: 'rag', name: 'facts only' },
      { args: [true, true, 500], expected: 'rag', name: 'facts plus style: retrieval first' },
      { args: [false, true, 100], expected: 'fine-tune', name: 'style with enough examples' },
      { args: [false, true, 99], expected: 'prompting', name: 'style, too few examples' },
      { args: [false, false, 0], expected: 'prompting', name: 'plain task' },
    ],
    bugType: 'fine-tuning to teach facts',
    hint: 'Which test runs first for a task that needs both facts and a style?',
    explanation: 'The fine-tune branch fired before the facts check, so a knowledge task with plenty of examples was sent to tuning, which cannot reliably add or refresh facts. Facts must route to retrieval first.',
  },
  boss: {
    title: 'Rollout planner',
    statement: 'Write advise(req) where req = {"needs_facts", "needs_style", "examples", "high_volume"}. The tuning threshold is 20 examples when high_volume is true (shorter prompts pay off), otherwise 100. steps always starts with "prompting"; append "rag" if needs_facts; append "fine-tune" if needs_style and examples >= threshold. choice is "prompting" if steps has one item, else the remaining steps joined with "+". Return {"choice", "steps"}.',
    language: 'python',
    fnName: 'advise',
    starter: `def advise(req):
    # your code here
    pass
`,
    solution: `def advise(req):
    threshold = 20 if req["high_volume"] else 100
    steps = ["prompting"]
    if req["needs_facts"]:
        steps.append("rag")
    if req["needs_style"] and req["examples"] >= threshold:
        steps.append("fine-tune")
    choice = "+".join(steps[1:]) if len(steps) > 1 else "prompting"
    return {"choice": choice, "steps": steps}`,
    tests: [
      { args: [{ needs_facts: false, needs_style: false, examples: 0, high_volume: false }], expected: { choice: 'prompting', steps: ['prompting'] }, name: 'plain task' },
      { args: [{ needs_facts: true, needs_style: false, examples: 0, high_volume: false }], expected: { choice: 'rag', steps: ['prompting', 'rag'] }, name: 'facts only' },
      { args: [{ needs_facts: false, needs_style: true, examples: 50, high_volume: true }], expected: { choice: 'fine-tune', steps: ['prompting', 'fine-tune'] }, name: 'high volume lowers the bar' },
      { args: [{ needs_facts: false, needs_style: true, examples: 50, high_volume: false }], expected: { choice: 'prompting', steps: ['prompting'] }, name: '50 examples is not enough at normal volume' },
      { args: [{ needs_facts: true, needs_style: true, examples: 150, high_volume: false }], expected: { choice: 'rag+fine-tune', steps: ['prompting', 'rag', 'fine-tune'] }, name: 'both' },
      { args: [{ needs_facts: true, needs_style: true, examples: 19, high_volume: true }], expected: { choice: 'rag', steps: ['prompting', 'rag'] }, name: 'one below the high-volume threshold' },
      { args: [{ needs_facts: true, needs_style: true, examples: 20, high_volume: true }], expected: { choice: 'rag+fine-tune', steps: ['prompting', 'rag', 'fine-tune'] }, name: 'exactly the high-volume threshold' },
    ],
    hints: ['Compute the threshold first, then build the steps list one condition at a time.', 'choice is "+".join(steps[1:]) when there is more than the starting "prompting" step.'],
    combines: ['ai-evaluation', 'ai-prompt-patterns'],
  },
  quiz: [
    {
      prompt: 'What is the best reason to fine-tune rather than prompt?',
      options: ['To add last week\'s news', 'To get a consistent format or tone that prompting cannot reliably achieve, backed by enough labelled examples', 'To avoid writing an evaluation set', 'Fine-tuning is always cheaper'],
      answer: 1,
      explain: 'Tuning shifts behaviour. It is a poor way to add or update facts, and it needs data and evaluation to justify the effort.',
    },
  ],
  simulationNote: MOCK_NOTE,
};

export default unit;

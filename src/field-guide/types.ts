export type LabKind = 'learning' | 'attention' | 'sampling' | 'context' | 'vectors' | 'retrieval' | 'agent' | 'adaptation' | 'metrics' | 'budget';
export interface Beat { title: string; text: string; flow: string[] }
export interface Lesson {
  id: string; chapter: string; title: string; minutes: number; sprint?: boolean;
  terms: string[]; hook: string;
  analogy: string; boundary: string;
  beats: [Beat, Beat, Beat];
  mechanism: [string, string, string];
  math?: { formula: string; meaning: string; example: string };
  choices: [string, string];
  trap: string;
  check: { question: string; options: [string, string, string]; correct: number; why: [string, string, string] };
  interview: { question: string; points: [string, string, string]; followUp: string };
  lab?: LabKind; sources: string[];
}
export interface Chapter { id: string; title: string; subtitle: string; scene: string; symbol: string }
export interface Source { title: string; url: string }

import type { CapstoneProject } from './types';
import taskManager from './task-manager';

const extra = import.meta.glob<{ default: CapstoneProject }>('./projects/*.ts', { eager: true });

export const PROJECTS: CapstoneProject[] = [taskManager, ...Object.values(extra).map((m) => m.default)];

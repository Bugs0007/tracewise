import { transform } from 'sucrase';
import type { Lang } from '@/content/types';

/** Remove ES module syntax so plain scripts can run inside `new Function`. */
export function stripModuleSyntax(code: string): string {
  return code
    .replace(/^\s*import\s+[^;\n]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^(\s*)export\s+default\s+(function|class|async\s+function)/gm, '$1$2')
    .replace(/^(\s*)export\s+(?=(?:async\s+)?function|const|let|var|class)/gm, '$1');
}

/** TypeScript -> JavaScript (types stripped). JS passes through. */
export function toPlainJs(code: string, lang: Lang): string {
  const src = stripModuleSyntax(code);
  if (lang === 'typescript') return transform(src, { transforms: ['typescript'], disableESTransforms: true }).code;
  return src;
}

/** JSX/TSX -> JavaScript calling React.createElement; imports are stripped (React is provided). */
export function jsxToJs(code: string): string {
  const src = stripModuleSyntax(code);
  return transform(src, { transforms: ['jsx', 'typescript'], jsxRuntime: 'classic', production: true, disableESTransforms: true }).code;
}

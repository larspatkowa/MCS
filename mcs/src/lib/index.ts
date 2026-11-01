/**
 * Public API surface for the $lib alias.
 * Prefer importing from specific modules (e.g. $lib/objects) for tree-shaking.
 */
export * from './objects/index.js';
export * from './components/ui/index.js';
export * from './derived-values.js';
export { cn } from './utils.js';

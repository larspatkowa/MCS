export { registerType, getType, getTypeLabel, getCreatableTypes, hasType } from './registry.js';
export type { ObjectTypeInfo } from './registry.js';
export { registerView, getView, resolveView, hasView, lazy } from './views.js';
export {
	registerPropertyEditor,
	getPropertyEditor,
	hasPropertyEditor
} from './property-editors.js';
export { bootstrapObjectTypes } from './bootstrap.js';

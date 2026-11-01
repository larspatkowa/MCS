// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			authUser?: import('$lib/server/auth.js').AuthUser | null;
			projectRole?: import('$lib/server/auth.js').ProjectRole | null;
			serviceTokenProjectId?: string | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};

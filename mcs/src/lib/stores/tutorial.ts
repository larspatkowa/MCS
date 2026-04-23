import { writable, get } from 'svelte/store';
import { currentProject } from '$lib/stores/project';
import { parseTutorialExampleKind, type TutorialExampleKind } from '$lib/tutorial-kinds.js';

const SESSION_KEY = 'mcs-tutorial-session';

/** Step index that shows the sample curl snippet (same for all variants). */
export const TUTORIAL_INGEST_STEP_INDEX = 4;

export interface TutorialState {
	active: boolean;
	step: number;
	/** null = generic tour for projects without an example kind */
	exampleKind: TutorialExampleKind | null;
}

export interface TutorialStepDef {
	target: string | null;
	title: string;
	body: string;
}

const explorerStep: TutorialStepDef = {
	target: 'sidebar-tree',
	title: 'Explorer',
	body: 'This is the working structure for your project. Plugins can create folders, displays, and other objects here. Anything you add by hand also appears here.'
};

const projectRootStep: TutorialStepDef = {
	target: 'center-view-content',
	title: 'Project root',
	body: 'This screen gives an overview of the project. It shows sources, stream IDs, and other information.'
};

const settingsStep: TutorialStepDef = {
	target: 'settings-btn',
	title: 'Settings',
	body: 'In Settings, you can start or stop data sources, configure auto-start, inspect streams, or edit plugins.'
};

const ingestStep: TutorialStepDef = {
	target: null,
	title: 'Feed your own data',
	body: 'POST to /api/ingest with your project id, stream id, and values. This snippet will get you started.'
};

const extendStep: TutorialStepDef = {
	target: null,
	title: 'Extend it',
	body: 'Use Add object to wire another built-in display, use Settings or /plugin-editor to run a plugin, or register a custom type under mcs/src/lib/object-types if you need a new view.'
};

function stepsForKind(kind: TutorialExampleKind | null): TutorialStepDef[] {
	if (kind === 'rocket') {
		return [
			{
				target: null,
				title: 'Rocket Mission example',
				body: 'This project uses a built-in plugin to emit synthetic rocket data and telemetry.'
			},
			explorerStep,
			projectRootStep,
			settingsStep,
			ingestStep,
			extendStep
		];
	}
	if (kind === 'ndvi') {
		return [
			{
				target: null,
				title: 'Agriculture example',
				body: 'Agriculture shows how one plugin can build a field survey workspace with maps, gauges, plots, and tables from the same stream set.'
			},
			explorerStep,
			projectRootStep,
			settingsStep,
			ingestStep,
			extendStep
		];
	}
	if (kind === 'system') {
		return [
			{
				target: null,
				title: 'System Monitor example',
				body: 'System Monitor is the quickest way to see live data in place. The plugin samples your host, writes sys:* streams, and lays out gauges, plots, tables, and a map.'
			},
			explorerStep,
			projectRootStep,
			settingsStep,
			ingestStep,
			extendStep
		];
	}
	return [
		{
			target: null,
			title: 'Welcome to MCS',
			body: 'This short tour shows where the source runs, where streams land, and how displays pick them up. Use Next to keep moving.'
		},
		explorerStep,
		projectRootStep,
		settingsStep,
		ingestStep,
		extendStep
	];
}

export function getTutorialSteps(kind: TutorialExampleKind | null | undefined): TutorialStepDef[] {
	return stepsForKind(kind ?? null);
}

function readSession(): Pick<TutorialState, 'active' | 'step' | 'exampleKind'> {
	if (typeof window === 'undefined') return { active: false, step: 0, exampleKind: null };
	try {
		const raw = sessionStorage.getItem(SESSION_KEY);
		if (!raw) return { active: false, step: 0, exampleKind: null };
		const p = JSON.parse(raw) as {
			active?: boolean;
			step?: number;
			exampleKind?: string | null;
		};
		if (p?.active === true) {
			const ek = parseTutorialExampleKind(p.exampleKind) ?? null;
			const steps = getTutorialSteps(ek);
			const step = typeof p.step === 'number' ? Math.max(0, Math.min(p.step, steps.length - 1)) : 0;
			return { active: true, step, exampleKind: ek };
		}
	} catch {
		/* ignore */
	}
	return { active: false, step: 0, exampleKind: null };
}

function persistSession(state: TutorialState) {
	if (typeof window === 'undefined') return;
	if (state.active) {
		sessionStorage.setItem(
			SESSION_KEY,
			JSON.stringify({ active: true, step: state.step, exampleKind: state.exampleKind })
		);
	} else {
		sessionStorage.removeItem(SESSION_KEY);
	}
}

function initialState(): TutorialState {
	const { active, step, exampleKind } = readSession();
	return { active, step, exampleKind };
}

export const tutorial = writable<TutorialState>(initialState());

tutorial.subscribe((s) => persistSession(s));

export function startTutorial(opts?: { exampleKind?: TutorialExampleKind | null }): void {
	tutorial.set({
		...get(tutorial),
		active: true,
		step: 0,
		exampleKind: opts?.exampleKind ?? null
	});
}

/** Start a tour using tutorialExampleKind from the currently loaded project (generic if unset). */
export function startProjectTourFromCurrentProject(): void {
	const proj = get(currentProject);
	const kind = proj?.settings?.tutorialExampleKind ?? null;
	startTutorial({ exampleKind: kind });
}

export function endTutorial(): void {
	tutorial.update((s) => ({ ...s, active: false, step: 0, exampleKind: null }));
}

export function tutorialNext(): void {
	tutorial.update((s) => {
		if (!s.active) return s;
		const steps = getTutorialSteps(s.exampleKind);
		const next = s.step + 1;
		if (next >= steps.length) {
			return { ...s, active: false, step: 0, exampleKind: null };
		}
		return { ...s, step: next };
	});
}

export function tutorialPrev(): void {
	tutorial.update((s) => {
		if (!s.active) return s;
		const prev = s.step - 1;
		if (prev < 0) return s;
		return { ...s, step: prev };
	});
}

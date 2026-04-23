export const TUTORIAL_EXAMPLE_KINDS = ['rocket', 'ndvi', 'system'] as const;

export type TutorialExampleKind = (typeof TUTORIAL_EXAMPLE_KINDS)[number];

export function parseTutorialExampleKind(v: unknown): TutorialExampleKind | undefined {
	if (typeof v !== 'string') return undefined;
	return (TUTORIAL_EXAMPLE_KINDS as readonly string[]).includes(v)
		? (v as TutorialExampleKind)
		: undefined;
}

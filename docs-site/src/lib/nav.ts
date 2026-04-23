export interface NavSection {
	title: string;
	items: NavItem[];
}

export interface NavItem {
	label: string;
	href: string;
}

export const nav: NavSection[] = [
	{
		title: 'Start',
		items: [
			{ label: 'Getting started', href: '/' },
			{ label: 'Configuration', href: '/configuration' },
			{ label: 'Architecture', href: '/architecture' }
		]
	},
	{
		title: 'Build',
		items: [
			{ label: 'Example projects', href: '/tutorials/example-projects' },
			{ label: 'Components', href: '/components' },
			{ label: 'Grid Layout', href: '/components/grid-layout' },
			{ label: 'Flex Layout', href: '/components/flex-layout' },
			{ label: 'Gauge', href: '/components/gauge' },
			{ label: 'Map View', href: '/components/map-view' },
			{ label: 'Summary Widget', href: '/components/summary-widget' },
			{ label: 'Data sources', href: '/plugins' },
			{ label: 'Write your first plugin', href: '/tutorials/first-plugin' },
			{ label: 'In-app plugin editor', href: '/tutorials/plugin-editor' }
		]
	},
	{
		title: 'Reference',
		items: [
			{ label: 'Ingest', href: '/api/ingest' },
			{ label: 'Projects', href: '/api/projects' },
			{ label: 'Objects', href: '/api/objects' },
			{ label: 'Streams & limits', href: '/api/streams' },
			{ label: 'Plugins', href: '/api/plugins' }
		]
	}
];

export const docLinks = nav.flatMap((section) => section.items);

export function getAdjacentDocs(href: string): { previous?: NavItem; next?: NavItem } {
	const index = docLinks.findIndex((item) => item.href === href);

	if (index === -1) {
		return {};
	}

	return {
		previous: docLinks[index - 1],
		next: docLinks[index + 1]
	};
}

export function docTitle(label: string): string {
	return `${label} | MCS Documentation`;
}

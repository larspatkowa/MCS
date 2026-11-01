export interface NavSection {
	title: string;
	items: NavItem[];
}

export interface NavItem {
	label: string;
	href: string;
	description: string;
	keywords: string;
}

export const nav: NavSection[] = [
	{
		title: 'Start here',
		items: [
			{
				label: 'Getting started',
				href: '/',
				description: 'Run MCS from its repository, create a project, and send your first sample.',
				keywords: 'source repository quick start create project sample first telemetry local'
			},
			{
				label: 'Core concepts',
				href: '/concepts',
				description: 'Projects, objects, streams, sources, runs, and event time.',
				keywords: 'project object stream source run event time history data model'
			},
			{
				label: 'Configuration',
				href: '/configuration',
				description: 'Project folders, runtime settings, and continuous history retention.',
				keywords: 'config project.json mcs.db MCS_CONFIG_DIR retention storage files'
			},
			{
				label: 'Architecture',
				href: '/architecture',
				description: 'How the browser, API routes, SQLite, ingest, and replay fit together.',
				keywords: 'server client sqlite sse ingest replay architecture'
			}
		]
	},
	{
		title: 'Build a workspace',
		items: [
			{
				label: 'Components',
				href: '/components',
				description: 'The built-in object types available in a project.',
				keywords: 'views displays components object types folder chart table image video note'
			},
			{
				label: 'Folder',
				href: '/components/folder',
				description: 'Group related objects in the project tree.',
				keywords: 'folder container organize project tree children'
			},
			{
				label: 'Grid layout',
				href: '/components/grid-layout',
				description: 'Place display objects in a fixed grid.',
				keywords: 'dashboard grid cells layout resize position'
			},
			{
				label: 'Flex layout',
				href: '/components/flex-layout',
				description: 'Arrange objects in resizable split panes.',
				keywords: 'split pane drag drop resize layout'
			},
			{
				label: 'Line plot',
				href: '/components/line-plot',
				description: 'Plot one or more fields against sample time.',
				keywords: 'chart graph trend series field timestamp x y'
			},
			{
				label: 'Gauge',
				href: '/components/gauge',
				description: 'Show a current stream value with configured ranges.',
				keywords: 'instrument value min max limits threshold'
			},
			{
				label: 'Telemetry table',
				href: '/components/telemetry-table',
				description: 'Read the latest values from selected streams.',
				keywords: 'data table fields sample live values'
			},
			{
				label: 'Markdown note',
				href: '/components/markdown-note',
				description: 'Keep project notes and instructions beside the data.',
				keywords: 'markdown documentation text notes'
			},
			{
				label: 'Image and video',
				href: '/components/media',
				description: 'Display project media and align video with a run.',
				keywords: 'media image video asset timeline replay synchronization'
			}
		]
	},
	{
		title: 'Data workflows',
		items: [
			{
				label: 'Record and replay runs',
				href: '/guides/runs',
				description: 'Record samples, import files, and replay a run on one clock.',
				keywords: 'recording pause resume stop import export replay event cursor'
			},
			{
				label: 'Media and rendering',
				href: '/guides/media',
				description: 'Attach media to a run and export a frame sequence or video.',
				keywords: 'image video media render ffmpeg png prores h264 offset'
			},
			{
				label: 'Derived values',
				href: '/guides/derived-values',
				description: 'Apply a bounded list of numeric transforms to samples.',
				keywords: 'derivative integral transform moving average align resample'
			},
			{
				label: 'Flight system starter',
				href: '/guides/flight-system',
				description: 'Create the offline flight-system example project.',
				keywords: 'template example demo flight rocket avionics telemetry'
			}
		]
	},
	{
		title: 'Operate MCS',
		items: [
			{
				label: 'Remote access',
				href: '/guides/remote-access',
				description: 'Enable accounts and project access behind HTTPS.',
				keywords: 'authentication login users permissions roles tokens security host'
			},
			{
				label: 'Backup and restore',
				href: '/guides/backup-restore',
				description: 'Make a verified project backup and restore it to a new folder.',
				keywords: 'backup restore project db sqlite media hashes migration'
			},
			{
				label: 'Branding',
				href: '/guides/branding',
				description: 'Override MCS colors and fonts from the runtime config folder.',
				keywords: 'theme css fonts color variables white-label appearance'
			}
		]
	},
	{
		title: 'API reference',
		items: [
			{
				label: 'Ingest',
				href: '/api/ingest',
				description: 'Send single samples, batches, or versioned source envelopes.',
				keywords: 'post curl json batch source timestamp utc gps tai authorization bearer'
			},
			{
				label: 'Projects',
				href: '/api/projects',
				description: 'List, create, update, and remove projects.',
				keywords: 'project list create update delete batch access'
			},
			{
				label: 'Objects',
				href: '/api/objects',
				description: 'Read and change the project object tree.',
				keywords: 'object tree create update delete reorder reparent layout'
			},
			{
				label: 'Streams and limits',
				href: '/api/streams',
				description: 'Declare stream metadata and configure limit thresholds.',
				keywords: 'stream metadata declare fields units limits thresholds events sse'
			},
			{
				label: 'Sources and clocks',
				href: '/api/sources',
				description: 'Inspect source records and tune clock corrections.',
				keywords: 'source time system timestamp unit offset drift uncertainty freshness'
			},
			{
				label: 'Telemetry history',
				href: '/api/telemetry',
				description: 'Read provider capabilities and query bounded history pages.',
				keywords: 'provider history raw latest minmax maxSamples cursor continuous sqlite'
			},
			{
				label: 'Runs and packages',
				href: '/api/runs',
				description: 'Manage run lifecycle, import data, and export packages.',
				keywords: 'run record import export ndjson csv json replay events health'
			},
			{
				label: 'Media and render jobs',
				href: '/api/media',
				description: 'Upload project media, bind it to a run, and request renders.',
				keywords: 'media binding asset image video render job frame png output'
			},
			{
				label: 'Health and access',
				href: '/api/access',
				description: 'Check service readiness and manage authenticated access.',
				keywords: 'health readiness liveness auth user role membership token admin'
			}
		]
	}
];

export const docLinks = nav.flatMap((section) =>
	section.items.map((item) => ({ ...item, section: section.title }))
);

export function getAdjacentDocs(href: string): {
	previous?: NavItem;
	next?: NavItem;
} {
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

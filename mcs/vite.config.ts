import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const localLucidePath = path.resolve(__dirname, 'node_modules/@lucide/svelte');
const workspaceLucidePath = path.resolve(__dirname, '../node_modules/@lucide/svelte');
const lucideAliasPath = existsSync(localLucidePath) ? localLucidePath : workspaceLucidePath;

export default defineConfig({
        plugins: [sveltekit()],
        test: {
                include: ['src/**/*.{test,spec}.{js,ts}'],
                environment: 'node'
        },
        ssr: {
                noExternal: ['@lucide/svelte']
        },
        optimizeDeps: {
                include: ['@lucide/svelte', 'bits-ui', 'clsx', 'leaflet', 'hls.js']
        },
        resolve: {
                preserveSymlinks: true,
                alias: {
                        '@lucide/svelte': lucideAliasPath
                }
        },
        server: {
                port: Number.parseInt(process.env.PORT ?? '8080', 10),
                strictPort: false,
                fs: {
                        allow: ['..']
                },
                warmup: {
                        clientFiles: [
                                './src/routes/+layout.svelte',
                                './src/routes/project/[id]/+page.svelte',
                                './src/lib/object-types/bootstrap.ts',
                                './src/lib/components/layout/AppShell.svelte',
                                './src/lib/components/layout/SidebarLeft.svelte',
                                './src/lib/components/layout/SidebarRight.svelte',
                                './src/lib/components/center/LazyView.svelte'
                        ]
                }
        },
        build: {}
});

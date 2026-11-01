# Theming MCS

MCS uses a single theme system based on CSS variables. The built-in light and dark themes keep their restrained grayscale palette, with theme-specific status colors and text contrast for readable telemetry values. An operator can add one optional CSS file to adjust the appearance of a local MCS installation.

## Operator branding override

Put the override at `<MCS_CONFIG_DIR>/branding/branding.css`. When running the development server directly, an unset `MCS_CONFIG_DIR` defaults to `data/` in the MCS working directory. When you open a project with `mcs open`, its default config directory is `<project>/.mcs/runtime`; this keeps that project's runtime settings with the project. The stylesheet is served from the stable same-origin URL `/branding/branding.css` and loads after the built-in app styles, so declarations can override the existing theme tokens.

To share one brand across projects, set `MCS_CONFIG_DIR` to the same absolute directory before running `mcs open` for each project. The CLI keeps the opened project in that shared config's recent-project list. Existing recent projects and other config keys are preserved.

After saving the stylesheet or font files, refresh the MCS page. No application rebuild or source edit is needed.

Font files go directly in `<MCS_CONFIG_DIR>/branding/fonts/` (no subdirectories). The server accepts `.eot`, `.otf`, `.ttf`, `.woff`, and `.woff2` files. Reference them relative to the stylesheet URL:

```css
@font-face {
	font-family: 'Test';
	src: url('./fonts/Test.woff2') format('woff2');
	font-display: swap;
	font-weight: 100 900;
}

:root {
	--mcs-font-sans: 'Test', sans-serif;
}
```

The `100 900` range is for a variable font. For a static font file, declare its
actual weight (for example, `400`) and add another `@font-face` rule for bold.

For example, install `branding.css` and `fonts/Test.woff2` under the `branding/` directory. The relative font URL resolves to `/branding/fonts/Test.woff2`. Missing CSS is served as an empty stylesheet, so no file is required when branding is unused. CSS is limited to 512 KiB and each font to 20 MiB. Unsupported font types, nested paths, and files outside the branding directory are not served. Branding files are public presentation assets and remain available when authentication is required.

Only trusted operators should be able to edit `branding.css`. CSS can load remote resources and alter the user interface, so deployments must trust anyone with write access to this file.

## Theme variables

The built-in theme tokens live in `src/lib/styles/theme.css` under `.theme-light` and `.theme-dark`:

- **Colors**: `--mcs-bg`, `--mcs-surface`, `--mcs-surface-alt`, `--mcs-text`, `--mcs-text-muted`, `--mcs-border`, `--mcs-accent`, `--mcs-resizer`, `--mcs-success`, `--mcs-warning`, `--mcs-danger`
- **Optional**: `--mcs-radius` (border radius), `--mcs-font-sans`, `--mcs-font-mono` (font stacks)

Use `var(--mcs-*)` in component styles. Do not use Tailwind utility classes outside `src/lib/components/ui`.

## Extending or creating a theme

1. Add a new class (e.g. `.theme-custom`) in `theme.css` or in the operator stylesheet.
2. Set the same `--mcs-*` variables (and optionally `--mcs-font-sans`, `--mcs-font-mono`, `--mcs-radius`).
3. Apply that class to the document root (e.g. `document.documentElement.classList.add('theme-custom')`) when the user selects the theme.

Components in `lib/components/ui` use aliased variables (`--background`, `--foreground`, etc.) that point to the same `--mcs-*` tokens, so they follow the theme automatically.

## Tailwind scope

Tailwind is installed only for the **shadcn-svelte** components in `src/lib/components/ui`. Its `content` in `tailwind.config.js` is restricted to that folder. Do not use Tailwind classes in the rest of the app; use the theme variables and scoped CSS instead.

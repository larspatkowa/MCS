# Theming MCS

MCS uses a single theme system based on **CSS variables**. Custom themes (colors, fonts, radius) are supported by overriding these variables.

## Theme variables

All theme tokens live in `src/lib/styles/theme.css` under `.theme-light` and `.theme-dark`:

- **Colors**: `--mcs-bg`, `--mcs-surface`, `--mcs-surface-alt`, `--mcs-text`, `--mcs-text-muted`, `--mcs-border`, `--mcs-accent`, `--mcs-resizer`
- **Optional**: `--mcs-radius` (border radius), `--mcs-font-sans`, `--mcs-font-mono` (font stacks)

Use `var(--mcs-*)` in your component styles. Do not use Tailwind utility classes outside `src/lib/components/ui`.

## Extending or creating a theme

1. Add a new class (e.g. `.theme-custom`) in `theme.css` or in a separate stylesheet imported after theme.css.
2. Set the same `--mcs-*` variables (and optionally `--mcs-font-sans`, `--mcs-font-mono`, `--mcs-radius`).
3. Apply that class to the document root (e.g. `document.documentElement.classList.add('theme-custom')`) when the user selects the theme.

Components in `lib/components/ui` (shadcn-svelte, e.g. context menus) use aliased variables (`--background`, `--foreground`, etc.) that point to the same `--mcs-*` tokens, so they follow your theme automatically.

## Tailwind scope

Tailwind is installed only for the **shadcn-svelte** components in `src/lib/components/ui`. Its `content` in `tailwind.config.js` is restricted to that folder. Do not use Tailwind classes in the rest of the app; use the theme variables and scoped CSS instead.

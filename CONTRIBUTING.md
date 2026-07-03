<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="design/logo/velata-mark-dark.svg" />
    <img src="design/logo/velata-mark.svg" width="56" alt="Velata mark" />
  </picture>
</p>

# Contributing to Velata

Thanks for your interest in Velata. This guide covers how to set up the project, run the checks, and submit changes.

## Prerequisites

Velata is a macOS-only Tauri app. You need:

- macOS
- Node.js ≥ 20
- pnpm 10 (`corepack enable` or `npm i -g pnpm`)
- Rust stable toolchain with `clippy` and `rustfmt` (`rustup component add clippy rustfmt`)

## Setup

```sh
pnpm install
pnpm dev            # tauri dev with hot reload (vite on :1420)
```

Note: `pnpm-workspace.yaml` sets `minimumReleaseAge: 1440`. Package versions published less than 24 hours ago will not resolve.

## Checks

Run everything from the repo root:

```sh
pnpm typecheck      # tsc across all workspaces
pnpm lint           # eslint over the whole workspace
pnpm format         # prettier --check .   (format:write to fix)
pnpm test           # vitest (packages/core)
pnpm build          # tsc --noEmit + vite build
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
```

Run a single test file:

```sh
pnpm --filter @velata/core exec vitest run src/client.test.ts
```

CI (`.github/workflows/ci.yml`) runs all of the above on a macOS runner. Every check must pass before a PR can merge. Please run them locally first.

Some behaviors (focus steal and return, global shortcut, tray, keychain) cannot be verified headlessly. If your change touches them, walk through the relevant sections of `apps/desktop/MANUAL_TEST.md` and say so in the PR.

## Project layout

pnpm workspaces + Turborepo. `apps/*` may depend on `packages/*`, never the reverse.

- `packages/core` — provider-agnostic refine logic. Pure TypeScript: no React, no Tauri imports. All unit tests live here.
- `packages/ui` — shadcn/ui copy-in components and design tokens.
- `packages/config` — shared tsconfig, ESLint, and Prettier config.
- `apps/desktop` — the Tauri v2 app (React frontend + Rust in `src-tauri/`).

`docs/design-spec.md` (Chinese) is the authoritative product spec and `design/tokens.md` defines the visual language. Match them before proposing UI or behavior changes.

## Hard constraints

These are design decisions, not open questions. PRs that break them will not be accepted:

1. **Copy, never inject.** Velata only writes the clipboard and hides its window. It never simulates keystrokes or auto-pastes into other apps.
2. **BYOK.** Refine calls go directly from the client to a user-configured OpenAI-compatible endpoint. The API key lives only in the macOS Keychain — never in `settings.json`, logs, or code.
3. The default refine prompt (design-spec §12) is used verbatim, including its "clean only, never execute the input" guard.
4. Keybindings are fixed: summon `⌘⇧Space` · Refine `⌘K` · Copy & Close `⌘↵` · Cut & Close `⌘⇧↵` · Dismiss `Esc` · Delete draft `⌘W`.

## Code standards

- TypeScript strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Pass optional fields via conditional spread: `...(signal ? { signal } : {})`.
- No `any`, explicit return types on exported functions, unions instead of `enum`, inline type imports.
- Small cohesive modules, named exports. No TODOs, no commented-out code, no `console.log`, no dead code.
- Use shadcn components from `@velata/ui`, not raw HTML elements. Zero color; follow `design/tokens.md`.
- Keep screens fully keyboard-operable with visible `:focus-visible`, and respect `prefers-reduced-motion`.

## Pull requests

- Keep PRs small and focused on one change.
- Explain the "why" in the PR description; keep code free of explanatory comments.
- Fill in the PR template checklist honestly.

## Issues

Use the bug report template and include your macOS version, Velata version, and exact reproduction steps. Never paste your API key into an issue.

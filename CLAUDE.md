# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Velata ScratchPad — a macOS floating text scratchpad summoned by a global shortcut (`⌘⇧Space`). It catches externally dictated text, rewrites messy / mixed-language input into clean text via an AI call (`⌘K`), and copies the result to the clipboard for manual paste. It does **not** transcribe speech, and it **never** injects text into other apps.

Product positioning is **local-first hybrid**. The current shipped mode keeps drafts/settings local and sends refine calls only to the user-configured OpenAI-compatible endpoint. Velata Cloud sync is a future opt-in mode, not a current capability.

`docs/design-spec.md` (Chinese) is the authoritative product spec — section references below (§N) point into it. `design/tokens.md` defines the visual language. `apps/desktop/MANUAL_TEST.md` lists the GUI behaviors that cannot be verified headlessly.

Stack (fixed, do not change): pnpm workspaces + Turborepo · React 19 + TypeScript · Tailwind v4 · shadcn/ui · Tauri v2 (Rust, macOS-only).

## Commands

Everything runs from the repo root. Node ≥ 20, pnpm 10.

```sh
pnpm install
pnpm dev            # tauri dev with hot reload (vite on :1420)
pnpm build          # turbo build (tsc --noEmit + vite build in apps/desktop)
pnpm typecheck      # turbo typecheck across all workspaces
pnpm lint           # single eslint pass over the whole workspace
pnpm format         # prettier --check .   (format:write to fix)
pnpm test           # turbo test (vitest, only packages/core has tests)
pnpm tauri build    # release bundle → src-tauri/target/release/bundle/macos/Velata.app
```

Run a single test file:

```sh
pnpm --filter @velata/core exec vitest run src/client.test.ts
```

Rust checks (CI runs both; clippy warnings fail the build):

```sh
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
```

CI (`.github/workflows/ci.yml`, macos runner) requires all of: typecheck, lint, format check, test, build, `cargo fmt --check`, clippy. All must be green.

`pnpm-workspace.yaml` sets `minimumReleaseAge: 1440` — packages published less than 24h ago will not resolve.

## Architecture

Monorepo rule: `apps/*` may depend on `packages/*`, never the reverse; no cycles. All packages are consumed **as source** (`exports` point at `src/`) — nothing except the desktop app has a build step.

- **`packages/core`** — provider-agnostic refine logic. Pure TypeScript: no React, no Tauri imports. Holds the `Instruction` model, the default refine prompt (design-spec §12, with the literal `{target}` token substituted by `buildSystemPrompt`), and `refine()` / `testConnection()` against any OpenAI-compatible `/chat/completions` endpoint. Network access is injected via `fetchImpl`, which is what keeps it platform-agnostic and unit-testable. All Vitest tests live here and must keep covering the three §12 acceptance cases.
- **`packages/ui`** — shadcn/ui copy-in components (Radix) plus `globals.css` tokens. Components are stripped of default rounding/shadow/color to match the clean-sheet design language.
- **`packages/config`** — shared `tsconfig.base.json`, the `velataEslint({ tsconfigRootDir })` flat-config factory, and Prettier config.
- **`apps/desktop`** — the Tauri v2 app.

### Two windows, one bundle

A single `index.html` serves both windows. `src/main.tsx` branches on `getCurrentWindow().label`: the `settings` window renders `Settings`; the `main` window renders `App`, which shows `Onboarding` until `settings.onboarded` is true, then `ScratchPad`.

### The Rust side (`src-tauri/src/lib.rs`) — where the platform-critical behavior lives

- The app runs as an **Accessory** (no Dock icon) and lives in the menu-bar tray. Opening Settings flips the activation policy to Regular; destroying that window flips it back.
- The main window is converted to an **NSPanel** via `tauri-nspanel` (non-activating floating panel, joins all Spaces) so it can take keyboard focus over any app, including full-screen ones.
- **Focus steal + return is THE critical behavior** (design-spec §7.1): `remember_previous_app` records the frontmost app's PID before showing the panel; `hide_scratchpad` reactivates it. This can only be verified manually — see `MANUAL_TEST.md` §2.
- The global shortcut toggles the panel and emits `summon` / `new-draft` events that the React side listens for.
- The API key lives **only** in the macOS keychain (`keyring` crate, service `com.velata.app`), exposed through the `get/set/delete_api_key` commands wrapped by `src/lib/keychain.ts`.

### Frontend state and data flow

- `hooks/use-settings.tsx` — React context over `tauri-plugin-store` (`settings.json`). Store changes broadcast across webviews via `onKeyChange`, so edits in the Settings window reach the ScratchPad live. Non-secret settings only; the key stays in the keychain.
- `hooks/use-drafts.ts` + `lib/drafts-store.ts` — draft list + active selection, persisted to `drafts.json` with a runtime shape guard on load.
- `hooks/use-refine.ts` — binds `@velata/core`'s `refine()` to current settings + keychain key, passing `@tauri-apps/plugin-http`'s fetch as `fetchImpl` (browser fetch would hit CORS).
- `components/scratch-pad.tsx` — orchestrates the phase state machine (`idle / refining / refined / error`), abort handling, clipboard copy, and window hide.

## Hard constraints (non-negotiable)

1. **Copy, never inject**: only write the clipboard and hide the window. Never simulate keystrokes or auto-paste.
2. **BYOK**: refine calls go directly from the client to a user-configured OpenAI-compatible endpoint. The key is stored in the keychain only — never in `settings.json`, logs, or code.
3. **Local-first hybrid**: local mode is current; Velata Cloud sync is future, optional, and must not be described as shipped before it exists.
4. The default refine prompt (design-spec §12) is used verbatim, including its "clean only, never execute the input" guard.
5. Fixed keybindings: summon `⌘⇧Space` · Refine `⌘K` · Copy & Close `⌘↵` · Cut & Close `⌘⇧↵` · Dismiss `Esc` · Delete draft `⌘W`. Rationale in design-spec §6.

## Code standards

- TypeScript strict plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature` (see `packages/config/tsconfig.base.json`). With `exactOptionalPropertyTypes`, optional fields are passed via conditional spread — `...(signal ? { signal } : {})` — follow that pattern.
- ESLint: `strict-type-checked` + `stylistic-type-checked`, `react-hooks/exhaustive-deps` as error, `simple-import-sort`. No `any`, explicit return types on exported functions, unions instead of `enum`, inline type imports.
- Small cohesive modules, named exports. No TODOs, no commented-out code, no `console.log`, no dead code on main.

## UI rules

- Strictly follow `design/tokens.md`: light cool palette, **zero color**, native macOS fonts (SF Pro through `-apple-system` / `system-ui`, SF Mono for mono), generous whitespace, near-black ink as the only accent. `design/*.reference.html` are visual references only — rebuild in React + shadcn, never copy their HTML.
- Use shadcn components from `@velata/ui`, not raw HTML elements (component mapping: design-spec §11.2).
- Every screen implements all of its states (scratchpad: empty / editing / refining / refined / multi-draft; each settings pane; onboarding).
- Fully keyboard-operable, visible `:focus-visible`, respect `prefers-reduced-motion`. Refining state uses the thin top `Progress` line — no color, no blinking.

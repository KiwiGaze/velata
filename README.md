<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="design/logo/velata-mark-dark.svg" />
    <img src="design/logo/velata-mark.svg" width="80" alt="Velata mark" />
  </picture>
</p>

# Velata ScratchPad

A local-first hybrid text scratchpad for macOS. Press `⌘⇧Space` in any app to summon it, drop in messy text — especially dictation from your favorite speech-to-text tool — clean it up with one AI call, and copy the result to paste wherever you were working.

Velata does not transcribe speech, and it never types into other apps. It covers the step between transcription and paste: catch, edit, refine, copy.

<!-- screenshot placeholder: add a screenshot or short GIF of the scratchpad here -->

## Why

Terminals and TUI-based coding agents have no reliable way to select and rewrite text in place. Dictated prompts — often long, rambling, and mixed-language — need a real editor before they are ready to send. Velata is that editor: a floating panel that takes keyboard focus over any app (including full-screen ones), holds multiple drafts, and hands focus back to the previous app when it hides.

## How it works

1. Press `⌘⇧Space` anywhere. The scratchpad floats up and takes keyboard focus.
2. Dictate with any speech-to-text app, or type and paste. The text lands in a real multi-line editor.
3. Press `⌘K`. Velata rewrites the draft into clean, natural text in your target language — mixed Chinese/English input included — while keeping every code identifier, file path, command, and URL verbatim. The result shows what changed until you start editing again.
4. Press `⌘↵`. The full text is copied to the clipboard, the window hides, and focus returns to the app you came from. Paste with `⌘V`.

Drafts persist between summons, so nothing is lost when the window hides. Velata runs as a menu-bar app with no Dock icon; Settings and Quit live in the tray menu.

## Keyboard shortcuts

| Action                          | Shortcut                           |
| ------------------------------- | ---------------------------------- |
| Summon / hide                   | `⌘⇧Space`                          |
| Refine with AI                  | `⌘K`                               |
| Copy all and close, keep draft  | `⌘↵`                               |
| Cut and close, delete the draft | `⌘⇧↵`                              |
| Close without copying           | `Esc`                              |
| Delete current draft            | `⌘W`                               |

## Data modes

Today Velata runs in local mode. Drafts and settings stay on your Mac, refine calls go directly from the app to the OpenAI-compatible `/chat/completions` endpoint you configure in Settings, and your API key is stored in the macOS Keychain. Use OpenAI, GLM, Kimi, Cerebras, a local OpenAI-compatible server, or anything with that shape.

Velata Cloud sync is planned as a future opt-in mode for people who want their scratchpad available across devices. It is not implemented in this release: there are no Velata accounts, cloud draft storage, or cloud sync paths today.

There is no telemetry. The refine prompt treats your draft strictly as text to clean. It never executes or answers the draft, even when it reads like an instruction.

## Build from source

Requires macOS, Node.js ≥ 20, pnpm 10, and a stable Rust toolchain.

```sh
pnpm install
pnpm dev            # development build with hot reload
pnpm tauri build    # release bundle → apps/desktop/src-tauri/target/release/bundle/macos/Velata.app
```

## Project layout

pnpm workspaces + Turborepo:

- `apps/desktop` — the Tauri v2 app (React 19 frontend, Rust shell)
- `packages/core` — provider-agnostic refine logic and prompt (pure TypeScript, unit-tested)
- `packages/ui` — shadcn/ui components and shared CSS tokens
- `packages/config` — shared TypeScript, ESLint, and Prettier config

## Documentation

- `apps/desktop/MANUAL_TEST.md` — manual checklist for GUI behavior that cannot be tested headlessly
- `CLAUDE.md` — development brief and architecture notes

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports and feature requests are welcome through the issue templates.

## License

[MIT](LICENSE)

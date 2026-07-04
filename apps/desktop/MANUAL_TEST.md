<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../design/logo/velata-mark-dark.svg" />
    <img src="../../design/logo/velata-mark.svg" width="56" alt="Velata mark" />
  </picture>
</p>

# Velata — manual test checklist

The automated gates (typecheck, lint, format, Vitest, `pnpm build`, `cargo clippy`,
`cargo fmt`, and a full `tauri build`) all pass. The items below are the behaviors that
CANNOT be verified headlessly and need a human on a real macOS GUI session.

## Run it

```
# from the repo root
pnpm install
pnpm tauri dev          # dev build with hot reload

# or run the release bundle produced by `pnpm tauri build --bundles app`:
open apps/desktop/src-tauri/target/release/bundle/macos/Velata.app
```

The app launches hidden with **no Dock icon** (accessory app). It lives in the menu-bar tray,
shown as the Velata two-panes **template icon** — check it recolors correctly on both light and
dark menu bars, and that the gap between the two panes stays visible at menu-bar size.

## 1. First run — onboarding

1. On the very first launch (empty settings), the window appears showing the onboarding card.
2. Pick a provider, paste an API key, click **Start using Velata** → the view switches to the
   empty ScratchPad. (Or click **I'll add a key later** to skip.)
3. Quit and relaunch → onboarding does NOT appear again (the `onboarded` flag persisted).

## 2. Focus steal + return — THE critical behavior

1. Click into a terminal so it is frontmost; type a couple chars to confirm it has focus.
2. Press **⌘⇧Space** → Velata floats up, on top, and the caret is in its editor. Type — the
   text lands **in Velata**, not the terminal. (This confirms the overlay steals keyboard focus.)
3. Press **Esc** (or ⌘⇧Space again) → Velata hides and the terminal is frontmost again. Type —
   text goes to the terminal. **This focus-return is the pass/fail gate.** If it fails, the
   documented fallback is the `tauri-nspanel` spotlight pattern.

## 3. Core loop

1. Summon, type or dictate messy/mixed text (e.g. `帮我 refactor 这个 useAuth hook…`).
2. Press **⌘K** → top progress line animates, text dims, caption shows `Refining…`.
3. On success the text is replaced with clean output; caption shows `Refined · ⌘Z to undo`.
   Press **⌘Z** → the pre-refine text is restored.
4. Press **⌘↵** → full text is copied to the clipboard and the window hides (draft kept).
5. Switch to the terminal, **⌘V** → the refined text pastes in.
6. With no API key/model configured, ⌘K shows `Connect a model in Settings` (no crash).

## 4. Keybindings (in-window)

- **⌘K** with a selection → only the selection is refined and replaced; with no selection →
  the whole buffer.
- **⌘↵** Copy & Close (keep draft) · **⌘⇧↵** Cut & Close (copy + delete draft) · **Esc** dismiss
  (or cancel an in-flight refine) · **⌘W** delete current draft · **⌘1–9** switch draft ·
  **⌘A** select all · **⌘C** copy selection (stays open) · **⌘P** instruction palette.

## 5. Drafts

1. Click the `Drafts · N` toggle → the rail slides open. Top to bottom it holds: a pinned
   **New draft** row (pen icon), the search field, the scrolling draft list, and two pinned
   rows at the bottom — **Transforms** above **Formatting**.
2. Create several drafts (the pinned **New draft** row at the top of the rail, or the tray
   "New draft"). The list stays ordered newest first: a new draft appears at the top, and
   editing an older draft moves it to the top. Long titles clamp to two lines; hover a
   truncated one → tooltip shows the full text.
3. ⌘1–9 switches; the active draft is highlighted. ⌘W deletes the current one (the list is never
   empty). Summoning with an empty current draft reuses it (setting: "Reuse empty draft on open").
4. Settings → Drafts → **When summoned: Most recent draft** → type into a draft, hide with Esc,
   press ⌘⇧Space → the same draft is open again and nothing new was created. Switch back to
   **New draft** → each summon starts a fresh draft again. The tray **New draft** item always
   creates one regardless of this setting.
5. Quit and relaunch → your drafts are still there (persisted, debounced writes).
6. **Search:** type in the search field → the list filters to drafts whose title OR body contains
   the query. Matched substrings render emphasized (semibold + underline, still zero-color — no
   yellow), and each hit shows a one-line body snippet with `…` around the first body match.
   Clicking **New draft** while a query is active clears the search so the new empty draft shows.
7. The **X** button (shown only while the field has text) clears the query. In the search field,
   **Esc** clears a non-empty query and keeps the window open; pressing **Esc** again on the now
   empty field hides the window as usual.
8. A query that matches nothing shows `No matching drafts` in place of the list.
9. The **Formatting** row at the rail bottom toggles its pressed styling (`aria-pressed`) on each
   click. The floating toolbar it opens is covered in a later section.

## 6. Instruction palette (⌘P)

Press **⌘P** → a Raycast-style palette lists your instructions (the default shows a `Default`
badge). Typing filters; selecting one runs the refine with that instruction. Esc closes the
palette only (does not hide the window).

## 7. Settings (tray "Settings…" or ⌘,)

1. The Settings window opens as a normal decorated 760×560 window and **takes keyboard focus**
   (a Dock icon appears while it is open, then disappears when you close it). — visual check.
2. **General:** launch-at-login toggle (verify in System Settings → General → Login Items);
   panel-opacity slider — lower it, summon the ScratchPad, and confirm the sheet becomes
   translucent (the frosted backdrop shows through).
3. **Model:** pick a provider (base URL prefills), enter/save an API key (stored in Keychain —
   check Keychain Access for a `com.velata.app` item; it is never written to the settings file),
   set a model, click **Test** → `✓ connected` or `✗ <error>`.
4. **Refine:** add/edit/delete instructions; exactly one stays "Default for ⌘K"; deleting the
   default promotes another; the last one can't be deleted.
5. **Drafts / Shortcuts:** the toggles and the "When summoned" choice persist; the shortcut list
   is read-only.

## 8. Theme / polish (visual)

Clean-sheet look: near-white paper, zero color except near-black ink and the one red delete-hover,
native macOS fonts, hairline dividers, the floating sheet has a soft neutral drop shadow over the frosted
backdrop, focus rings are visible on keyboard navigation, and Refining shows a monochrome progress
line (no blinking, no color). Reduced-motion is respected.
The two-panes mark renders crisply in onboarding (40px, standard geometry) and in the settings
sidebar (13px, compact geometry) — the gap must read at both sizes.

## 9. Resize the ScratchPad (drag any edge / corner)

Resize is a manual JS drag (the native `startResizeDragging` is a no-op on macOS), so it can only
be verified on a real GUI session.

1. Summon the ScratchPad. Move the pointer to any edge → the cursor becomes the matching resize
   arrow (↕ top/bottom, ↔ left/right, ⤢/⤡ at the four corners). Drag → the sheet resizes live.
2. Exercise all eight grips: the four edges and the four corners. The corner grips sit on the
   rounded/transparent corners — confirm they are actually grabbable (this is the case the
   `overflow-hidden` + `rounded` clip would otherwise break).
3. **Left- and top-edge drags (and the NW / NE / SW corners):** the opposite, anchored edge must
   stay put while you drag. Watch for wobble/jitter on that fixed edge — a small 1-frame shimmer
   is acceptable; a large bounce is not (escalation: an atomic Rust `setFrame` command).
4. **Min size:** keep shrinking → the sheet stops at 480×320 and will not go smaller; dragging
   further past the limit does not drift the anchored edge.
5. Content reflows: the editor area grows/shrinks, the footer stays pinned to the bottom, the
   rounded corners and drop shadow stay intact at every size.
   **Footer at narrow widths** (open the drafts rail, then shrink to the minimum): hint labels
   never wrap mid-phrase and never collide with the model label. The model label truncates with
   an ellipsis, then hides once the footer is narrower than 30rem; the `esc Dismiss` hint hides
   below 22rem; `⌘K Refine` and `⌘↵ Copy & Close` stay on one line at every size.
6. Summon/hide (⌘⇧Space, Esc) and refine still work after a resize.
7. **Not persisted (by design):** quit and relaunch → the sheet reopens at the default 740×480,
   not the size you left it at.
8. **Re-run section 2 end-to-end.** Enabling `.resizable()` changes the panel style mask that also carries
   the non-activating bit behind focus-return. Confirm the full round-trip still holds:
   type into a terminal → ⌘⇧Space → type into Velata → Esc → the terminal is frontmost and receives
   typing again. If this regresses, drop `.resizable()` from the style mask in `lib.rs` — the JS
   `Math.max(MIN_WIDTH/MIN_HEIGHT, …)` clamp already enforces the minimum size on its own.

## 10. Formatting toolbar

1. Open the drafts rail, then click the pinned **Formatting** row → it takes the pressed styling and
   a monochrome floating toolbar appears bottom-center over the editor. Hover any button → a tooltip
   names it. Confirm zero color anywhere (ink on paper, hairline border, neutral drop shadow).
2. **Bold:** select a word → click **Bold** → the source becomes `**word**`; the markers remain
   visible and recede, and the word is heavier. In the draft row / rendered preview, the raw markers
   are not visible. Click **Bold** again → it unwraps back to plain text.
3. **Italic over bold:** select a bold word → click **Italic** → the source becomes `***word***`;
   markers remain visible in the editor and the word is bold + italic.
4. **Code:** select text → click **Code** → the source wraps it in backticks and the text uses the
   mono style; clicking again unwraps.
5. **Bulleted list:** put the caret on a line → click **Bulleted list** → the source line starts with
   `- `; click again → the prefix is removed.
6. **Numbered list:** select several lines → click **Numbered list** → the source lines get numeric
   prefixes; click again → the numbers are stripped from the stored source.
7. **Checklist:** with the caret on a line → click **Checklist** → the source line starts with
   `- [ ] `.
8. **Quote:** with the caret on a line → click **Quote** → the source line starts with `> `.
9. **Empty-line no-op:** put the caret on a blank line → click any list or quote button → the text is
   unchanged (in particular, no preceding newline is deleted).
10. **Link:** select `foo` → click **Link** → the source becomes `[foo](https://example.com)` while
    the rendered preview / draft row show a link-styled label. With nothing selected → click
    **Link** → inserts `[text](https://example.com)` with `text` selected.
11. **Empty selection Bold:** click into an empty spot (no selection) → click **Bold** → inserts
    an empty bold span with the caret centered inside it, ready to type.
12. **Undo:** apply any toolbar format → press **⌘Z** → the formatting edit is undone.
13. **Focus is never stolen:** make a selection, then click a toolbar button → the text selection stays
    visible (the button press does not collapse the caret or blur the editor).
14. **Refining:** press **⌘K** to refine → the toolbar hides while `Refining…` shows, then returns once
    the result lands (applying a format in the `Refined` state edits the text and dismisses the diff,
    exactly like typing).
15. Click the **Formatting** row again → the toolbar hides.

## 11. Transforms bar

1. Open the drafts rail → the bottom pins two rows: **Transforms** (above) and **Formatting**. Click
   **Transforms** → it takes the pressed styling and a monochrome floating bar appears bottom-center over
   the editor: three text chips (e.g. `More concise`, `Turn to list`, `Polish`) and a **New batch** refresh
   button. Confirm zero color anywhere (ink on paper, hairline border, neutral drop shadow).
2. **Mutually exclusive with Formatting:** click **Formatting** → the Transforms bar closes and the
   Formatting toolbar opens; click **Transforms** again → the reverse. Only one floating bar shows at a time.
3. **New batch:** click the refresh button → the three chips are replaced by a different random three drawn
   from the built-in pool (~12 presets); the set visibly changes and does not repeat the previous three.
4. **Run a transform:** type some text → click a chip → it runs exactly like ⌘K (top progress line, text
   dims, `Refining…`, then the before/after diff with `⌘Z to undo`). The result reflects the chosen
   transform (e.g. `More concise` shortens it, `Turn to list` bullets it).
5. **Selection scope:** select part of the text → click a chip → only the selection is transformed and
   replaced; with no selection the whole draft is transformed.
6. **Focus is never stolen:** make a selection, then click a chip → the selection stays visible (the press
   does not collapse the caret or blur the editor), so the intended text is what gets transformed.
7. **Empty draft:** with a blank draft the chips are disabled (dimmed, not clickable); the **New batch**
   button still works.
8. **Refining:** while a transform is in flight the bar hides (like the Formatting toolbar), then returns
   once the result lands. The shown three stay the same across open/close; only **New batch** changes them.
9. **Language preserved:** run a transform on non-English text → the output stays in the input's language
   (transforms rewrite, they do not translate).
10. Click the **Transforms** row again → the bar hides.

## 12. Split Preview

Setup: a connected model in Settings; a multi-sentence messy draft in the scratchpad.

- [ ] Click `Split` in the header: the window widens (≥ ~1000 pt) keeping its height, stays fully on screen even when it was hugging the right display edge, and the drafts rail collapses if it was open.
- [ ] Pause typing ~1.5s: the right pane shows `refreshing…`, then the refined text with status `live`.
- [ ] Type again, pause again: the previous preview stays visible until replaced — no blank flash.
- [ ] Switch `Clean` ↔ `Structure` (click and arrow keys): an immediate re-refine runs; Structure output uses bold titles, bullets, and numbered steps — never a literal `#`.
- [ ] Change the target language while split is on: the preview re-refines immediately in the new language.
- [ ] `⌘K` forces an immediate refresh; the left text never changes in place and no diff overlay appears.
- [ ] `⌘↵` with a `live` preview: the clipboard holds the refined preview text and the window hides.
- [ ] Switch drafts and press `⌘↵` within a second: the clipboard holds the new draft's raw text — never the previous draft's preview.
- [ ] Select-all + delete on the left: the preview clears to its placeholder immediately.
- [ ] Blank → retype the exact same text → pause: the preview refreshes again (no permanently empty pane).
- [ ] `⌘P` does nothing while split is on; after leaving split it opens the palette again.
- [ ] Point Settings at an unreachable endpoint, edit, pause: a one-line error appears inside the preview only; the left editor still works and `⌘↵` copies the raw text; `⌘K` retries.
- [ ] Drag-resize narrower: the window refuses to shrink below the split minimum while split is on, and allows 560 again after leaving split.
- [ ] Click `Split` again: the window restores the exact pre-split width; `⌘K` refines in place with the diff overlay (classic mode unchanged).
- [ ] Toggle Split on while a classic refine is running: the refine cancels and the overlay dismisses.

## 13. CodeMirror 6 editor (source mode)

Run `pnpm dev` and summon the ScratchPad (`⌘⇧Space`). Some checks require a connected
model in Settings and an editable draft with enough text to refine; confirm that first so
missing API/model config is not mistaken for a CM6 failure.

### 13.1 Source rendering

- [ ] Type `**bold** _italic_ ` `` `code` `` — the `**`/`_`/`` ` `` markers stay visible and recede (lighter ink); bold is heavier, italic is slanted, code is monospace.
- [ ] A fenced code block ```` ```js ```` … ```` ``` ```` shows language syntax highlighting in monochrome (weight/style only, no color).
- [ ] The editor has no focus ring; text keeps the 26px top / 40px side padding.

### 13.2 IME / mixed-language input (core scenario)

- [ ] With the macOS Pinyin IME, type a full sentence mixing 中文 and English and numbers — no dropped, duplicated, or reordered characters; the candidate window commits correctly.
- [ ] Repeat with the Japanese IME (かな→漢字 conversion) inside a `**bold**` span — composition commits cleanly with no restart loop.
- [ ] Paste dictated mixed-language text and edit in the middle — no crash on delete after a line break (the regression this migration retires).

### 13.3 Undo / redo (multi-level)

- [ ] Type several words, then press `⌘Z` repeatedly — each press walks back one edit group; `⌘⇧Z` redoes.
- [ ] Apply a format from the toolbar, then `⌘Z` — the format is reverted.
- [ ] Refine (`⌘K`), then `⌘Z` — the refine is undone and the before/after diff overlay disappears.
- [ ] Switch drafts, type, then `⌘Z` — undo does not cross into the previous draft's history.

### 13.4 Find & replace

- [ ] `⌘F` opens the search panel; matches highlight in gray; Enter cycles matches.
- [ ] Type `alpha beta alpha`, replace `alpha` with `gamma`, then Replace all — both matches change; `Esc` closes the panel and does **not** dismiss the window (window `Esc` still dismisses when the panel is closed).

### 13.5 Existing shortcuts still work (no CM6 collision)

- [ ] `⌘K` refine, `⌘↵` Copy & Close, `⌘⇧↵` Cut & Close, `⌘W` delete draft, `⌘1`–`⌘9` select draft, `⌘P` palette, `⌘,` settings — all behave as before.
- [ ] Select a range, `⌘K` — only the selection is refined (selection-based refine).
- [ ] Split mode: left pane is source, right pane is rendered Markdown; `⌘↵` copies the refined preview.

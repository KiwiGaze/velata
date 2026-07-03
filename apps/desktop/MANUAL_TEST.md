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
shown as the Velata V **template icon** — check it recolors correctly on both light and dark
menu bars.

## 1. First run — onboarding

1. On the very first launch (empty settings), the window appears showing the onboarding card.
2. Pick a provider, paste an API key, click **Start using Velata** → the view switches to the
   empty ScratchPad. (Or click **I'll add a key later** to skip.)
3. Quit and relaunch → onboarding does NOT appear again (the `onboarded` flag persisted).

## 2. Focus steal + return — THE critical behavior (design-spec §7.1)

1. Click into a terminal so it is frontmost; type a couple chars to confirm it has focus.
2. Press **⌘⇧Space** → Velata floats up, on top, and the caret is in its editor. Type — the
   text lands **in Velata**, not the terminal. (This confirms the overlay steals keyboard focus.)
3. Press **Esc** (or ⌘⇧Space again) → Velata hides and the terminal is frontmost again. Type —
   text goes to the terminal. **This focus-return is the pass/fail gate.** If it fails, the
   documented fallback is the `tauri-nspanel` spotlight pattern.

## 3. Core loop (design-spec §9)

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
   **New draft** row (pen icon), the search field, the scrolling draft list, and a pinned
   **Formatting** row at the bottom.
2. Create several drafts (the pinned **New draft** row at the top of the rail, or the tray
   "New draft"). Long titles clamp to two lines; hover a truncated one → tooltip shows the full
   text.
3. ⌘1–9 switches; the active draft is highlighted. ⌘W deletes the current one (the list is never
   empty). Summoning with an empty current draft reuses it (setting: "Reuse empty draft on open").
4. Quit and relaunch → your drafts are still there (persisted, debounced writes).
5. **Search:** type in the search field → the list filters to drafts whose title OR body contains
   the query. Matched substrings render emphasized (semibold + underline, still zero-color — no
   yellow), and each hit shows a one-line body snippet with `…` around the first body match.
   Clicking **New draft** while a query is active clears the search so the new empty draft shows.
6. The **X** button (shown only while the field has text) clears the query. In the search field,
   **Esc** clears a non-empty query and keeps the window open; pressing **Esc** again on the now
   empty field hides the window as usual.
7. A query that matches nothing shows `No matching drafts` in place of the list.
8. The **Formatting** row at the rail bottom toggles its pressed styling (`aria-pressed`) on each
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
5. **Drafts / Shortcuts:** toggles persist; the shortcut list is read-only.

## 8. Theme / polish (visual)

Clean-sheet look: near-white paper, zero color except near-black ink and the one red delete-hover,
Geist fonts, hairline dividers, the floating sheet has a soft neutral drop shadow over the frosted
backdrop, focus rings are visible on keyboard navigation, and Refining shows a monochrome progress
line (no blinking, no color). Reduced-motion is respected.

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
8. **Re-run §2 end-to-end.** Enabling `.resizable()` changes the panel style mask that also carries
   the non-activating bit behind the §7.1 focus-return. Confirm the full round-trip still holds:
   type into a terminal → ⌘⇧Space → type into Velata → Esc → the terminal is frontmost and receives
   typing again. If this regresses, drop `.resizable()` from the style mask in `lib.rs` — the JS
   `Math.max(MIN_WIDTH/MIN_HEIGHT, …)` clamp already enforces the minimum size on its own.

## 10. Formatting toolbar

1. Open the drafts rail, then click the pinned **Formatting** row → it takes the pressed styling and
   a monochrome floating toolbar appears bottom-center over the editor. Hover any button → a tooltip
   names it. Confirm zero color anywhere (ink on paper, hairline border, neutral drop shadow).
2. **Bold:** select a word → click **Bold** → it wraps as `**word**` (selection stays on `word`).
   Click **Bold** again → it unwraps back to `word`.
3. **Italic over bold:** select the whole `**word**` (markers included) → click **Italic** → yields
   `***word***`.
4. **Code:** select text → click **Code** → wraps as `` `text` ``; clicking again unwraps.
5. **Bulleted list:** put the caret on a line → click **Bulleted list** → the line gets a `- ` prefix;
   click again → the prefix is removed.
6. **Numbered list:** select several lines → click **Numbered list** → they become `1. `, `2. `,
   `3. ` in order; click again → the numbers are stripped.
7. **Checklist:** with the caret on a line → click **Checklist** → the line gets a `- [ ] ` prefix.
8. **Quote:** with the caret on a line → click **Quote** → the line gets a `> ` prefix.
9. **Empty-line no-op:** put the caret on a blank line → click any list or quote button → the text is
   unchanged (in particular, no preceding newline is deleted).
10. **Link:** select `foo` → click **Link** → becomes `[foo](url)` with `url` selected. With nothing
    selected → click **Link** → inserts `[text](url)` with `text` selected.
11. **Empty selection Bold:** click into an empty spot (no selection) → click **Bold** → inserts
    `****` with the caret centered between the markers, ready to type.
12. **Undo:** apply any toolbar format → press **⌘Z** → the edit is undone (native textarea undo).
13. **Focus is never stolen:** make a selection, then click a toolbar button → the text selection stays
    visible (the button press does not collapse the caret or blur the editor).
14. **Refining:** press **⌘K** to refine → the toolbar hides while `Refining…` shows, then returns once
    the result lands (applying a format in the `Refined` state edits the text and dismisses the diff,
    exactly like typing).
15. Click the **Formatting** row again → the toolbar hides.

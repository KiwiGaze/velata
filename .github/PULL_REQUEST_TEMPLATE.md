## Summary

<!-- What does this change, and why? -->

## Checklist

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm format` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` passes
- [ ] `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check` passes
- [ ] `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings` passes
- [ ] GUI behavior changes verified against `apps/desktop/MANUAL_TEST.md` (or not applicable)

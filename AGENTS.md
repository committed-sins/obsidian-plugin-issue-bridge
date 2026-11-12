# Contributor instructions

- Sign every Git commit using the user's configured signing backend and key. Never bypass signing. If signing fails, preserve working files uncommitted.
- Use English commit messages and verify every new signature. Report missing verifier/trust configuration without rewriting signed commits.
- Preserve note content and frontmatter outside the managed issue block. Refuse malformed markers, duplicate mappings and unsafe concurrent writes.
- Treat a complete successful empty issue snapshot differently from a failed or partial request. Never erase tasks because a fetch failed.
- Keep credentials device-local and out of plaintext synced files, fixtures and logs. Never embed a confidential client secret in the plugin.
- Use synthetic fixtures. Test pagination, close/reopen, unassign, duplicate mappings, marker validation, title escaping and concurrent edits.
- Do not deploy to a vault, register an app or publish a release without user authorization.
- Run `npm ci` and `npm run check` on a fresh checkout. Report automated checks separately from live desktop/mobile verification.
- Retain the original upstream MIT notices in source and built artifacts. Record the upstream commit and adaptations in THIRD_PARTY_NOTICES.md.
- The authorized initial deployment target is `C:/Users/mj/Obsidian/Test`; use ignored `.env.local` or `OBSIDIAN_VAULT`. Copy only the three build artifacts and preserve settings and activation.

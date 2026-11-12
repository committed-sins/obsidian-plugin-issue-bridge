# Roadmap

1. Resolve open section-placement, URL-normalization and authentication/storage decisions. Freeze synthetic note and issue fixtures plus MVP acceptance criteria.
2. Create the TypeScript plugin skeleton, manifest, build and tests. Keep lifecycle, provider calls and note transformations separate.
3. Register/configure the GitHub App and implement validated authorization, secure device-local storage, renewal and disconnect. Test private-repository access and revoked/expired credentials.
4. Implement mapping discovery, duplicate detection and complete paginated assigned-issue snapshots, including closed issues and excluding pull requests.
5. Implement escaped deterministic tasks and guarded managed-block updates. Verify close, reopen, unassign, empty results, concurrent edits and malformed markers.
6. Add manual/interval sync, cancellation, backoff and useful error/status reporting. Verify offline and partial-fetch recovery without deleting previous results.
7. Validate on desktop and mobile in an explicitly selected test vault, including Obsidian Tasks queries. Document live results separately from automated checks.
8. Prepare release packaging, CI, documentation and community-directory submission after MVP acceptance.

Repository initialization creates design documents only. App registration, implementation, deployment, release publication and community submission are future work.

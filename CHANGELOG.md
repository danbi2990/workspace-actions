# Changelog

## Unreleased

- Refresh linked GitHub PR and issue status with a small concurrency queue, so
  `Workspace Actions: Refresh Status` no longer waits for every remote lookup
  one by one.
- Fetch base branch status for multiple Git repositories with the same
  concurrency queue while preserving per-repository remote fallback.
- Keep workspace file updates deterministic by collecting refreshed metadata
  before saving the `.code-workspace` file.
- Add focused tests for the concurrency queue, including worker limits, result
  ordering, and failure capture.

## 0.0.3 - 2026-04-28

- Publish the initial Marketplace-ready Workspace Actions extension.

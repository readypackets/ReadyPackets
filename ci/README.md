# Continuous integration

`github-actions-ci.yml` is the CI definition for this project. It is stored here
rather than at `.github/workflows/ci.yml` because the token used to create this
repository does not carry the `workflows` scope, so a push containing a workflow
file is rejected by GitHub.

To activate it, move the file into place and push with credentials that have the
`workflow` scope:

```bash
mkdir -p .github/workflows
git mv ci/github-actions-ci.yml .github/workflows/ci.yml
git commit -m "Enable CI workflow"
git push
```

The workflow runs the same three gates used throughout development, against a
MySQL service container:

1. `tsc --noEmit` — type check, must report zero errors
2. `vitest run` — 100 unit tests
3. `verify-security.ts` — 46 black-box checks against a started instance

The third gate matters most, because a policy header or an authorisation guard
can regress without producing a type error. It builds both the client and the
server bundle, starts the application, and probes the real HTTP surface.

A second job reports `pnpm audit` findings without failing the build, so a newly
published advisory in a transitive dependency does not block an unrelated change.
Review its output on every run.

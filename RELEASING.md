# Releasing

## Version source of truth

The canonical project version lives in the top-level `VERSION` file. Every other place that
mentions the version is derived from it and is verified by `scripts/check-versions.sh` (run in
CI on every PR via `.github/workflows/check-versions.yml`):

- `browser-emulator/package.json`
- `browser-emulator/docs/openapi.yaml` (and the generated `browser-emulator/docs/index.html`)
- `loadtest-controller/pom.xml` — the project's own `<version>`, **not** the
  `<parent><version>` (that pins the third-party `spring-boot-starter-parent` BOM and is
  unrelated to this project's version — never touch it when bumping)
- `README.md` and `aws-setup/setup-aws-workers.sh` / `aws-setup/ec2-browser-emulator.yml`
  (AWS AMI-creation git-ref examples/defaults)

Do not hand-edit any of these derived locations directly — always go through
`scripts/bump-version.sh` so all of them stay in sync.

## Release cadence

Releases are **not** tied to individual PRs. PRs merge to `master` continuously without
touching the version at all. A release is cut only when a maintainer explicitly decides enough
merged changes justify one.

## Cutting a release

1. On an up-to-date `master`, run:
   ```
   ./scripts/bump-version.sh <new-version>   # e.g. 5.0.2, no leading "v"
   ```
   This updates all the locations above, regenerates `docs/index.html`, and self-verifies with
   `scripts/check-versions.sh`.
2. Review the diff (`git diff --stat` — should touch exactly the files listed above) and commit,
   e.g. `chore: bump version to <new-version>`.
3. Push the commit (directly to `master` or via a PR — CI's version-consistency check will pass
   either way since everything is already in sync).
4. Tag and push the tag:
   ```
   git tag v<new-version>
   git push origin v<new-version>
   ```
5. Create the release as a **draft**, so nothing goes public until reviewed:
   ```
   gh release create v<new-version> --target master --draft --generate-notes
   ```
   `--generate-notes` seeds the body from merged PRs since the previous tag. Edit/expand it with
   a hand-written summary (see prior releases for tone/format), then review and publish it
   yourself when ready.

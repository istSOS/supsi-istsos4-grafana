# Submission checks — 1.1.1 candidate

Checked on 2026-10-07. These are local results, not a new Grafana submission result.

## Corrections

- The existing `v1.1.0` source tag contains package version `1.0.0`. The candidate uses `1.1.1` in package.json, both lockfile version fields, citation metadata, and the built plugin. Publish a new matching `v1.1.1` source tag when the remaining review blocker is resolved; do not reuse `v1.1.0` as the source URL.
- Grafana Go SDK updated from `0.292.0` to `0.297.0`; backend builds use Go `1.26.8`. Docker builders and CI use the same minimum toolchain.
- Removed the query handler's reads of `NODE_ENV`, `GF_DEFAULT_APP_MODE`, and `GF_APP_MODE`. Query URL debug messages now use Grafana's logger directly.
- Refreshed compatible npm dependencies, including the packages identified by the submission scanner. Updated existing DOMPurify and Immutable overrides and added a scoped js-cookie override for react-use. Its get/set/remove API was checked with a cookie round trip.
- Configured ts-node's CommonJS module resolution explicitly to keep webpack configuration loading compatible with the refreshed Grafana TypeScript configuration.
- Added release-version checks, backend tests, and frontend/backend vulnerability audits to the release workflow. The frontend audit currently blocks that workflow because of the finding below.

## Verification

| Check | Local result |
| --- | --- |
| npm clean install | Passed against the final lockfile |
| TypeScript | Passed |
| ESLint | No errors; 20 deprecation warnings |
| Frontend tests | 4 suites / 33 tests passed |
| Backend tests (`go test ./pkg/...`) | Passed |
| Frontend production build | Passed; bundle-size warnings |
| Backend build | All six platform binaries rebuilt |
| govulncheck source scan (`./pkg/...`) | No vulnerabilities found |
| govulncheck binary scans | No vulnerabilities found in all six binaries |
| Release versions | Passed for `v1.1.1`; stale source, tag, built-plugin, and lockfile-root versions rejected in fixture checks |
| Official Grafana metadata validator | Passed (`-analyzer=metadatavalid`) |
| ZIP integrity | Passed; 18 entries including six backend binaries |

The source scan covers the shipped Go plugin packages. The metadata validator check does not run all Grafana submission analyzers.

## Remaining security findings

The final npm audit reports no critical findings. The only directly reported high-severity vulnerability is **braces 3.0.3 / CVE-2026-93687**, a development-only transitive dependency. The audit counts 43 affected package entries because the same vulnerability propagates through tooling dependency chains; that is not 43 distinct high-severity vulnerabilities.

The [upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched release, and npm still publishes 3.0.3 as latest. It is required by chokidar and micromatch through build, lint, and test tools, including Sass, fork-ts-checker-webpack-plugin, eslint-webpack-plugin, fast-glob, and Jest. It is not included as a runtime module in the plugin bundle. Updating compatible versions has not removed it.

There are also 19 moderate affected-package entries related to JavaScript OpenTelemetry, Moment, React Router, and sprintf-js. These have not been suppressed. This candidate must not be described as having a clean npm or complete Grafana submission scan.

No advisory exclusions, package-name substitutions, or lockfile omissions were used. Resolving the high-severity blocker requires a maintained upstream fix, a verified tooling migration that removes every dependency path, or an accepted procedure from Grafana for this unpatched development-only finding.

## Local archive

- File: `supsi-istsos4-datasource-1.1.1.zip`
- SHA1: `1e3ea75fb08a8a973b4bdc8299b5e630b4b3b23a`
- Checksum file: `supsi-istsos4-datasource-1.1.1.zip.sha1`

No commit, source tag, GitHub release, or Grafana resubmission was made. The previous dist directory is preserved under the ignored `work/` directory.

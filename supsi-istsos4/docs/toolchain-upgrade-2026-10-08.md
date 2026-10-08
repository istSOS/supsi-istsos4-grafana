# Grafana toolchain upgrade verification — 2026-10-08

The official development scaffold was upgraded from `@grafana/create-plugin` 5.22.1 to 7.12.1, using the required intermediate 5.27.1 update and the official migrations. Development dependencies were aligned with the published 7.12.1 webpack template. Grafana runtime dependencies remain on the compatible 11.x line; this upgrade does not raise the plugin's advertised Grafana minimum version.

The updater initially encountered incompatible legacy TypeScript ESLint dependencies. Aligning those dependencies with the current template allowed all migrations to complete. The obsolete lint suppression was migrated to the new deprecation rule, and `$select` draft synchronization now resets during rendering when its saved value changes, avoiding the new effect-state lint error. A regression test covers invalid drafts being reset after an external query change.

The custom frontend/backend Dockerfile was preserved at the plugin root, outside the generated `.config` directory. Local development, Docker builds, and the release workflow use Node.js 22.23.3; npm is declared as 10.9.9. Browser test artifacts and authentication state are excluded from Docker build contexts.

## Installed versions

| Tool | Version |
| --- | --- |
| Grafana create-plugin scaffold | 7.12.1 |
| Grafana ESLint configuration | 10.0.0 |
| Grafana TypeScript configuration | 2.2.0 |
| Grafana browser test fixtures | 3.14.1 |
| Grafana signing tool | 3.3.3 |
| ESLint | 9.39.5 |
| TypeScript | 5.9.2 |
| webpack / webpack-cli | 5.111.1 / 6.0.1 |
| Jest | 29.7.0 |
| Playwright | 1.63.0 |
| Sass | 1.105.1 |
| React | 18.3.1 |
| Grafana frontend packages | 11.6.16 |

## Validation

Commands run from `supsi-istsos4/` with the Node version above:

| Check | Result |
| --- | --- |
| `npm ci --no-audit` | Pass; lockfile installs cleanly |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass; 20 existing Grafana API deprecation warnings |
| `npm run test:ci` | Pass; 34 tests across four suites |
| `npm run build` | Pass; existing bundle-size warnings, 459 KiB module |
| webpack development compilation to a temporary output directory | Pass |
| `go test ./pkg/...` | Pass |
| `mage -f buildAll` | Pass; all six backend platform binaries |
| `govulncheck ./pkg/...` | Pass; no vulnerabilities found |
| `npm run check:release -- v1.1.1` | Pass |
| `docker compose config --quiet` | Pass |
| Complete Docker image build with Node.js 22.23.3, Go 1.26.8, and Grafana 11.5.3 | Pass; image `supsi-istsos4-toolchain-check:local` |
| Chromium tests against Grafana 11.5.3 and rebuilt plugin | Pass; six plugin tests plus authentication |
| `npm audit --audit-level=high` | Fail; upstream security findings below |
| OSV Scanner 2.6.0 against `package-lock.json` | Fail; two unique high-severity advisories and five moderate advisories |

The browser specs now exercise the actual SensorThings UI rather than the original scaffold's API Key, Query Text, and Constant fields. Checks include successful and invalid Save & Test, query payloads reaching the backend, and real Things results displayed in a table. They depend on the provisioned public SensorThings service being available.

The isolated Grafana test container and network were removed after validation. The rebuilt plugin remains in `dist/` and the validated Docker image remains available locally.

For Things queries, the browser specs explicitly disable the time range. The existing new-query default applies `phenomenonTime` to Things, which the public API rejects with HTTP 400; choose **Time range → Disabled** for a valid Things query. This existing behavior was observed during verification and remains outside the toolchain changes. OAuth2, other Grafana versions, and authenticated plugin signing were not validated in this run.

## Remaining security blockers

1. **`braces` 3.0.3 — CVE-2026-93687 / GHSA-vfj7-8cjw-p6xm.** This remains a transitive development dependency through the official template's Jest and eslint-webpack-plugin dependencies, via `micromatch` 4.0.8. The advisory lists no patched release. See the [upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
2. **`basic-ftp` 5.3.1 — CVE-2026-102990 / GHSA-c475-qrg2-pj4r.** The updated official signing tool adds the chain `@grafana/sign-plugin` 3.3.3 → `proxy-agent` 8.0.1 → `pac-proxy-agent` 9.0.1 → `get-uri` 8.0.0 → `basic-ftp` 5.3.1. The advisory's patched versions begin at 6.2.1, but `get-uri` requires `^5.2.0`. See the [upstream advisory](https://github.com/advisories/GHSA-c475-qrg2-pj4r).

No braces replacement, fork, backport, or new dependency override was applied. The official upgrade does not make the source lockfile pass Grafana review. The release workflow retains its security audit gate and will fail until these findings are resolved or the review procedure changes.

Raw security scan results from this verification are available locally at `/tmp/istsos-toolchain-npm-audit.json` and `/tmp/istsos-toolchain-osv.json`.

The plugin version remains 1.1.1, with the tooling changes recorded under **Unreleased**. No release was published or resubmitted.

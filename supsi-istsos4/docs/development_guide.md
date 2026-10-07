# Development guide

## Prerequisites

- Node.js 22 or newer and npm (the project declares npm 10.9.2).
- Go 1.26.8 or newer and [Mage](https://magefile.org/) for backend builds and tests.
- Docker Compose for the provisioned Grafana environment.

```bash
git clone https://github.com/istSOS/supsi-istsos4-grafana.git
cd supsi-istsos4-grafana/supsi-istsos4
npm ci
go install github.com/magefile/mage@v1.17.2
```

Ensure the Go binary directory is on your `PATH` so that `mage` is available.

## Build and check

Run from `supsi-istsos4/`:

```bash
npm run typecheck
npm run lint
npm run test:ci
go test ./pkg/...
npm run build
mage buildAll
```

The frontend and platform-specific backend executables are written to `dist/`. The webpack build copies `src/README.md` into `dist/README.md`; this is the documentation included in the release and used for the Grafana catalog.

## Run the provisioned review environment

```bash
npm run server
```

This runs `docker compose up --build`, building both frontend and backend inside Docker. Open [localhost:3010](http://localhost:3010) and sign in with `admin` / `admin` on a fresh instance. The data source and review dashboard are provisioned automatically. See the [review instructions](../provisioning/README.md).

To try another Grafana version:

```bash
GRAFANA_VERSION=10.4.0 docker compose up --build
```

The default version is 11.5.3. Verify the advertised minimum version as well as the Grafana version targeted by the submission.

## Iterate locally

Run `npm run dev` to watch frontend changes. Rebuild the backend with `mage buildAll` after Go changes. For an existing Grafana installation, install the contents of `dist/` under a plugin directory named `supsi-istsos4-datasource`, allow this unsigned plugin during development, and restart Grafana after replacing backend binaries.

The review container contains a built copy of the plugin. Run `docker compose up --build` again to load changed source code.

## Browser tests

With the review Grafana running:

```bash
npx playwright install chromium
GRAFANA_URL=http://localhost:3010 npm run e2e
```

See `playwright.config.ts` for authentication and project settings. The existing browser specs still reference scaffold fields such as **Query Text**, **Constant**, and **API Key**; they need updating before they can validate this plugin. Use the manual checks in the review instructions in the meantime. Changes to the configuration or query editor should also be reflected in the screenshots under `src/img/` before submission.

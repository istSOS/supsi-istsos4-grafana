# istSOS4 Grafana data source

The istSOS4 data source plugin lets Grafana query OGC SensorThings API services, including istSOS4 deployments. It provides a visual query builder for SensorThings entities, OData options, spatial and temporal filters, Grafana variables, and OAuth2-protected API access through the plugin backend.

## Features

- Query SensorThings API entities: Things, Locations, Sensors, ObservedProperties, Datastreams, Observations, FeaturesOfInterest, and HistoricalLocations.
- Build OData queries with `$select`, `$expand`, `$top`, `$skip`, ordering, entity IDs, and custom query expressions.
- Query related collections through navigation paths such as `/Datastreams(16)/Observations`.
- Filter by basic fields, phenomenon/result time, measurement metadata, observations, related entities, and spatial geometries.
- Use Grafana dashboard variables, including chained variables, in query builders and custom expressions.
- Fetch paginated SensorThings responses and expanded Observations.
- Execute dashboard, Explore, variable, and Grafana alert queries through the Go backend.
- Configure OAuth2 password-grant credentials and default pagination limits in the data source settings.

## Requirements

- Grafana 10.4.0 or newer.
- A SensorThings API compatible endpoint.
- OAuth2 credentials when the target API requires authentication.

## Screenshots

![Data source configuration](https://raw.githubusercontent.com/istSOS/supsi-istsos4-grafana/main/supsi-istsos4/src/img/screenshot-datasource-config.png)

![Query editor and panel creation](https://raw.githubusercontent.com/istSOS/supsi-istsos4-grafana/main/supsi-istsos4/src/img/screenshot-query-panel.png)

## Configuration

1. In Grafana, open **Connections** or **Data sources** and add the **istSOS4** data source.
2. Set **API URL** to the SensorThings API base URL.
3. Optionally set **Path** when your API uses an additional route prefix.
4. Select **Anonymous** for public APIs, or **OAuth2** when the target API requires authentication.
5. For OAuth2, set **Token URL**, optional **Refresh URL**, **Username**, and **Password**. **Client ID** and **Client Secret** are optional.
6. Optionally set default `$top` values for entity queries and expanded Observations.
7. Select **Save & test**.

## Usage

Use the query editor to select a SensorThings entity, add an entity ID when needed, expand related entities, and add filters. For observations from a specific datastream, select **Observations**, choose **Add condition → Datastream → ID**, and set the ID condition to the desired value. Dashboard query JSON also supports `navigationPath`, for example `[{"entity":"Datastreams","entityId":1}]` to query `/Datastreams(1)/Observations`; the editor does not currently provide a parent-entity selector. The custom query field accepts OData query-option fragments, not resource paths.

For dashboards, create Grafana variables from the same data source and reference them in entity IDs, filters, or custom expressions. This supports dynamic dashboards where one variable can narrow the values available to another variable.

The query editor supports SensorThings entities such as Things, Datastreams, Observations, Locations, Sensors, ObservedProperties, FeaturesOfInterest, and HistoricalLocations. You can combine entity IDs, expansions, `$select`, `$top`, `$skip`, ordering, count options, visual filters, and custom OData expressions.

## Filter conditions

Choose **Add condition**, then select a field, an operator, and a value. Related fields appear as **Sensor → Name** or **Thing → ID**. Date fields show UTC date inputs; spatial fields show the drawing map.

Use **All conditions (AND)** when every rule must match, or **Any condition (OR)** when at least one rule must match. **Add group** creates a nested set with its own All/Any choice. For example, put two Name conditions in an Any group and a Unit Symbol condition alongside it in the outer All group: `(Name = north OR Name = south) AND Unit Symbol = °C`. The summary below the editor shows the grouping.

For Datastreams, **Expanded observations** has its own conditions and groups. Adding a condition there includes the Observations expansion automatically. The Grafana time range and dashboard variable constraints remain mandatory outside the selected All/Any groups. Existing dashboards retain AND behavior until you change it.

## Development

Install dependencies and run the local development environment:

```bash
npm ci
npm run dev
```

Use Node.js 22 or newer, Go 1.25.7 or newer, and Mage. Run commands from `supsi-istsos4/`. Build and test the plugin:

```bash
npm run typecheck
npm run lint
npm run test:ci
go test ./pkg/...
npm run build
mage buildAll
```

Run Grafana with Docker:

```bash
npm run server
```

This builds both frontend and backend in Docker and provisions the example. Open **http://localhost:3010**, sign in with `admin` / `admin` on a fresh instance, and open **Dashboards → istSOS4 → istSOS4 review dashboard**. See the [development guide](docs/development_guide.md) and [review testing guidance](provisioning/README.md). The public API must be reachable and contain observations for the selected datastream and time range.

For submission, use the [reviewer guide](provisioning/REVIEWER_GUIDE.md): it includes concrete checks, expected results, two provisioned dashboards, known API limitations, and testing guidance to paste into the submission form. `docker-compose.review.yaml` lets reviewers test the extracted release archive directly.

## Publishing

This plugin is intended to be published in the Grafana plugin catalog as `supsi-istsos4-datasource`.

Before submitting a release or updating a submission:

1. Update the release version in `package.json` and `package-lock.json`, add a dated changelog entry, and refresh screenshots to match the current editor. The version remains `1.0.0` while the latest changes are listed as **Unreleased**; choose the release version before packaging.
2. Update `src/README.md`, which webpack copies into `dist/README.md`. Grafana uses the README included in the plugin archive for its catalog page.
3. Run the frontend checks and backend tests above, build the frontend with `npm run build`, and build backend binaries with `mage buildAll`.
4. Validate the packaged plugin with the [Grafana plugin validator](https://github.com/grafana/plugin-validator). The release workflow currently runs only the metadata analyzer; run the full validator before submission.
5. Create a release ZIP whose top-level directory is named `supsi-istsos4-datasource`. The `v*` tag workflow builds the plugin and creates a **draft** GitHub release with the ZIP and `.sha1` file. Publish that release so the archive URL is publicly accessible.
6. In Grafana Cloud under **Org Settings → My Plugins**, open the existing plugin and select **Submit Update** for an approved plugin. Provide the public release ZIP URL, source code URL for the same release tag and `supsi-istsos4/` subdirectory, SHA1 checksum, and [testing guidance](provisioning/README.md). For a submission still under review, follow the reviewer's instructions for supplying a replacement archive.

Follow Grafana's [publish or update instructions](https://grafana.com/developers/plugin-tools/publish-a-plugin/publish-a-plugin/) and [catalog README guidance](https://grafana.com/developers/plugin-tools/publish-a-plugin/publish-faqs#how-can-i-update-the-plugins-catalog-page).

The first public submission does not need to be signed before review. After Grafana approves the plugin and assigns a signature level, configure the `GRAFANA_ACCESS_POLICY_TOKEN` repository secret so future releases can be signed automatically.

## License

Copyright 2025 SUPSI.

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.

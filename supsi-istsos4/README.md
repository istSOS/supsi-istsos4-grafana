# istSOS4 Grafana data source

The istSOS4 data source plugin lets Grafana query OGC SensorThings API services, including istSOS4 deployments. It provides a visual query builder for SensorThings entities, OData options, spatial and temporal filters, Grafana variables, and OAuth2-protected API access through Grafana's data source proxy.

## Features

- Query SensorThings API entities: Things, Locations, Sensors, ObservedProperties, Datastreams, Observations, FeaturesOfInterest, and HistoricalLocations.
- Build OData queries with `$select`, `$expand`, `$top`, `$skip`, ordering, entity IDs, and custom query expressions.
- Filter by basic fields, phenomenon/result time, measurement metadata, observations, related entities, and spatial geometries.
- Use Grafana dashboard variables, including chained variables, in query builders and custom expressions.
- Fetch paginated SensorThings responses and expanded Observations.
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
5. For OAuth2, set **Token URL**, **Username**, **Password**, **Client ID**, and **Client Secret**.
6. Optionally set default `$top` values for entity queries and expanded Observations.
7. Select **Save & test**.

## Usage

Use the query editor to select a SensorThings entity, add an entity ID when needed, expand related entities, and add filters. The custom query field can be used for advanced OData fragments when the visual builder does not cover a specific query.

For dashboards, create Grafana variables from the same data source and reference them in entity IDs, filters, or custom expressions. This supports dynamic dashboards where one variable can narrow the values available to another variable.

The query editor supports SensorThings entities such as Things, Datastreams, Observations, Locations, Sensors, ObservedProperties, FeaturesOfInterest, and HistoricalLocations. You can combine entity IDs, expansions, `$select`, `$top`, `$skip`, ordering, count options, visual filters, and custom OData expressions.

## Development

Install dependencies and run the local development environment:

```bash
npm ci
npm run dev
```

Build and test the plugin:

```bash
npm run typecheck
npm run lint
npm run test:ci
npm run build
mage
```

Run Grafana with Docker:

```bash
npm run server
```

## Publishing

This plugin is intended to be published in the Grafana plugin catalog as `supsi-istsos4-datasource`.

Before submitting a release:

1. Build the frontend with `npm run build`.
2. Build backend binaries with `mage`.
3. Validate the packaged plugin with the Grafana plugin validator.
4. Create a GitHub release ZIP whose top-level directory is named `supsi-istsos4-datasource`.
5. Submit the release ZIP URL, source code URL, SHA1 checksum, and testing guidance in Grafana Cloud under **Org Settings > My Plugins**.

The first public submission does not need to be signed before review. After Grafana approves the plugin and assigns a signature level, configure the `GRAFANA_ACCESS_POLICY_TOKEN` repository secret so future releases can be signed automatically.

## License

Copyright 2025 SUPSI.

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.

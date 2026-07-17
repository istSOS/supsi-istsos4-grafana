# istSOS4 Grafana data source

The istSOS4 data source lets Grafana query OGC SensorThings API services, including istSOS4 deployments. It provides a visual query builder for SensorThings entities, OData options, temporal and spatial filters, dashboard variables, pagination, and optional OAuth2 authentication through the plugin backend.

## Screenshots

![Data source configuration](https://raw.githubusercontent.com/istSOS/supsi-istsos4-grafana/main/supsi-istsos4/src/img/screenshot-datasource-config.png)

![Query editor and panel creation](https://raw.githubusercontent.com/istSOS/supsi-istsos4-grafana/main/supsi-istsos4/src/img/screenshot-query-panel.png)

## Requirements

- Grafana 10.4.0 or newer.
- A SensorThings API compatible endpoint.
- OAuth2 credentials only when the target API requires authentication.

## Configure The Data Source

1. In Grafana, open **Connections** or **Data sources**.
2. Add the **istSOS4** data source.
3. Set **API URL** to the SensorThings API base URL.
4. Optionally set **Path** when your API uses an additional route prefix.
5. Select **Anonymous** for public APIs, or **OAuth2** for protected APIs.
6. For OAuth2, set **Token URL**, optional **Refresh URL**, **Username**, and **Password**. **Client ID** and **Client Secret** are optional.
7. Optionally configure default `$top` values for entity queries and expanded Observations.
8. Select **Save & test**.

## Build Queries

Use the query editor to:

- select a SensorThings entity such as Things, Datastreams, Observations, Locations, Sensors, ObservedProperties, FeaturesOfInterest, or HistoricalLocations;
- optionally set a specific entity ID;
- optionally set a parent entity and ID to query a related collection such as `/Datastreams(16)/Observations`;
- expand related entities;
- add `$select`, `$top`, `$skip`, ordering, and count options;
- add basic, temporal, measurement, observation, entity, and spatial filters;
- use a custom OData expression when the visual builder does not cover a specific query.

The plugin fetches paginated SensorThings responses and can also paginate expanded Observations.

## Use Variables

Create Grafana dashboard variables with the istSOS4 data source and reference them in entity IDs, filters, or custom expressions. This supports dynamic dashboards, including chained variables where one variable narrows the values available to another.

## Authentication Modes

Use **Anonymous** when the SensorThings API is public. In this mode only the API URL is required.

Use **OAuth2** when the API requires authentication. The plugin backend posts password-grant form data to the token URL, caches the token, refreshes it through the configured refresh URL when possible, and adds it to SensorThings requests executed through Grafana's standard backend query path. Password/client secret values are stored as secure fields.

## Support

Report issues at https://github.com/istSOS/supsi-istsos4-grafana/issues.

# istSOS4 Grafana data source

The istSOS4 plugin connects Grafana to OGC SensorThings API services, including istSOS4. It provides a visual query builder, grouped filters, dashboard variables, pagination, and optional OAuth2 authentication. Dashboard, Explore, variable, and alert queries run through the Go backend.

## Features

- Query Things, Locations, Sensors, ObservedProperties, Datastreams, Observations, FeaturesOfInterest, and HistoricalLocations.
- Query related collections such as `/Datastreams(1)/Observations` through navigation paths in dashboard query JSON.
- Combine OData options, temporal and spatial conditions, All/Any matching, and nested filter groups.
- Use dashboard variables and chained variables in queries.
- Visualize observations as time series and use backend queries for Grafana alerting.
- Connect anonymously to public APIs or use OAuth2 password-grant authentication for protected APIs.

## Configuration and usage

Requires Grafana 10.4.0 or newer and a compatible SensorThings API endpoint. Add **istSOS4** under Grafana **Connections → Data sources**, set **API URL** to the versioned API base URL, select **Anonymous** or **OAuth2**, and select **Save & test**.

See the [plugin documentation](supsi-istsos4/src/README.md) for authentication, query building, grouped conditions, pagination, variables, and alerts.

## Run the example

With Docker Compose installed, run from the repository root:

```bash
docker compose -f supsi-istsos4/docker-compose.yaml up --build
```

Open [Grafana at localhost:3010](http://localhost:3010), sign in with `admin` / `admin` on a fresh instance, and open **Dashboards → istSOS4 → istSOS4 review dashboard**. The image builds both the frontend and backend and provisions the data source and example dashboard.

The example uses the public SUPSI API and needs network access. See the [review instructions](supsi-istsos4/provisioning/README.md) for expected results, changing the API or datastream, and troubleshooting empty panels or API errors.

## Development and submission

- [Development guide](supsi-istsos4/docs/development_guide.md)
- [Reviewer examples and expected results](supsi-istsos4/provisioning/REVIEWER_GUIDE.md)
- [Release and submission instructions](supsi-istsos4/README.md#publishing)
- [Changelog](supsi-istsos4/CHANGELOG.md)
- [Report an issue](https://github.com/istSOS/supsi-istsos4-grafana/issues)

## License

Licensed under the [Apache License, Version 2.0](supsi-istsos4/LICENSE).

# Grafana review environment

See the [reviewer testing guide](REVIEWER_GUIDE.md) for concrete examples, expected results, known limitations, and a testing-guidance paragraph to copy into the submission. It also explains how to test the exact release ZIP with `docker-compose.review.yaml`.

Run from `supsi-istsos4/` with Docker Compose installed:

```bash
docker compose up --build
```

Open [localhost:3010](http://localhost:3010), sign in with `admin` / `admin` on a fresh instance, and open **Dashboards → istSOS4 → istSOS4 review dashboard**. Docker builds both frontend and backend; no local Node.js or Go installation is needed for this path.

## Provisioned example

- Data source: **istSOS4**, UID `PD20B5DD0C4265892`, anonymous authentication.
- API URL: `https://geoservice2.ist.supsi.ch/test/v1.1`.
- Dashboard: `dashboards/json/istsos4-review-dashboard.json`.
- Chained-variable dashboard: `dashboards/json/istsos4-review-variables.json`.
- **Datastream 1 — observations in selected range** queries `/Datastreams(1)/Observations` with the Grafana phenomenon-time range, ascending time order, and `$top=1000`.
- **Datastream 1 — latest observations** queries the same collection with descending phenomenon-time order and `$top=100`, independently of the dashboard time range.

Both panels disable **Follow nextLink** so the examples remain bounded. `$top` alone sets the page size when following next links; it does not cap the total rows fetched.

The default time range is the last seven days. The time-series panel should contain numeric observation results when that datastream has data in the selected range. The latest-observations table helps identify the timestamps to use when the API contains only historical data. Its query requests descending phenomenon-time order.

The main dashboard also includes grouped datastream filters, expanded temperature observations, a coordinate table, Geomap, a custom query, and a pagination baseline. The second dashboard demonstrates Thing → Datastream query-variable chaining.

## Reviewer checks

1. Open **Connections → Data sources → istSOS4** and select **Save & test**. Expect `Successfully connected to SensorThings API`.
2. Open the dashboard and confirm both queries return without errors. If the graph is empty, inspect the latest-observations table and select a time range covering those timestamps.
3. Edit the time-series panel. Confirm the entity is **Observations** and **Query Preview** starts with `/Datastreams(1)/Observations`. The navigation path is stored in dashboard JSON; the current editor has no parent-entity selector. Change the Grafana time range and confirm the returned observations are restricted to it.
4. In Explore, query **Datastreams** to discover available IDs. If ID `1` has no observations or does not exist, edit `navigationPath[0].entityId` in both dashboard JSON targets and recreate Grafana with a populated datastream ID.
5. To exercise grouped conditions, query **Datastreams**, add two **Name** conditions in an **Any condition (OR)** group, and add a **Unit Symbol** condition in the outer **All conditions (AND)** group. Choose values present in the target API and inspect the generated query preview.
6. For alerting, use an Observations query with a fixed numeric datastream ID filter or navigation path and the Grafana time range enabled. Dashboard variables are resolved by the frontend; use fixed values in alert queries. Add Grafana reduce and threshold expressions appropriate to the data.

## API availability and troubleshooting

This example depends on an external public API. On 2026-10-07, `/test/v1.1/Datastreams(1)/Observations` returned current observations successfully. The older `/v4/v1.1` endpoint returned HTTP 502. Use the provisioned `/test/v1.1` URL and recheck connectivity before submission.

If **Save & test** or a panel returns an HTTP error, verify the API separately; changing the dashboard time range does not resolve an unavailable API. To use another SensorThings deployment, change `jsonData.apiUrl` and authentication in `datasources/datasources.yml`, choose a valid datastream ID in both dashboard targets, and recreate Grafana:

```bash
docker compose up --build --force-recreate
```

For a local API, use a URL reachable from the Grafana container. `localhost` inside that container refers to Grafana itself.

OAuth2 secrets belong in `secureJsonData`; do not commit credentials. The shipped public example requires no credentials.

See [Grafana provisioning documentation](https://grafana.com/tutorials/provision-dashboards-and-data-sources/) for details.

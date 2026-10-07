# Reviewer testing guide

The public review API is `https://geoservice2.ist.supsi.ch/test/v1.1`. Use **Anonymous** authentication; no API credentials are required. Examples below were checked on Grafana 11.5.3 on 2026-10-07. Names, observation values, and total counts can change as the public dataset changes.

## Start the test environment

Check out the source tag corresponding to the submitted archive. From `supsi-istsos4/`, run:

```bash
docker compose up --build
```

Open **http://localhost:3010**, sign in with `admin` / `admin` on a fresh instance, and open the **istSOS4** dashboard folder. Two dashboards are provisioned:

- **istSOS4 review dashboard**: eight panels covering observations, grouped conditions, expansions, maps, custom queries, and pagination.
- **istSOS4 review — chained variables**: Thing and Datastream query variables, a dependent observation query, and selected-datastream metadata.

To test the exact submitted ZIP instead of rebuilding the source, extract the archive and set `REVIEW_PLUGIN_DIR` to the absolute path of its `supsi-istsos4-datasource` directory:

```bash
REVIEW_PLUGIN_DIR=/absolute/path/supsi-istsos4-datasource \
  docker compose -p istsos4-review-archive -f docker-compose.review.yaml up -d
```

Open **http://localhost:3011** for this environment. It mounts the extracted plugin and the same provisioning without rebuilding the plugin. Allowing the named unsigned plugin supports an initial submission; signed archives are also usable. To test the advertised minimum Grafana version, prefix the command with `GRAFANA_VERSION=10.4.0`. Minimum-version testing is still required; the checks recorded here used 11.5.3.

## Checks and expected results

### 1. Connection and basic entity queries

Open **Connections → Data sources → istSOS4** and select **Save & test**. Expect `Successfully connected to SensorThings API`.

In Explore, select istSOS4, choose **Things**, disable the time range, set `$top=2`, and set **Follow nextLink → No**. Expect two rows with IDs and names. At verification these were `1 / LUMI` and `2 / COL`. Repeat with **Sensors** or **Observed Properties** to verify another entity table.

### 2. Observation time range and navigation

Open **Datastream 1 — observations in selected range**. Expect a numeric time series for datastream `1` (`BT_LUMI`). Edit the panel and inspect **Query Preview**: it starts with `/Datastreams(1)/Observations` and includes the selected phenomenon-time range. The query is capped at one page of 1,000 observations.

Change the dashboard range to **Last 1 hour**. Inspect the table view or query response: every returned timestamp must fall within that hour. Change to a historical range outside the API's data: an empty result is expected.

The parent navigation path is stored in dashboard JSON; the current editor has no parent-entity control. The editor also offers **Add condition → Datastream → ID** for related-ID filtering. On this public dataset, the navigation-path query is the verified baseline; the related-ID variant is listed as a regression check below.

### 3. Latest observations and limits

Open **Datastream 1 — latest observations**. Expect at most 100 rows fetched in descending phenomenon-time order. Changing the dashboard time range must not change the range requested by this query: its Grafana time-range option is disabled. If the graph is empty, use timestamps from this table to find a populated range.

### 4. Nested All/Any filter groups

Open **Grouped filters — ID 1 or 2, Celsius**. Its conditions represent:

```text
(ID = 1 OR ID = 2) AND Unit Symbol = °C
```

Expect only datastream `2 / IT_LUMI`, whose unit is Celsius. In the editor, inspect the outer **All conditions (AND)** group and nested **Any condition (OR)** group. Change the nested group to **All conditions (AND)**: expect no rows, because one datastream cannot have both IDs. Restore **Any**: expect IT_LUMI again.

### 5. Expanded Observations

Open **Expanded observations — IT_LUMI**. Expect at most ten numeric Celsius observations, named IT_LUMI, obtained through the Datastream's Observations expansion. Inspect the expanded result options: phenomenon-time range enabled, descending phenomenon-time order, `$top=10`, **Follow nextLink → No**.

Change to **Last 1 hour**. Expanded observations must fall within that range. Root Datastream time-range filtering remains disabled; the time range applies to the expanded Observations.

Adding a grouped result condition inside this expansion is a separate regression check described below; it is not enabled in the default panel.

### 6. Pagination

Open **Things — pagination baseline**. With `$top=2` and **Follow nextLink → No**, expect exactly two Things. Enable **Follow nextLink → Yes** and refresh: expect more than two Things as remaining pages are fetched. At verification the result contained 32 Things. Restore **No** after the check.

This demonstrates that `$top` is the page size when next links are followed, rather than a total-row limit.

### 7. Coordinates and Geomap

Compare **Locations — coordinates** with **Locations — Geomap**. Expect up to 20 rows with numeric `latitude` and `longitude`, and corresponding markers in Ticino and the surrounding area. `Lumino` was approximately latitude `46.24368`, longitude `9.05525` at verification. These degree values are derived from the API's Swiss-coordinate Point geometry.

Edit the Geomap layer and confirm **Location mode → Coords**, latitude field `latitude`, longitude field `longitude`. The built-in Geomap panel needs no additional panel plugin. If map tiles cannot load, inspect the coordinate table to distinguish a basemap/network problem from a query error.

For Features of Interest, duplicate the coordinate table and select **Features of Interest**. Expect `feature_id`, `feature_name`, `geojson`, `latitude`, and `longitude`. Ispra and Lumino were present at verification. Geomap markers represent geometry locations; they do not test rendering polygon outlines.

See [Grafana Geomap documentation](https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/visualizations/geomap/) for coordinate layer configuration.

### 8. Custom OData query

Open **Custom query — latest positive observations**. Its custom fragment is:

```text
$top=10&$orderby=phenomenonTime desc&$filter=result gt 0
```

Expect at most ten numeric observations from datastream 1, all with result greater than zero. The editor should indicate custom query mode and disable structured filter editing. Clear the custom fragment to restore structured filtering. Resource paths belong in the query model; the custom field is for query options.

### 9. Chained dashboard variables

Open **istSOS4 review — chained variables**. **Thing** defaults to LUMI and **Datastream** to BT_LUMI. Expect a populated metadata table and observations for the selected datastream.

Change **Thing** to COL. The **Datastream** choices must update to datastreams belonging to COL, excluding BT_LUMI. At verification the choices were `Praw_COL / 8` and `P_COL / 9`. Select **Praw_COL**: the metadata table must show ID `8`, and the observation query must use datastream ID `8`. Switch back to LUMI and choose IT_LUMI to verify another variable selection.

The second variable contains a **Thing → ID** condition with value `$thing`. The observation panel uses `navigationPath: [{"entity":"Datastreams","entityId":"$datastream"}]`, and the metadata panel uses `entityId: "$datastream"`. Both variables are single-value selections. This checks label-to-ID mapping, dependent-variable refresh, filter substitution in the variable query, and ID substitution in navigation and metadata queries. If a selected datastream has only historical observations, use its metadata time interval to choose a populated range. Praw_COL returned no observations in the last 24 hours during verification; switching back to BT_LUMI or IT_LUMI returned 144 observations for that range.

See [Grafana chained variable documentation](https://grafana.com/docs/grafana/latest/visualizations/dashboards/variables/advanced-variables/) for the dependency behavior.

### 10. Grafana alert preview

Start from **Datastream 1 — observations in selected range** and use its panel menu to create an alert rule, preserving the existing navigation-path query. Use Advanced options if needed:

1. Query **A**: istSOS4, **Observations**, navigation path `/Datastreams(1)/Observations`, phenomenon-time range enabled, relative range **Last 1 hour**, `$top=100`, **Follow nextLink → No**. The `alert-observations` model in reviewer-queries.json contains this query. Use fixed values, without dashboard variables.
2. Expression **B**: **Reduce**, input **A**, function **Last**.
3. Expression **C**: **Threshold**, input **B**, **Is above 0**; make C the alert condition.
4. Select **Preview**. Expect successful query and expression evaluation. At verification B was a positive voltage reading, so C evaluated to `1` / true.
5. Change the threshold to `1000000` and preview again. Expect C to evaluate to `0` / false for the observed test data.

These thresholds test the execution path; they are not monitoring recommendations. Preview is sufficient for this check. No saved rule or notification destination is required.

Both outcomes were checked through Grafana's server-side alert evaluation endpoint, independently of dashboard variable substitution. See [Grafana alert rule documentation](https://grafana.com/docs/grafana/latest/alerting/alerting-rules/create-grafana-managed-rule/).

### 11. Invalid configuration and empty results

Create a separate temporary istSOS4 data source, leave **API URL** empty, and select **Save & test**. Expect an error such as `API URL is missing`. Keep the provisioned review data source intact.

For an empty-query result, duplicate the grouped-filter panel and use the impossible AND combination from check 4. Expect an empty table without a JavaScript exception.

## Known regression checks and coverage limits

The following outcomes were observed on the public API on 2026-10-07. They need investigation before these features can be described as fully validated against this service:

- **Grouped filter inside an expansion**: `expanded-filter-regression` in [reviewer-queries.json](reviewer-queries.json) adds `Result > -273` to the expanded-temperature query. The public API returned HTTP 500 for the nested grouped `$filter`. The equivalent expansion without that grouped condition passed. A collection-query variant returned an API parser error. Keep the default expanded-observation panel unchanged for the working baseline.
- **Spatial filtering**: `spatial-locations` applies Within to a WGS84 polygon covering Switzerland, with corners `[5.5,45.5]` and `[10.5,48.5]`. It returned no locations despite known Lumino coordinates inside that extent. Map display and coordinate conversion passed separately; this result does not establish spatial-filter correctness. The API's source geometries use EPSG:2056. Determine the cause before expecting this condition to return rows.
- **Related-ID observation filtering**: the `related-observation-filter-regression` model queries the Observations collection with a Datastream ID condition over the last 24 hours. This query did not complete successfully during verification, while the corresponding navigation-path query passed. Use the navigation-path panels for the working baseline and investigate this variant separately.
- **OAuth2**: the public API is anonymous, so these examples do not test password grant, token refresh, or invalid protected-API credentials. These require a protected endpoint and separately supplied reviewer credentials.
- **Compatibility**: browser checks used Grafana 11.5.3. Repeat the baseline checks on the advertised minimum 10.4.0 and the version used by the reviewer.

[reviewer-queries.json](reviewer-queries.json) contains standalone plugin query models for reproducing these examples, including variable queries with fixed Thing IDs. Variable models in that file use `queryType: "variable"` for direct backend execution; dashboard variable substitution is additionally exercised by the second dashboard.

## Suggested submission testing guidance

> Anonymous test API: https://geoservice2.ist.supsi.ch/test/v1.1. The repository includes provisioned data-source configuration and two reviewer dashboards. From supsi-istsos4/, run docker compose up --build and open localhost:3010 (fresh login admin/admin). For the exact submitted archive, extract the ZIP and use docker-compose.review.yaml with REVIEW_PLUGIN_DIR pointing to the plugin directory; open localhost:3011. Follow provisioning/REVIEWER_GUIDE.md for connection checks, observation time ranges, nested All/Any filters, expansions, pagination, Geomap, custom queries, chained variables, alert preview, and error handling. The guide records known public-API expansion-filter, spatial-filter, and related-observation-filter limitations. OAuth2 requires a separate protected test endpoint.

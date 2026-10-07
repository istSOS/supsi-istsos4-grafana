# Changelog

## 1.1.1 (2026-10-07)

### Changed

- Upgrade the Grafana Go SDK to 0.297.0 and use Go 1.26.8 for backend builds.
- Refresh compatible npm dependencies and security overrides, including websocket-driver, brace-expansion, fast-uri, and js-yaml fixes.
- Use Grafana's debug logging level without reading process environment variables in the query handler.
- Check source, lockfile, built-plugin, and release-tag versions before packaging; run dependency audits and backend tests in the release workflow.

### Known limitations

- The transitive development dependency `braces` 3.0.3 remains affected by CVE-2026-93687; no patched upstream release is available. The frontend dependency audit blocks release until this is resolved or Grafana provides an accepted review procedure.

## 1.1.0 (2026-10-07)

### Added

- Add latitude and longitude fields for Grafana Geomap, including Swiss-coordinate conversion.
- Include observed-property metadata in expanded entity/datastream frames.
- Provide two reviewer dashboards, concrete testing guidance, and a Docker setup for testing release archives.

### Changed

- Replace filter-type forms with compact field-first conditions, All/Any matching, nested groups, and readable summaries.
- Preserve grouped logic in query previews and backend requests, including expanded observation filters and Grafana time ranges.
- Route dashboard, Explore, variable, and alert queries through the backend `QueryData` handler.
- Move SensorThings authentication, pagination, expanded Observation pagination, and Grafana frame transformation to the backend.
- Remove the frontend data proxy and plugin proxy routes.
- Make Save & Test verify connectivity to the configured SensorThings API.
- Support backend navigation-path queries such as `/Datastreams(16)/Observations` for dashboards and alerts.

### Known limitations

- The public test API returns an error for grouped result filters inside expanded Observations.
- Spatial filtering and related-ID filtering of the large Observations collection need further investigation against the public API; see the reviewer guide for reproducible queries and working navigation-path examples.
- Reviewer examples use anonymous authentication; OAuth2 requires a separate protected test endpoint.

## 1.0.0 (2026-05-21)

### Features

- Initial public release of the istSOS4 Grafana data source.
- Add SensorThings API entity querying, OData query building, filters, variables, pagination, and OAuth2 configuration.

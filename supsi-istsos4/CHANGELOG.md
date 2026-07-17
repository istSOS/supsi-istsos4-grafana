# Changelog

## Unreleased

### Changed

- Route dashboard, Explore, variable, and alert queries through the backend `QueryData` handler.
- Move SensorThings authentication, pagination, expanded Observation pagination, and Grafana frame transformation to the backend.
- Remove the frontend data proxy and plugin proxy routes.
- Make Save & Test verify connectivity to the configured SensorThings API.
- Support backend navigation-path queries such as `/Datastreams(16)/Observations` for dashboards and alerts.

## 1.0.0 (2026-05-21)

### Features

- Initial public release of the istSOS4 Grafana data source.
- Add SensorThings API entity querying, OData query building, filters, variables, pagination, and OAuth2 configuration.

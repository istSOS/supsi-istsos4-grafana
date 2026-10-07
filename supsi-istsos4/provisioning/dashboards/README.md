# Review Dashboard Provisioning

The supplied examples are `json/istsos4-review-dashboard.json` and `json/istsos4-review-variables.json`. See the [reviewer testing guide](../REVIEWER_GUIDE.md) for setup, expected results, and API availability.

Place additional exported dashboard JSON files in `json/`.

Recommended file name:

```text
json/istsos4-review-dashboard.json
```

For provisioning, use the dashboard JSON model from Grafana or the dashboard API, not the "export for sharing externally" format with `__inputs`.

Before committing the dashboard JSON:

1. Set the top-level `id` field to `null`.
2. Keep or set a stable top-level `uid`.
3. Make datasource references use the provisioned datasource UID:

```json
"datasource": {
  "type": "supsi-istsos4-datasource",
  "uid": "PD20B5DD0C4265892"
}
```

If the dashboard contains variables, update their datasource reference the same way.

Use descriptive dashboard and panel titles. For live data, prefer a relative time range. Disable **Follow nextLink** when `$top` is intended to bound the example rather than set its page size.

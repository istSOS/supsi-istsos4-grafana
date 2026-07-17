# istSOS4 Grafana Plugin

This plugin enables Grafana integration with istSOS4 servers, providing comprehensive data visualization and dashboard capabilities for OGC SensorThings API implementations.

---

## 🚀 Features

### SensorThings API Integration
- Full support for OGC SensorThings API implementations
- Compatible with istSOS4 server instances

### Advanced Filtering
Comprehensive filter system supporting:
- **Basic filters**: Common fields like ids, name and description
- **Temporal filters**: Date ranges and temporal functions
- **Spatial filters**: Geometric queries intersect and within geometries such as (Point, Polygon, LineString)
- **Measurement filters**: Sensor-specific data filtering like Unit and Symbol Measurement
- **Observation filters**: Result, phenomenon time and result time
- **Entity filters**: Manages the relationships between the entities
- **Other SensorThings API standard features**: Expansions, Selections and top, skip values
- **Navigation paths**: Query related collections such as `/Datastreams(16)/Observations` and apply filters, ordering, limits, and Grafana time ranges to the related collection
- **Complex expressions**: Write queries as you want, but ensure they are in correct format

### Variable Support
- **Dashboard template variables**: For dynamic queries
- **Variable Chaining support**: Create fully customizable and dynamic dashboards based on chained Variables (Variables depend on other variables)

### Dynamic Panels & Dashboards
Ability to create panels and dashboards to visualize:
- **Datastream Observations**: Time-series data visualization
- **Locations and Historical Locations of Things**: Using orchestracities-map-panel that supports complex geometries visualizations

---

## 📁 Project Structure

### Source Code (`/src`)

```
src/
├── datasource.ts              # Main data source implementation
├── module.ts                  # Plugin module registration and exports
├── plugin.json                # Plugin metadata and configuration
├── types.ts                   # TypeScript type definitions
├── queryBuilder.ts            # OData query construction utilities
├── README.md                  # Plugin-specific documentation
├── components/                # React UI components
│   ├── ConfigEditor.tsx       # Data source configuration interface
│   ├── FilterPanel.tsx        # Advanced filtering UI component
│   ├── MapWithTerraDraw.tsx   # Interactive map for spatial queries
│   ├── QueryEditor.tsx        # Main query building interface
│   ├── VariableQueryEditor.tsx # Template variable configuration
│   └── VariablesPanel.tsx     # Dashboard variables management
└── utils/                     # Utility functions and helpers
    ├── constants.ts           # Application constants and enums
    └── utils.ts               # General utility functions
```

### Core Files Description

#### Main Implementation Files

- **`datasource.ts`**: Frontend data source class implementing Grafana's `DataSourceWithBackend`. It delegates dashboard, Explore, variable, and alert queries to the backend while handling frontend variable substitution.
- **`pkg/plugin/datasource.go`**: Standard backend `QueryData` execution, authentication, health checks, and pagination.
- **`pkg/frames/entities.go`**: Backend SensorThings-to-Grafana frame transformations.

- **`types.ts`**: TypeScript interfaces and type definitions for:
  - Query configurations and options
  - Data source settings and authentication
  - API response structures
  - Filter and entity type definitions

- **`queryBuilder.ts`**: OData query construction utilities:
  - Follows Builder Pattern to construct the query
  - URL parameters building
  - Filter expression generation
  - Pagination parameter handling
  - Expand clause construction
  - Other standard Option integration

#### UI Components

- **`ConfigEditor.tsx`**: Data source configuration interface allowing users to:
  - Set istSOS4 server URL and authentication
  - Configure default pagination settings

- **`QueryEditor.tsx`**: Main query building interface featuring:
  - Entity type selection (Things, Datastreams, Observations, etc.)
  - Entity ID specification for targeted queries
  - Parent entity navigation paths such as `/Datastreams(16)/Observations`
  - Expand options for related entities
  - Integration with Filters and Variables for advanced filtering
  - Other standard Options

- **`FilterPanel.tsx`**: Advanced filtering system supporting:
  - Basic field-based filters
  - Temporal filters with date ranges
  - Spatial filters with geometric queries
  - Measurement-specific filters
  - Entity Filters
  - Observation Filters

- **`MapWithTerraDraw.tsx`**: Interactive map component for:
  - Spatial query visualization
  - Drawing geometric filters (points, polygons, etc.)
  - Location-based entity selection
  - Integration with spatial filtering

- **`VariablesPanel.tsx`**: UI for Variables management

---

## 🔧 Configuration

### 1. Add Data Source

1. In Grafana, go to **Configuration → Data Sources**
2. Click **Add data source**
3. Search for and select **istSOS4**
4. Configure the connection:
   - **URL**: Your istSOS4 server URL
   - **Token URL**: Your server Token URL
   - **Refresh URL**: Optional refresh endpoint path, for example `Refresh`
   - **OAuth2 credentials**: Configure your username and password. Client ID and client secret are optional.
   - **Default Top (Pagination) Values**: Configure your preferred top values for Entities and Expanded Observations

### 2. Test Connection

Click **Save & Test** to verify the connection to your istSOS4 server.

<img width="800" height="864" alt="Screenshot from 2025-08-29 23-53-13" src="https://github.com/user-attachments/assets/f94467bf-3b64-4bfb-af43-9363e1d49dff" />

---

## 📊 Usage

### Exploring Data

After configuration, you can play with the plugin from the **Explore** section in the sidebar. Here is the interface:
<img width="1843" height="943" alt="explorer" src="https://github.com/user-attachments/assets/32285c1a-f173-4cfc-ad1b-516abc035d6c" />

To query observations belonging to one datastream, select **Observations** as the entity, **Datastreams** as the parent entity, and enter the datastream ID. The resulting resource path is `/Datastreams(<id>)/Observations`; all configured OData parameters and the Grafana alert time range apply to those observations.

### Creating Dashboards with Variables

You can create dynamic dashboards using Grafana variables for flexible data visualization.


Here is a demo showing how you can create a dashboard for **Datastream_Observations** of specific **Things**.


https://github.com/user-attachments/assets/1dca6ac3-14b3-48a4-9c5d-725894247fca



---

## 🛠️ Installation & Development Setup

* Follow the [development Guide](/supsi-istsos4/docs/development_guide.md) for plugin setup and How to contrubite to the plugin 
---
## 📊 Example Panels
<img width="1843" height="943" alt="obs" src="https://github.com/user-attachments/assets/4f3dc74c-2cd4-409c-98e7-ab97a7f96905" />
<img width="1843" height="539" alt="Gauge" src="https://github.com/user-attachments/assets/1601c25b-bd53-4e68-b475-f3a7c027553a" />

---

## 🏗️ Built With

- [Grafana Plugin SDK](https://grafana.com/developers/plugin-tools/)
- [React](https://reactjs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [OGC SensorThings API](https://www.ogc.org/standards/sensorthings)

---

## 📄 License

This project is licensed under the Apache-2.0 License.

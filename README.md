# OS Power BI Map Visual
The OS Power BI Map Visual is a custom visual designed to easily display geospatial data on an OS backdrop map in Power BI dashboards. Quickly create insightful maps with a combination of points, lines, polygons or common geographic boundaries provided by the Office for National Statistics. 

To get started, download the visual .pbiviz file from [Releases](https://github.com/OrdnanceSurvey/os-powerbi-map/releases) and click 'Import a visual from file' in your Power BI software. Visit our [documentation](https://docs.os.uk/more-than-maps/advanced-applications/os-ngd-data-in-dashboards/os-power-bi-map-visual) for full instructions on how to use the visual.

## Features

- Easily create choropleth (fill) or point maps on an OS basemap in Power BI
- Combine points and polygons on the same map to enable greater insights
- Provides easy access to hundreds of commonly used Office for National Statistics (ONS) boundaries such as Lower Super Output Areas (LSOAs) / Middle Layer Super Output Areas (MSOAs) and wards without needing to import your own separate geometry files
- Drag-and-drop geocoding for longitude / latitude, postcodes, Unique Property Reference Numbers (UPRNs) and Eastings / Northings
- Use custom geometries within your map (GeoJSON or WKT) or directly upload shapefiles, geojson or topojson files
- Enable two-way interaction between the map and other visuals (graphs, charts, tables, etc.) within your report
- Highly customisable map formatting and styling options
- Built with security in mind for data protection


## Contributing

We welcome contributions from the community via issues and pull requests. The repo is maintained by a team of 2 developers alongside our normal work but we will try our best to support in a timely manner.

### Developing locally

- To develop this custom visual you will need to have Node.js installed and enable Developer mode in Power BI. You can learn more about how to set up your environment [here](https://learn.microsoft.com/en-us/power-bi/developer/visuals/environment-setup).
- To get the dev version of the visual up and running, run:
    - `npm install`
    - `pbiviz start`
- If the visual doesn't show up, go to localhost (e.g. https://localhost:8080/) -> if it's 'unsafe' click through to continue anyway -> then go to /assets. If you now refresh the visual, it should be visible in Power BI.
- To create a build, run:
    - `pbiviz package`

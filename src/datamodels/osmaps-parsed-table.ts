import { OSMapsDataviewRow } from "../types/data-types";

/**
 * Intermediate viewmodel representing the parsed Power BI data view.
 * This is the first-level output of the visual transform function.
 */
export class OSMapsParsedTable {
  /**
   * This is a simple intermediate viewmodel which is the first level output of
   * the visualtransform function, i.e. the PowerBI data view will be transformed
   * into one of these initially before more structured objects are then created
   * from these data and the settings, according to what is required
   */
  preLocatedPointRows: OSMapsDataviewRow[] = [];
  pointGeocodeRows: OSMapsDataviewRow[] = [];
  featureGeometryRows: OSMapsDataviewRow[] = [];
  gssRows: OSMapsDataviewRow[] = [];
  geojsonRefRows: OSMapsDataviewRow[] = [];
  
  /** Accessors to report the fieldname that was added to the powerbi field well, for each role
   * (Only some have been added so far: todo, complete the rest). These are used to dynamically 
   * update tooltips on the settings cards to help the user identify which field they have used.
   */
  get featureGeomFieldname(): string | undefined {
    if (this.featureGeometryRows.length > 0) {
      const firstRow = this.featureGeometryRows[0];
      return firstRow.feature_geometry?.fieldname;
    }
    return undefined;
  }
  get gssFieldname(): string | undefined {
    if (this.gssRows.length > 0) {
      const firstRow = this.gssRows[0];
      return firstRow.gss_code?.fieldname;
    }
    return undefined;
  }
  get geojsonRefFieldname(): string | undefined {
    if (this.geojsonRefRows.length > 0) {
      const firstRow = this.geojsonRefRows[0];
      return firstRow.geojson_reference?.fieldname;
    }
    return undefined;
  }
}

/**
 * Represents a single row of data from the Power BI data view, with all possible fields.
 */
export interface OSMapsDataviewRow {
  /**
   * Easting coordinate (British National Grid).
   */
  easting?: NumericFieldValue;
  /**
   * Northing coordinate (British National Grid).
   */
  northing?: NumericFieldValue;
  geojson_reference?: any;
  gss_code?: any;
  point_geocodes?: StringFieldValue;
  /**
   * Colour value for the point (string or integer).
   */
  point_colour?: StringFieldValue | NumericFieldValue;
  /**
   * Size value for the point.
   */
  point_size?: NumericFieldValue;
  /**
   * Popup text fields for the point.
   */
  point_popup_text?: StringFieldValue[];
  /**
   * Geometry value for the feature (e.g., WKT or GeoJSON).
   */
  feature_geometry?: StringFieldValue;
  /**
   * Popup text fields for the polygon/feature.
   */
  polygon_popup_text?: StringFieldValue[];
  /**
   * Colour value for the polygon/feature.
   */
  polygon_colour?: StringFieldValue;
  /**
   * Power BI selection handle for this row.
   */
  selectionHandle?: any;
}

/**
 * Represents a string field value and the name of the field it came from, for display in popups + legends.
 */
export type StringFieldValue = {
  /** The name of the field. */
  fieldname: string;
  /** The string value of the field. */
  fieldvalue: string;
  formatstring?: string; /**< Optional format string to apply to the value for display */
};

/**
 * Represents a numeric field value and the name of the field it came from, for display in popups + legends.
 */
export type NumericFieldValue = {
  /** The name of the field. */
  fieldname: string;
  /** The numeric value of the field. */
  fieldvalue: number;
  formatstring?: string; /**< Optional format string to apply to the value for display */
};

/**
 * Dictionary mapping strings to strings.
 */
export interface StringToStringDict{
  [key:string]:string
}

/**
 * Dictionary mapping strings to arrays of strings.
 */
export interface StringToStringsDict{
  [key:string]:string[];
}
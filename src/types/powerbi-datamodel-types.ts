import { LineStyles } from "./carto-types";
import { StringFieldValue, NumericFieldValue } from "./data-types";

/**
 * Indicates the source of a location for mapping.
 */
export enum LocationSource {
  UserCoordinates,  /**< User-provided latitude/longitude coordinates */
  Postcode,         /**< UK postcode */
  UPRN,             /**< Unique Property Reference Number */
}

export enum FeatureInputTypes {
  DataModel, // WKT or GeoJSON in the powerbi data
  GSS_Geocode, // geocoding results from the GSS service
  User_Uploaded, // Geometries uploaded by the user in the formatting pane
  None
}

/**
 * Comprises the information necessary to style and display a given feature on the map,
 * will be populated based on a combination of a LayerCartoSettings and the feature's 
 * data attributes, and used by map manager when rendering data and displaying popups.
 */
export interface PBIDataDisplayProperties {
  popupEntries?: StringFieldValue[];
  //colourValue: string|number|null;
  opacityValue: number|null;
  size?: NumericFieldValue|null;
  //sizeValue?: number |null;
  colour: StringFieldValue | NumericFieldValue | null; // the field used to derive the colourValue
  //colourFieldName?: string|null;
  opacityFieldName?: string|null;
  //sizeFieldName?:string|null;
  lineThickness?: number;
  borderColourValue: string; // set from settings pane / hardcode only
  selectionColour: string;
  lineStyle?: string;
}

/** Information necessary to configure the appearance of a single non-data-driven symbol on the map */
export interface SymbolConfiguration {
  colour: string;
  opacity: number;
  lineThickness: number;
  borderColour: string;
  lineStyle: LineStyles;
  pointSize: number;
  symbolName: string;
}

/** Encapsulates overrides for legend symbols */
export interface LegendSymbolOverrides{
  legendName: string;
  showBorder?: boolean;
  patchOpacity?: number;
  numberFormatString?: string;
}

/** Describes objects that can provide unscaled symbol configurations */
export interface UnscaledSymbolProvider {
  DefaultStylingProperties: SymbolConfiguration;
}
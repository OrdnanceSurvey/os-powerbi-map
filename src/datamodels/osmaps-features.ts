import ISelectionId = powerbi.extensibility.ISelectionId;
import { Feature, Geometry, GeometryCollection, LineString, MultiLineString, MultiPoint, MultiPolygon, Point, Position } from "geojson";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import format = valueFormatter.format;
import proj4 from "proj4";
import { ColourValueTypes } from "../types/carto-types";
import { PBIDataDisplayProperties, SymbolConfiguration } from "../types/powerbi-datamodel-types";
import { colours, hexColourRegex } from "../resources";
import {createHash} from '../utils/utils';
import { cloneDeep } from "lodash";
import { ColourLinearScaler } from "../carto/colour-scaling";


/**
 * Represents a GeoJSON feature with additional symbology and Power BI selection information.
 * Implements GeoJSON.Feature, so it can be added directly to leaflet geojson layers, but 
 * contains additional properties and methods for Power BI visualisation.
 */
export class OSMapsGeoJson implements GeoJSON.Feature {
  private static hexColourTester = new RegExp(hexColourRegex);
  protected geojson_geometry: any;
  protected symbology_data: PBIDataDisplayProperties;
  private rawcolour?: string | number;
  private rawopacity?: number;
  private rawSize?: number;
  private rawInput: Geometry | Feature;
  public useSafeBorderColour: boolean = false;
  public useSafeSelectionColour: boolean = false;
  /** If true, don't allow symbology to be changed by scaling - this is applied to 
   * unmatched features from locally-uploaded data, whic will be part of the same FeatureCollection,
   * as we want them to display using their own configured static symbology rather than adopt the 
   * null-value symbology of the main data.
  */
  public lockSymbology: boolean = false; 
  public includeNativeProperties: boolean = false;
  sourceidentifier?: string | number;
  geometryIdentifier: string | number;
  featureIdentifier: string;
  nativeFeatureProps?: Record<string, unknown>;
  selectionHandle: ISelectionId;
  crs?: { type: string; properties: { name: string } } | undefined;
  isSelected: boolean = false;
  
  
  // members implementing GeoJSON.Feature
  type: any = "Feature";
  get geometry(): Geometry {
    return this.geojson_geometry;
  }
  get properties(): Record<string, unknown> {
    return this.nativeFeatureProps;
  }

  /**
   * Determines whether to include native properties (if any) from the GeoJSON feature in popups, 
   * in addition to those coming from the PowerBI data model.
   */
  get displayingNativeProperties(): boolean {
    return this.nativeFeatureProps !== undefined && this.includeNativeProperties;
  }
  get x_coord(): number {
    return this.isPoint ? (this.geometry as Point).coordinates[0] : null;
  }
  get y_coord(): number {
    return this.isPoint ? (this.geometry as Point).coordinates[1] : null;
  }
  get isPoint() {
    return this.geometry.type == "Point" || this.geometry.type == "MultiPoint";
  }
  get isLine() {
    return (
      this.geometry.type == "LineString" ||
      this.geometry.type == "MultiLineString"
    );
  }
  get isPolygon() {
    return (
      this.geometry.type == "Polygon" ||
      this.geometry.type == "MultiPolygon"
    )
  }

  get colourSource() {
    return this.symbology_data.colour?.fieldname || null;
  }
  get colourFieldFormatter() {
    return this.symbology_data.colour?.formatstring || null;
  }

  get sizeSource() {
    if (!this.isPoint) {
      return null;
    }
    return this.symbology_data.size?.fieldname || null;
  }
  get sizeFieldFormatter() {
    return this.symbology_data.size?.formatstring || null;
  }

  get colourValueType(): ColourValueTypes {
    if (typeof this.fillColour === "number") {
      return ColourValueTypes.CONTINUOUS; // todo maybe ints could be categorical
    }
    if (this.fillColour && OSMapsGeoJson.hexColourTester.test(this.fillColour.trim())) {
      return ColourValueTypes.PRESET;
    }
    if (!(this.colourSource && this.fillColour != null)) {
      return ColourValueTypes.NONE;
    }
    return this.fillColour.trim().length > 0
      ? ColourValueTypes.CATEGORICAL
      : ColourValueTypes.NONE;
  }

  // members required for leaflet styling in OSPowerBIMapManager.renderData
  get opacity(): number {
    // If fill colour is null then this means data value was null in this feature but not
    // in all features. This is a special case for symbology meaning this point should be
    // symbolised using zero opacity
    return this.fillColour !== null ? this.symbology_data.opacityValue : 0;
  }
  get fillColour(): number | string {
    return this.symbology_data.colour?.fieldvalue || null;
  }
  /** Determines the border colour for the feature, considering its type and fill colour. 
   * If it's a point, we use the fill colour for the border as well (unless null, in which 
   * case we use a dark grey). If it's a line, we use the fill colour, because a line otherwise 
   * has no fill so this is how we show the required colour on a line. If it's a polygon, 
   * we use a single border colour from the settings (which is hardcoded there as a lighter 
   * grey, but could be made configurable if needed) to ensure the borders are visible but 
   * not too visually dominant compared to the fill colour - unless the fill colour is null 
   * in which case we use the dark grey to show that the fill is null.
  */
  private get baseBorderColour(): number | string {
    let col: string | number;
    if (this.isPoint || this.isLine) {
      col =
        this.fillColour !== null
          ? this.fillColour
          : ColourLinearScaler.NullValuesColour;
    } else {
      col =
        this.fillColour !== null
          ? this.symbology_data.borderColourValue
          : ColourLinearScaler.NullValuesColour;
    }
    return col;
  }

  get selectionColour(): string {
    return this.symbology_data.selectionColour;
  }
  get selectionBorderColour(): string {
    if (this.useSafeSelectionColour && this.isPoint) {
      return colours.DARKNEUTRAL; //colours.NEUTRAL
    }
    if (this.isPoint || this.isLine) {
      return this.selectionColour;
    }
    return colours.NEUTRAL;
  }

  get borderColour(): string {
    // override the preset border colour for points if there are also polygons present
    if (this.useSafeBorderColour && this.isPoint) {
      return colours.DARKNEUTRAL; //colours.NEUTRAL
    } else {
      if (typeof this.baseBorderColour === "string") {
        return this.baseBorderColour;
      }
      return null;
    }
  }
  /** Determines the weight (thickness) of the feature's outline or line, points will have half the thickness
   * of lines/polygons
   */
  get weight(): number {
    return this.isPoint ? this.symbology_data.lineThickness/2.0 : this.symbology_data.lineThickness;
  }
  /** Increases opacity when feature is highlighted (hovered) but only up to 1 */
  get highlightOpacity(): number {
    return Math.min(this.opacity + 0.2, 1);
  }
  get size(): number {
    return this.symbology_data.size?.fieldvalue || null;
  }

  get lineStyle(): string {
    return this.symbology_data.lineStyle || "solid";
  }

  // note this syntax means that if we call if(isFeature) then typescript
  // will know whether the item is a Feature or a Geometry within the block
  private dataIsFeature(item: Feature | Geometry): item is Feature {
    return (item as Feature).geometry !== undefined;
  }


  constructor(
    geojsonObject: Geometry | Feature,
    pbi_data: PBIDataDisplayProperties,
    selectionHandle: ISelectionId,
    identifier?: number | string
  ) {
    if (this.dataIsFeature(geojsonObject)) {
      // the value is a geojson feature including its own properties
      this.geojson_geometry = geojsonObject.geometry;
      this.nativeFeatureProps = geojsonObject.properties;
      if (Object.hasOwn(geojsonObject, "crs")) {
        // a geojson feature may include a CRS (this is no longer in spec, but still it may,
        // and it is fundamental to l.proj.geojson so we rely on it!)
        this.crs = geojsonObject["crs"];
      } else if (OSMapsGeoJson.looksLikeOSGB(geojsonObject.geometry)) {
        this.crs = { type: "name", properties: { name: "EPSG:27700" } };
      } else if (!OSMapsGeoJson.looksLikeWGS84(geojsonObject.geometry)) {
        throw new Error(
          "Could not determine CRS of feature as it does not have a CRS specified and does not appear to have coordinates that are valid for lat/lon or OSGB ranges."
        );
      }
      // else leave it undefined and it will be assumed wgs84 in line with geojson spec
    } else {
      // the value is just a geojson geometry, not feature, so will not have a "crs" property
      this.geojson_geometry = geojsonObject;
      if (OSMapsGeoJson.looksLikeOSGB(geojsonObject)) {
        this.crs = { type: "name", properties: { name: "EPSG:27700" } };
      } else if (!OSMapsGeoJson.looksLikeWGS84(geojsonObject)) {
        throw new Error(
          "Could not determine CRS of standalone geometry as it does not appear to have coordinates that are valid for lat/lon or OSGB ranges."
        );
      }
      // else leave it undefined and it will be assumed wgs84 in line with geojson spec
    }
    this.rawInput = geojsonObject;
    // all property values coming from the powerbi data model or settings, as opposed
    // to from the geojson feature.properties
    this.symbology_data = pbi_data;
    this.rawcolour = pbi_data.colour?.fieldvalue ? pbi_data.colour.fieldvalue : null;
    this.rawopacity = pbi_data.opacityValue ? pbi_data.opacityValue : null;
    this.selectionHandle = selectionHandle;
    this.sourceidentifier = identifier;
    // assume that if sourceidentifier is equal, so is geometry - this would be dangerous
    // to extend but is ok when sourceidentifier comes only from geocoding fields as now
    this.geometryIdentifier =
      this.sourceidentifier ||
      createHash(this.geojson_geometry.coordinates.toString());

    if (this.symbology_data.popupEntries) {
      this.featureIdentifier =
        this.geometryIdentifier +
        createHash(JSON.stringify(this.symbology_data.popupEntries));
    }
  }

  /**
   * Checks if the geometry of this feature is equal to another.
   * @param other The other OSMapsGeoJson to compare.
   * @returns True if the geometries are equal.
   */
  geometriesEqual(other: OSMapsGeoJson): boolean {
    if (this.geometryIdentifier && other.geometryIdentifier) {
      return this.geometryIdentifier == other.geometryIdentifier;
    }
    return this.geojson_geometry == other.geojson_geometry;
  }

  /**
   * Creates a deep clone of this feature.
   * @returns A new OSMapsGeoJson instance with the same data.
   */
  clone(): OSMapsGeoJson {
    const newFeature = new OSMapsGeoJson(
      this.rawInput,
      cloneDeep(this.symbology_data),
      this.selectionHandle,
      this.sourceidentifier
    );
    newFeature.lockSymbology = this.lockSymbology;
    newFeature.includeNativeProperties = this.includeNativeProperties;
    return newFeature;
  }

  // For display on the map, provide methods to update the things which may be scaled into
  // a range for display; namely colour, size and opacity. When updating we keep a record of
  // the original "raw" value from the data as this is what we need to display in popups etc
  // so that the user can see the original value, not the scaled one.
  
  public updateSymbol(newSymbol: SymbolConfiguration): void {
    if (newSymbol.colour !== undefined) {
      this.updateColour(newSymbol.colour);
    }
    if (newSymbol.opacity !== undefined) {
      this.updateOpacity(newSymbol.opacity);
    }
    if (newSymbol.pointSize !== undefined) {
      this.updateSize(newSymbol.pointSize);
    }
    if (newSymbol.lineThickness !== undefined) {
      this.updateWeight(newSymbol.lineThickness);
    }
    if (newSymbol.lineStyle !== undefined) {
      this.updateLineStyle(newSymbol.lineStyle);
    }
    if (newSymbol.borderColour !== undefined) {
      this.updateBorderColour(newSymbol.borderColour);
    }
  }

  /**
   * Updates the feature's colour.
   * @param newColour The new colour value.
   */
  public updateColour(newColour: string): void {
    this.rawcolour =
      this.rawcolour === undefined || this.rawcolour === null
        ? this.symbology_data.colour?.fieldvalue 
        : this.rawcolour;
    if(this.symbology_data.colour) {
        this.symbology_data.colour.fieldvalue = newColour;
    }
    else {
      this.symbology_data.colour = {
        fieldname: null,
        fieldvalue: newColour,
        formatstring: null
      };
    }
  }

  /**
   * Updates the feature's opacity.
   * @param newopacity The new opacity value.
   */
  public updateOpacity(newopacity: number): void {
    this.rawopacity =
      this.rawopacity === undefined
        ? this.symbology_data.opacityValue
        : this.rawopacity;
    this.symbology_data.opacityValue = newopacity;
  }

  /**
   * Updates the feature's size (for points).
   * @param newSize The new size value.
   */
  public updateSize(newSize: number): void {
    this.rawSize =
      this.rawSize === undefined ? this.symbology_data.size?.fieldvalue : this.rawSize;
    if(this.symbology_data.size) {
      this.symbology_data.size.fieldvalue = newSize;
    }
    else {
      this.symbology_data.size = {
        fieldname: null,
        fieldvalue: newSize,
        formatstring: null
      };
    }
  }

  /**
   * Updates the feature's border/line weight.
   * @param newWeight The new weight value.
   */
  public updateWeight(newWeight: number): void {
    this.symbology_data.lineThickness = newWeight;
  }

  public updateLineStyle(newStyle: string): void {
    this.symbology_data.lineStyle = newStyle;
  }

  public updateBorderColour(newColour: string): void {
    this.symbology_data.borderColourValue = newColour;
  }

  /**
   * Updates the feature's selection colour.
   * @param newColour The new selection colour.
   */
  public updateSelectedColour(newColour: string): void {
    this.symbology_data.selectionColour = newColour;
  }

  private static getFirstGeom(
    item: Geometry
  ):
    | Point
    | MultiPoint
    | LineString
    | MultiLineString
    | GeoJSON.Polygon
    | MultiPolygon {
    function isGeomColl(item: Geometry): item is GeometryCollection {
      return Object.hasOwn(item, "geometries");
    }
    if (!isGeomColl(item)) {
      return item;
    } else {
      return OSMapsGeoJson.getFirstGeom(item.geometries[0]);
    }
  }

  protected static looksLikeWGS84(geom: Geometry): boolean {
    const firstGeom = OSMapsGeoJson.getFirstGeom(geom);
    const firstPosition: Position = firstGeom.coordinates.flat(10).slice(0, 2);
    const [xCoord, yCoord] = firstPosition;
    // hacky bit of CRS guessing, if it's in range for degrees then we assume it 
    // must be WGS84. 
    if (Math.abs(yCoord) <= 90 && Math.abs(xCoord) <= 180) {
      return true;
    }
    return false;
  }

  protected static looksLikeOSGB(geom: Geometry): boolean {
    const firstGeom = OSMapsGeoJson.getFirstGeom(geom);
    const firstPosition: Position = firstGeom.coordinates.flat(10).slice(0, 2);
    const [xCoord, yCoord] = firstPosition;
    // extremely hacky bit of CRS guessing, if it's not lat lon then we assume it
    // must be OSGB. TODO improve this! (at least fail if not in range for OSGB, e.g. if UTM)
    if (yCoord > 90 && xCoord > 180 && yCoord <= 1300000 && xCoord <= 700000) {
      return true;
    }
    return false;
  }

  /**
   * @param hideDefaultPopupFields if false then any fields used for symbology (size and / or colour) 
   * will be included in the popup content, showing the raw data value that they are based (with appropriate 
   * formatting) rather than the stretched value. If true, these fields will be hidden from the popup content 
   * and only the explicitly-added popup fields will be shown.
   * @param showIdentifier if true then the feature's identifier e.g. the value that was geocoded 
   * will be included in the popup content.
   * @returns The HTML string for the popup content.
   */
  public getPopupHTML(hideDefaultPopupFields: boolean, showIdentifier: boolean): string {
    let content = "";
    let contentItems = [];
    let seenFields = [];
    const hasSymbologyToShow = !hideDefaultPopupFields && (
      this.symbology_data.size?.fieldname
      || (this.symbology_data.colour?.fieldname &&
        this.rawcolour?.toString &&
        !this.rawcolour.toString().startsWith("#"))
    )
    const hasIdentifierToShow = this.sourceidentifier && showIdentifier;
    let hasNoAttributes =
      !this.symbology_data.popupEntries &&
      !hasSymbologyToShow &&
      !hasIdentifierToShow &&
      !this.displayingNativeProperties;

    if (
      hasSymbologyToShow ||
      this.symbology_data.popupEntries?.length ||
      this.displayingNativeProperties
    ) {
      contentItems.push(`<tbody>`);
    }
    if (hasIdentifierToShow) {
      contentItems.push(
        `<tr><td title="Identifier">Identifier:</td><td>${
          this.sourceidentifier ? this.sourceidentifier : ""
        }</td></tr>`
      );
    }

    if (this.isPoint) {
      if (hasNoAttributes) {
        contentItems.push(`<p><span class="material-symbols-rounded">
        scatter_plot
        </span>Point has no attributes</p>`);
      } else {
        contentItems.push(`<span class="material-symbols-rounded">
      scatter_plot
      </span>`);
      }
    } else if (this.isLine) {
      if (hasNoAttributes) {
        contentItems.push(`<p><span class="material-symbols-rounded">
        polyline
        </span>Line has no attributes</p>`);
      } else
        contentItems.push(`<span class="material-symbols-rounded">
      polyline
      </span>`);
    } else {
      if (hasNoAttributes) {
        contentItems.push(`<p><span class="material-symbols-rounded">
          shapes
          </span>Polygon has no attributes</p>`);
      } else {
        contentItems.push(`<span class="material-symbols-rounded">
      shapes
      </span>`);
      }
    }

    if (
      (!hideDefaultPopupFields) &&
      this.symbology_data.size?.fieldname &&
      !seenFields.includes(this.symbology_data.size.fieldname)
    ) {
      // add the size field to the popup; showing its raw value not its symbolised value
      seenFields.push(this.symbology_data.size.fieldname);
      contentItems.push(`<tr>
        <td title="${this.symbology_data.size.fieldname}">${
        this.symbology_data.size.fieldname
      }:</td>
        <td title="${
          this.rawSize !== undefined
            ? this.rawSize
            : this.symbology_data.size?.fieldvalue
        }">${
        this.rawSize !== undefined
          ? this.rawSize
          : this.symbology_data.size?.fieldvalue
      }</td>
        </tr>`);
    }
    
    if (
      (!hideDefaultPopupFields) &&
      this.symbology_data.colour?.fieldname &&
      !seenFields.includes(this.symbology_data.colour.fieldname) // Check
      // colourFieldName has not been processed yet
    ) {
      // Check if rawcolour is defined and does not start with "#" for a hash colour
      const isValidColour = this.rawcolour !== undefined && this.rawcolour !== null && !this.rawcolour.toString().startsWith("#");
      // add the colour field to the popup; showing its raw value not its symbolised value
      seenFields.push(this.symbology_data.colour.fieldname);
      const colourValue = isValidColour ? this.rawcolour : "null"; // Assign rawcolour or "null" if rawcolour is not valid
      contentItems.push(`<tr>
          <td title="${this.symbology_data.colour.fieldname}">${
        this.symbology_data.colour.fieldname
      }:</td>
          <td title="${colourValue}">${colourValue}</td>
          </tr>`);
    }

    // TODO truncate to a reasonable maximum length
    this.symbology_data.popupEntries?.forEach((sfv) => {
      if (!seenFields.includes(sfv.fieldname)) {
        seenFields.push(sfv.fieldname);
        const formattedValue = sfv.formatstring ? format(sfv.fieldvalue, sfv.formatstring) : sfv.fieldvalue;
        contentItems.push(`<tr>
        <td title="${sfv.fieldname}">${sfv.fieldname}:</td>
        <td title="${formattedValue}">${formattedValue}</td>
        </tr>`);
      }
    });
    // only use geojson properties if no powerbi fields have been provided
    if (this.displayingNativeProperties && !this.symbology_data.popupEntries?.length) {
      for (const prop in this.nativeFeatureProps) {
        if (prop != "selectionHandle" && !seenFields.includes(prop)) {
          seenFields.push(prop);
          contentItems.push(`<tr>
          <td title="${prop}">${prop}:</td>
          <td title="${this.nativeFeatureProps[prop]}">${this.nativeFeatureProps[prop]}</td>
          </tr>`);
        }
      }
    }
    if (contentItems.length > 0) {
      // in case we are showing default (symbology) fields as well as powerbi-provided fields, 
      // we may have some duplicates if the powerbi field used for symbology is also included 
      // as a popup field; remove duplicates but keep order
      contentItems = [...new Set(contentItems)]; // NB sets in ES6 have deterministic ordering
      content =
        "<table class='leaflet-popup__attributes-table'>" +
        contentItems.join("") +
        "</tbody></table>";
    }
    return content.length > 0 ? content : null;
  }
}


export class OSMapsMarkerPoint extends OSMapsGeoJson{
  /**
   * Model for a single point on a map, representing the data from powerBI data view
   * and objects/settings and providing the necessary information to create a leaflet
   * marker or circlemarker etc
   */
  private _x_coord: number;
  private _y_coord: number;
  
  constructor(
    x_coord: number,
    y_coord: number,
    pbi_data: PBIDataDisplayProperties,
    selectionHandle: ISelectionId,
    identifier?: string|number
  ) {
    const jsonGeom:Point = {
      type: "Point",
      coordinates:[x_coord, y_coord] as Position
    }
    super(jsonGeom, pbi_data, selectionHandle, identifier);
    this._x_coord = x_coord;
    this._y_coord = y_coord;
  }

  /**
   * Creates a deep clone of this marker point.
   * @returns A new OSMapsMarkerPoint instance with the same data.
   */
  clone(): OSMapsMarkerPoint {
    const newpt = new OSMapsMarkerPoint(
      this._x_coord,
      this._y_coord,
      cloneDeep(this.symbology_data),
      this.selectionHandle,
      this.sourceidentifier
    );
    newpt.lockSymbology = this.lockSymbology;
    newpt.includeNativeProperties = this.includeNativeProperties;
    return newpt;
  }

  /**
   * Gets the latitude and longitude for this point, converting from OSGB if necessary.
   * @returns The [latitude, longitude] tuple.
   */
  public getAsLatLong(): [number, number] {
    if (OSMapsGeoJson.looksLikeWGS84(this.geojson_geometry)) {
      return [this._y_coord, this._x_coord];
    }
    return proj4("EPSG:27700", "EPSG:4326", [
      this._x_coord,
      this._y_coord,
    ] as any).reverse();
  }
}


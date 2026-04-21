
import { LatLngBounds } from "leaflet";
import { Feature, Geometry } from "geojson";
import wellknown from "wellknown";

import { PolygonGeocoder } from "../utils/PolygonGeocoding";
import { PointGeocoder } from "../utils/PointGeocoding";
import { UploadedDataGeocoder } from "../utils/UploadedDataGeocoding";
import { OSMapsCartographicFeatureCollection } from "../datamodels/osmaps-feature-collection";
import { OSMapsGeoJson, OSMapsMarkerPoint } from "../datamodels/osmaps-features";
import { OSPowerBIUIManager } from "../ui/uimanager";
import { GeocodeMetrics, GeocodeTypes, GeojsonFeatureDictionary, PointDictionary, UploadResult } from "../types/geocoding-types";
import { LogRecord, LogRecordTypes } from "../logging/LoggingTypes";
import { PBIDataDisplayProperties, FeatureInputTypes} from "../types/powerbi-datamodel-types";
import { ScalableLayerCartoSettings, Layers, ParsedCardSettingsWrapper } from "../settings/PowerBISettings"
import { OSMapsParsedTable } from "../datamodels/osmaps-parsed-table";
import { colours } from "../resources";

/**
 * Builds GeoJSON feature collections (as OSMapsCartographicFeatureCollections) from parsed Power BI data.
 */
export class OSMapsGeoJSONBuilder {
  /** Point geocoder instance. */
  private pointGeocoder: PointGeocoder;
  /** Polygon geocoder instance. */
  private polygonGeocoder: PolygonGeocoder;
  private userDataGeocoder: UploadedDataGeocoder;

  private UIManager: OSPowerBIUIManager;

  /**
   * Constructs a new OSMapsGeoJSONBuilder.
   * @param UIManager The UI manager instance.
   */
  constructor(UIManager: OSPowerBIUIManager) {
    this.UIManager = UIManager;
  }

  /**
   * Initializes the polygon geocoder asynchronously. It's async because it needs to fetch the 
   * service URLs from the server first.
   */
  private async initializePolygonGeocoder() {
    this.polygonGeocoder = await PolygonGeocoder.PolygonGeocoder(this.UIManager);
  }
  /**
   * Initializes the point geocoder.
   */
  private initializePointGeocoder() {
    this.pointGeocoder = new PointGeocoder(this.UIManager);
  }
  private initializeUserDataGeocoder() {
    this.userDataGeocoder = new UploadedDataGeocoder(this.UIManager);
  }
  public populateUserDataGeocoder(uploadResult: UploadResult){
    if (!this.userDataGeocoder){
      this.initializeUserDataGeocoder();
    }
    this.userDataGeocoder.populate(uploadResult.features || []);
  }
  public reindexUserDataGeocoder(newField: string) {
    if (!this.userDataGeocoder) {
      this.initializeUserDataGeocoder();
    }
    this.userDataGeocoder.reIndexCache(newField);
  }

  /**
   * Builds a collection of point features from the parsed table and cartography settings.
   * @param viewModel The parsed table of data.
   * @param cartoSettings The layer cartography settings.
   * @param signal Abort signal for async operations.
   * @returns An object containing the feature collection, abort status, and log records.
   */
  public async buildPointSet(
    viewModel: OSMapsParsedTable,
    cartoSettings: ScalableLayerCartoSettings,
    signal: AbortSignal
  ): Promise<{featurecoll: OSMapsCartographicFeatureCollection, isAborted:boolean, logRecords:LogRecord[]}>  
    {
    // Parse points data from the intermediate viewmodel OSMapsParsedTable into a cartographically-styled 
    // FeatureCollection. By points data, we mean points added via lat/lon or easting/northing or postcode 
    // or UPRN. Anything added as geojson / wkt geometries will not be parsed and styled by this method, 
    // even if they are in fact points.

    // Logic for point styling is as follows:
    // IF:
    // - No size field: individual points have no size set, so the scaling point set will return the maxvalue from the slider
    // - Size field and point has value: point has size value set and sps will return the scaled value according to the slider
    // - Size field and point has no value: then point has no size set and then sps will return the maxvalue from the slider
    // - Size field and all points have same value: then point has size set and then sps will return maxvalue from the slider
    // IF:
    // - No colour field: then points have no colour set and then the sps will return the colour maxvalue
    const logRecords: LogRecord[] = [];
    const newPointSet = new OSMapsCartographicFeatureCollection(cartoSettings);
    // It is enforced in capabilities that max one of (postcodes, uprns, coordinates) can be set.
    const relevantInput = viewModel.pointGeocodeRows.length
      ? viewModel.pointGeocodeRows
      : viewModel.preLocatedPointRows;
    const identifiers = relevantInput.reduce(function (res: string[], d) {
      const val = d.point_geocodes?.fieldvalue || null;
      if (val) {
        res.push(val);
      }
      return res;
    }, []);
    let geocodes: PointDictionary;
    let geocodeMetrics: GeocodeMetrics;
    let isUserCoords: boolean = true;
    if (identifiers.length) {
      if (!this.pointGeocoder) {
        this.initializePointGeocoder();
      }
      const res = await this.pointGeocoder.geocode_identifiers(identifiers, signal);
      geocodes = res.geocodes || {};
      geocodeMetrics = res.metrics;
      isUserCoords = false
    }
    if (geocodeMetrics){
      logRecords.push(this.buildGeocodeLogRecord(geocodeMetrics));
    }
    let errorHappened: boolean = false;
    let nWithInputCoords = 0;
    relevantInput.forEach((d) => {
      const geocodeIdentifier = d.point_geocodes?.fieldvalue || null;
      let x: number, y: number;
      //let isUserCoords = geocodeIdentifier == null;
      if (geocodeIdentifier && geocodes && geocodes[geocodeIdentifier]) {
        [x, y] = geocodes[geocodeIdentifier];
      } else if (d.easting?.fieldvalue && d.northing?.fieldvalue) {
        x = d.easting.fieldvalue;
        y = d.northing.fieldvalue;
        nWithInputCoords ++;
      }
      const displayProps: PBIDataDisplayProperties = {
        popupEntries: d.point_popup_text || undefined,
        colour: d.point_colour || null,
        borderColourValue: colours.GREYSTONE_NEUTRAL, // but it won't be used
        size: d.point_size || null,
        opacityValue: null, // will be set to default on reading back out of the collection
        selectionColour: cartoSettings.ColourSelected
      };
      if (x && y) {
        let pt;
        try{
          if (geocodeIdentifier == null) {pt = new OSMapsMarkerPoint(x, y, displayProps, d.selectionHandle)}
          else { pt = new OSMapsMarkerPoint(x, y, displayProps, d.selectionHandle, geocodeIdentifier)}
          newPointSet.pushFeature(pt);
        }
        catch(e) {
          let msg = "Some of your features have not been mapped as we could not understand the coordinates. "
          if (e instanceof Error){
            msg += e.message;
          }
          this.UIManager.addWarning(msg, "pointConversionWarning"
            );
          errorHappened = true;
        }
      }
      else{
        if (isUserCoords){
          // otherwise it's a geocode, and they will have been warned about it at geocode time
          this.UIManager.addWarning(
            "Some of your features have not been mapped as they did not contain X and Y coordinates", "pointConversionWarning");
          }
          errorHappened = true;
      }
      if (!errorHappened) {this.UIManager.removeUnseenNotifsById("pointConversionWarning")}
    });
    if (nWithInputCoords>0){
      let logRecord = new LogRecord();
      logRecord.metric = LogRecordTypes.LONLAT_POINTS_ADDED;
      logRecord.logEntry = {
        nPoints: nWithInputCoords
      }
      logRecord.logTime = new Date();
      logRecords.push(logRecord)
    }
    return {featurecoll: newPointSet, isAborted: signal.aborted, logRecords:logRecords};
  }

  /**
   * Builds a log record for point geocoding metrics.
   * @param geocodeMetrics The geocode metrics.
   * @returns The log record.
   */
  private buildGeocodeLogRecord(geocodeMetrics: GeocodeMetrics){
    // TODO we need to do something similar to this for polygon geocodes
    let logRecord: LogRecord = new LogRecord();
    logRecord.metric = geocodeMetrics.geocodeType === GeocodeTypes.POSTCODE 
      ? LogRecordTypes.POSTCODE_GEOCODE
      : geocodeMetrics.geocodeType === GeocodeTypes.UPRN 
        ? LogRecordTypes.UPRN_GEOCODE
        : geocodeMetrics.geocodeType === GeocodeTypes.UPLOADED_DATA
          ? LogRecordTypes.UPLOADED_DATA_GEOCODE
          : geocodeMetrics.geocodeType === GeocodeTypes.UPLOADED_DATA_INVERSE
            ? LogRecordTypes.UPLOADED_DATA_UNMATCHED_DISPLAYED
            : LogRecordTypes.ONS_GEOCODE;// should never happen
    logRecord.logTime = new Date();
    logRecord.logEntry = geocodeMetrics;
    return logRecord;
  }

  /**
   * Builds a log record for GSS geocoding metrics.
   * @param allGeocodeMetrics The metrics for all geocoded features, a dictionary mapping code prefix 
   * (e.g. E01) to the GeocodeMetrics resulting from geocodes of those particular identifier values.
   * @returns The dictionary of log records.
   */
  private buildGssGeocodeLogRecord(allGeocodeMetrics: Record<string, GeocodeMetrics>){
    let logRecord: LogRecord = new LogRecord();
    // set metric type to be the geocode type
    logRecord.metric = LogRecordTypes.ONS_GEOCODE;
    logRecord.logTime = new Date();
    logRecord.logEntry = allGeocodeMetrics;
    return logRecord
  }

   /**
   * Builds a collection of polygon (feature) data from the parsed table and settings.
   * @param viewmodel The parsed table.
   * @param settings The parsed card settings wrapper.
   * @param signal Abort signal for async operations.
   * @param updateid The update identifier.
   * @returns An object containing the feature collection, abort status, and log records.
   */
  public async buildGeometriedFeatures(
    viewmodel: OSMapsParsedTable,
    settings: ParsedCardSettingsWrapper,
    signal: AbortSignal,
    updateid: string
  ): Promise<{featurecoll: OSMapsCartographicFeatureCollection, isAborted:boolean, logRecords: LogRecord[]}> {
    // Parse features data from the intermediate viewmodel OSMapsParsedTable into a cartographically-styled 
    // FeatureCollection. By features data, we mean data added by the GeoJSON, WKT, or GSS Code field wells. 
    // These are intended to be polygons, primarily,  but are not forced to be, they could be points too.
    // Styling will be according to the "polygon colour" and "polygon popup" fields / settings.
    let asyncExecutionIsAborted:boolean = false
    const cartoSettings = settings.getCartoSettings(Layers.Features);
    const unscaledSymbol = settings.unmatchedDataStylingCard.DefaultStylingProperties;
    unscaledSymbol.symbolName = settings.uploadedDataConfigCard.FileName;
    const newPolygonSet = new OSMapsCartographicFeatureCollection(cartoSettings, unscaledSymbol);
    // Assume that there can only be data in one of feature_geometry, gss, or geojson_ref. 
    // This needs to be enforced with conditions in the capabilities.json
    const featureSourceType:FeatureInputTypes = viewmodel.featureGeometryRows.length
      ? FeatureInputTypes.DataModel
      : viewmodel.gssRows.length
        ? FeatureInputTypes.GSS_Geocode
        : viewmodel.geojsonRefRows.length
          ? FeatureInputTypes.User_Uploaded
          : FeatureInputTypes.None;
    const relevantInputTable = featureSourceType === FeatureInputTypes.DataModel
      ? viewmodel.featureGeometryRows
      : featureSourceType === FeatureInputTypes.GSS_Geocode 
        ? viewmodel.gssRows
        : featureSourceType === FeatureInputTypes.User_Uploaded
          ? viewmodel.geojsonRefRows
          : [];
    const gss_codes = relevantInputTable.reduce(function (res: string[], d) {
      const val = d.gss_code?.fieldvalue || null;
      if (val) { res.push(val); }
      return res;
    }, []);
    const upload_refs = relevantInputTable.reduce(function (res: string[], d) {
      const val = d.geojson_reference?.fieldvalue || null;
      if (val) { res.push(val); }
      return res;
    }, []);
    const logRecords: LogRecord[] = [];
    let geocodes: GeojsonFeatureDictionary,
      bounds: LatLngBounds,
      allGssGeocodeMetrics: Record<string, GeocodeMetrics>;
    let hasONSGeocodes: boolean = false;
    let hasUserGeocodes: boolean = false;
    if (gss_codes.length) {
      if (!this.polygonGeocoder) {
        await this.initializePolygonGeocoder();
        // it will initialize with the cached features and the cached value of useDetailedGeom
      }
      // if this does not match what was already set, then the cache will be cleared so that the polygons 
      // will be re-retrieved from the "other" service
      this.polygonGeocoder.useDetailedGeom = settings.mapSettingsCard.useDetailedGeom;
      const res = await (this.polygonGeocoder.polygon_geocode(gss_codes, signal, updateid));
      geocodes = res.geocodes  || {};
      hasONSGeocodes = res.geocodes ? Object.keys(res.geocodes).length > 0 : false;
      bounds = res.bounds
      allGssGeocodeMetrics = res.allGeocodeMetrics;
      if (allGssGeocodeMetrics){
        logRecords.push(this.buildGssGeocodeLogRecord(allGssGeocodeMetrics));
      }
      newPolygonSet.knownBounds = bounds;
      asyncExecutionIsAborted = res.aborted;
    }
    else if(upload_refs.length && !asyncExecutionIsAborted){
      if(!this.userDataGeocoder){
        await this.initializeUserDataGeocoder();
      }
      this.UIManager.removeUnseenNotifsById("localGeocodingError");
      const res = this.userDataGeocoder.stored_geocode(upload_refs);
      geocodes = res.geocodes || {};
      hasUserGeocodes = res.geocodes ? Object.keys(geocodes).length > 0 : false;
      let localGeocodeMetrics = res.geocodeMetrics;
      if (localGeocodeMetrics){
        logRecords.push(this.buildGeocodeLogRecord(localGeocodeMetrics));
      }
    }
    let errorHappened: boolean = false;
    let nWithInputGeoms = 0;
    let nFailedTooLong = 0;
    let nFailedParse = 0;
    let geocodedIdentifiers: string[] = [];
    relevantInputTable.forEach(async (d) => {
      const identifier = d.gss_code?.fieldvalue || d.geojson_reference?.fieldvalue || null;
      const displayProps: PBIDataDisplayProperties = {
        popupEntries: d.polygon_popup_text || undefined,
        colour: d.polygon_colour || null,
        borderColourValue: colours.GREYSTONE_NEUTRAL,
        lineThickness: cartoSettings.lineThickness, 
        opacityValue: null, // will be set to default on reading back out of the collection
        selectionColour: cartoSettings.ColourSelected
      };
      const exceededMaxLengthMessage = 
        "Some of your features may not have been mapped because the maximum limit of text fields allowed in Power BI is 32,766 characters." +
          " Large or complex geometries may easily exceed this limit. " +
          "Consider simplifying your geometries or using our geocoding service for GSS codes if applicable.";
 
      let g: Geometry | Feature | null = null;
      if (identifier && geocodes[identifier]) {
        g = geocodes[identifier];
        // will be used to determine whether ONS attribution should be shown
        newPolygonSet.hasONSGeocodes = hasONSGeocodes;
        geocodedIdentifiers.push(identifier);
      }
      else if (d.feature_geometry?.fieldvalue) {
        try {
          g = wellknown.parse(d.feature_geometry.fieldvalue);
          nWithInputGeoms ++;
        }
        catch {
          g = null
        }
        if (!g) {
          try {
            g = JSON.parse(d.feature_geometry.fieldvalue)
            nWithInputGeoms ++;
          }
          catch {
            if (d.feature_geometry.fieldvalue.length > 32765) {
              this.UIManager.addWarning(exceededMaxLengthMessage)
              errorHappened = true;
              nFailedTooLong ++;
            }
            else{
              this.UIManager.addWarning(
                "Some of your features have not been mapped because the geometry field could not be parsed as either WKT or GeoJSON", "featureConversionWarning");
                errorHappened = true;
                nFailedParse ++;
            }
          }
        }
      }
      if (g) {
        const f: OSMapsGeoJson = new OSMapsGeoJson(g, displayProps, d.selectionHandle, identifier);
        f.includeNativeProperties = settings.uploadedDataConfigCard.showNativeProperties;
        newPolygonSet.pushFeature(f);
      }
    });
    if(settings.uploadedDataConfigCard.showUnmatchedLocalFeatures){
      if(!this.userDataGeocoder){
        await this.initializeUserDataGeocoder();
      }
      // add any unmatched uploaded features to the polygon set, using the reference layer styling
      // (TODO: consider fixed styling in grey at low opacity)
      const { geocodes: unmatched_geocodes, geocodeMetrics: unmatched_metrics } = this.userDataGeocoder.stored_geocode(geocodedIdentifiers, true);
      if (unmatched_metrics){
        logRecords.push(this.buildGeocodeLogRecord(unmatched_metrics));
      }
      const symbolConfig = settings.unmatchedDataStylingCard.DefaultStylingProperties;
      const displayProps: PBIDataDisplayProperties = {
        colour: { fieldname: "Unmatched data colour", fieldvalue: symbolConfig.colour, formatstring: null },
        borderColourValue: symbolConfig.borderColour,
        lineThickness: symbolConfig.lineThickness,
        opacityValue: symbolConfig.opacity,
        selectionColour: cartoSettings.ColourSelected,
        lineStyle: symbolConfig.lineStyle,
        size: {fieldname: "Unmatched data point size", fieldvalue: symbolConfig.pointSize || null },
      };
      let nUnmatchedDisplayed = 0;
      if (unmatched_geocodes){
        nUnmatchedDisplayed = Object.keys(unmatched_geocodes).length;
      }
      Object.keys(unmatched_geocodes).forEach((identifier) => {
        const g = unmatched_geocodes[identifier];
        const f: OSMapsGeoJson = new OSMapsGeoJson(g, displayProps, null, identifier);
        f.lockSymbology = true; // so that it is not changed by scaling or taken into account by scalers for other features
        f.includeNativeProperties = settings.uploadedDataConfigCard.showNativeProperties;
        newPolygonSet.pushFeature(f);
      });
      let logRecord = new LogRecord();
      logRecord.metric = LogRecordTypes.UPLOADED_DATA_UNMATCHED_DISPLAYED;
      logRecord.logEntry = {
        nUnmatchedDisplayed: nUnmatchedDisplayed,
        nPresentInUpload: Object.keys(this.userDataGeocoder.cache).length,
        nativePropsShown: settings.uploadedDataConfigCard.showNativeProperties
      }
      logRecord.logTime = new Date();
      logRecords.push(logRecord)
    }
    if (!errorHappened) {this.UIManager.removeUnseenNotifsById("featureConversionWarning")}
    if (nWithInputGeoms + nFailedParse + nFailedTooLong){
      let logRecord = new LogRecord();
      logRecord.metric = LogRecordTypes.USER_GEOM_ADDED;
      logRecord.logEntry = {
        nParsed: nWithInputGeoms,
        nFailedToParseTooLong: nFailedTooLong,
        nFailedToParseOther: nFailedParse
      }
      logRecord.logTime = new Date();
      logRecords.push(logRecord)
    }
    return {featurecoll: newPolygonSet, isAborted:asyncExecutionIsAborted, logRecords:logRecords};
  }

}
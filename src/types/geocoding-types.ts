import {Feature, FeatureCollection} from "geojson";
import { LatLngBounds } from "leaflet";
import { StringToStringsDict } from "./data-types"; 

/**
 * Enum representing the supported geocode identifier types.
 */
export enum GeocodeTypes {
    POSTCODE,  /**< UK postcode */
    UPRN,      /**< Unique Property Reference Number */
    GSS,       /**< Government Statistical Service code */
    UPLOADED_DATA, /** Sourcing geometries from uploaded data is implemented as a geocode */
    UPLOADED_DATA_INVERSE, /** Displaying unmatched geometries from uploaded data is implemented as a geocode with no inputs*/
    INVALID    /**< Invalid or unrecognized identifier */
}

/**
 * Results of parsing a set of identifiers for geocoding.
 */
export interface IdentifierParseResults {
    /** Hash of the input identifiers for caching. */
    inputHash: string;
    /** Identifiers that need to be fetched from the geocoding service. */
    toFetch: any[];
    /** Identifiers that were found to be invalid based on regex matching. */
    invalid: any[];
    /** Number of unique identifiers. */
    nUnique: number;
    /** Total number of identifiers. */
    nTotal: number;
    /** Number of non-null identifiers. */
    nNonNull: number;
    /** Number of identifiers found in cache. */
    nCached: number;
    /** The type of geocode identifier. */
    type: GeocodeTypes;
    /** Mapping from cleaned identifier to original(s). */
    map: StringToStringsDict;
    /** Array of cleaned input identifiers. */
    cleanedInputs: any[];
}

/**
 * Metrics describing the results of a geocoding operation.
 */
export interface GeocodeMetrics {
    /** Total number of identifiers processed. */
    nTotal: number;
    /** Number of unique identifiers. */
    nUnique: number;
    /** Number of non-null identifiers. */
    nNonNull: number;
    /** Number of identifiers found in cache. */
    nCached: number;
    /** Number of invalid identifiers. */
    nInvalid: number;
    /** Number of identifiers to fetch from the service. */
    nToFetch: number;
    /** Number of identifiers successfully fetched. */
    nFetched: number;
    /** Time taken for the operation, in milliseconds. */
    elapsed: number;
    /** The type of geocode identifier. */
    geocodeType: GeocodeTypes;
}

/**
 * Parameters for a geocoding request.
 */
export interface GeocodeParams {
    /** The URL of the geocoding service. */
    URL: string;
    /** The name of the code field in the service. */
    codefield: string;
    /** The entity/geography type being queried. */
    entity: string;
    /** The codes to be geocoded. */
    codes: string[];
    /** Optional hash of the codes for caching. */
    codesHash?: string;
    /** Optional known bounds for the codes. */
    knownBounds?: LatLngBounds;
    /** Optional known count of features. */
    knownCount?: number;
}

/**
 * Dictionary which maps keys (e.g. postcode, UPRN) to point locations in the form [number, number].
 */
export interface PointDictionary {
    [key: string]: [number, number];
}

/**
 * Dictionary which maps keys (e.g. postcode, UPRN, or GSS code) to GeoJSON Features.
 */
export interface GeojsonFeatureDictionary {
    [key: string | number]: Feature;
}

/**
 * Dictionary which maps keys to Leaflet LatLngBounds objects.
 */
export interface BoundsDictionary {
    [key: string]: LatLngBounds;
}

/**
 * Object representing the result of an Esri Query for features, including the geocoded features,
 * their bounds, and optional metrics.
 */
export interface BoundedFeatureGeocodingResult {
    /** Dictionary of geocoded features. */
    geocodes: GeojsonFeatureDictionary;
    /** Bounds encompassing all returned features. */
    bounds: LatLngBounds;
    /** True if the operation was aborted. */
    aborted: boolean;
    /** Optional metrics for all geocoded features. */
    allGeocodeMetrics?: Record<string, GeocodeMetrics>;
}

/**
 * Object representing the result of an Esri Query for points, including the geocoded features and their bounds.
 */
export interface BoundedPointGeocodingResult {
    /** Dictionary of geocoded features. */
    geocodes: GeojsonFeatureDictionary;
    /** Bounds encompassing all returned features. */
    bounds: LatLngBounds;
    /** True if the operation was aborted. */
    aborted: boolean;
}

export interface LocalUploadGeocodingResult {
    geocodes: GeojsonFeatureDictionary;
    geocodeMetrics: GeocodeMetrics;
}

/**
 * Object describing the expected count and extent of features to be returned by a query.
 */
export interface EsriQueryCheckResult {
    /** Prefix for the GSS code or entity. */
    prefix: string;
    /** Number of features expected. */
    n_features: number;
    /** Bounds encompassing the features. */
    bounds: L.LatLngBounds;
    /** Optional message about the query result. */
    message?: string;
}

export interface FileTypeResult  {
    type: 'topojson' | 'geojson' | 'shapefile' | 'unknown';
    warnings?: string[];
    missingComponents?: string[];
};


export interface UploadResult {
  success: boolean;
  colNames?: string[];
  uniqueColNames?: string[];
  fileName?: string;
  fileSizeMb?: string;
  numFeatures?: number;
  errorMessages?: string[];
  features? : Feature[];
  sourceType: FileTypeResult["type"]//'topojson' | 'geojson' | 'shapefile' | 'unknown';
};

export interface GeojsonNamedCrs {
    type: "name";
    properties: {  
        name: string;
    };
}

/**(Re-)adds a crs property to a GeoJSON Feature, this used to be in the spec but has been removed but 
 * L.Proj.GeoJSON and we rely on it
 */
export interface FeatureWithCrs extends Feature{
    crs?: GeojsonNamedCrs
}

/**(Re-)adds a crs property to a GeoJSON FeatureCollection, this used to be in the spec but has been removed but 
 * L.Proj.GeoJSON and we rely on it
 */
export interface FeatureCollectionWithCrs extends FeatureCollection{
    crs?: GeojsonNamedCrs
}

export enum CRSUnits{
    METERS = 'meters', 
    DEGREES = 'degrees',
    UNKNOWN = 'unknown'
}

/**
 * Details about a GSS (Government Statistical Service) geography service from the ONS geo services on AGOL.
 */
export interface GSSServiceDetails {
  /** Prefix for the GSS code. */
  Prefix: string;
  /** Status of the service (optional). */
  Status?: string;
  /** Name of the entity/geography. */
  Entity: string;
  /** Source of the data (optional). */
  Source?: string;
  /** URL for the boundary feature endpoint. */
  URL_BFE: string;
  /** URL for the boundary generalised clipped endpoint. */
  URL_BGC: string;
  /** General URL for the service (optional). */
  URL?: string;
  /** Number of features in the service (optional). */
  N_Features?: number;
  /** Name of the code field (optional). */
  "Code Field"?: string;
  /** Example value for the code field (optional). */
  "Example Value"?: string;
  /** Country for the geography. */
  Country: string;
}

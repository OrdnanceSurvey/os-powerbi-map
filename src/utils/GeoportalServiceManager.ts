import * as esri from "esri-leaflet";
import { FeatureCollection } from "geojson";
import { LatLngBounds } from "leaflet";
import { GSSServiceDetails } from "../types/geocoding-types";
import {EsriQueryCheckResult, GeocodeParams} from "../types/geocoding-types"
import { fetchGSSServices } from "./getGSSInfo";
import { createHash } from "./utils";

/**
 * Manages access to GSS (Government Statistical Service) ArcGIS online services via the Esri Leaflet API.
 * Handles service lookup, query construction, and feature retrieval for geospatial data.
 */
export class GeoportalServiceManager{

    /** Lookup table mapping GSS code prefixes to service details. */
    private service_urls_lookup: { [key: string]: GSSServiceDetails };
    /** Maximum number of features to retrieve per query page. */
    private max_feature_count = 2000;

    /**
     * Constructs a GeoportalServiceManager instance. Private constructor to enforce use of the asynchronous 
     * static factory method.
     * @param serviceUrls Array of GSSServiceDetails for available services.
     * @private
     */
    private constructor(serviceUrls) {
      this.service_urls_lookup = Object.assign(
        {},
        ...serviceUrls.map((x) => ({ [x.Prefix]: x }))
      );
    }

    /**
     * Asynchronously creates a GeoportalServiceManager with loaded GSS service details.
     * @returns A promise resolving to a GeoportalServiceManager instance.
     */
    static async GeoportalServiceManager() {
      const service_urls = await fetchGSSServices();
      console.log("Service URLs loaded:", service_urls);
      return new GeoportalServiceManager(service_urls);
    }

    /**
     * Parses a list of GSS codes into geocoding parameters grouped by service prefix.
     * @param gssCodes Array of GSS codes.
     * @param detailedGeom If true, use detailed geometry endpoints; otherwise, use generalised.
     * @returns A promise resolving to a dictionary of GeocodeParams by prefix.
     */
    public async parseServiceDetails(gssCodes: string[], detailedGeom: boolean = true): Promise<{ [key: string]: GeocodeParams }> {
        const parsed: { [key: string]: GeocodeParams } = {};
        gssCodes.forEach((c) => {
          const prefix = c.substring(0, 3);
          Object.hasOwn(parsed, prefix)
            ? parsed[prefix].codes.push(c)
            : this.service_urls_lookup[prefix]
            ? (parsed[prefix] = {
                URL: detailedGeom ? 
                  this.service_urls_lookup[prefix].URL_BFE||this.service_urls_lookup[prefix].URL : 
                  this.service_urls_lookup[prefix].URL_BGC||this.service_urls_lookup[prefix].URL, 
                codefield: this.service_urls_lookup[prefix]["Code Field"],
                codes: [c],
                entity: this.service_urls_lookup[prefix].Entity,
              })
            : {};
        });
        Object.keys(parsed).forEach(prefix => {
          parsed[prefix].codesHash = createHash(parsed[prefix].codes)
        })
        return parsed;
    }
    
    /**
     * Builds an Esri query for retrieving features by code.
     * @param params Geocode parameters for the query.
     * @returns An Esri query object.
     */
    public buildGeometryQuery(params: GeocodeParams): esri.Query {
      // arcgis online services (i.e. ONS) will have query standardization
      // turned on (https://doc.arcgis.com/en/arcgis-online/reference/sql-agol.htm);
      // If we were to host our own on AG Enterprise we would ensure it is turned on.
      // This guards the querying against sql injection
      const in_clause =
        `${params.codefield} IN (` +
        params.codes.map((i) => `'${i}'`).join(",") +
        ")";
      const query = esri.query({
        url: params.URL,
      });
      query.where(in_clause);
      query.precision(6);
      query.fields(params.codefield);
      return query;
    }

    /**
     * Builds an Esri query for retrieving table data.
     * @throws Always throws "Method not implemented."
     */
    public buildTableQuery(): esri.Query {
      // WiP
      throw new Error("Method not implemented.");
    }

    /**
     * Gets the count and bounds of features for a given query and service prefix.
     * @param prefix The GSS code prefix.
     * @param query The Esri query object.
     * @param signal Abort signal for cancellation.
     * @param getCount Whether to retrieve the feature count.
     * @param getBounds Whether to retrieve the feature bounds.
     * @returns A promise resolving to an EsriQueryCheckResult.
     */
    public async getQueryCountAndBounds(
      prefix: string,
      query: esri.Query,
      signal: AbortSignal,
      getCount: boolean,
      getBounds: boolean
    ): Promise<EsriQueryCheckResult> {
      let bnds: LatLngBounds = null;
      let count: number = -1;
      let msg: any;
      if(getCount){
        try {
          count = await new Promise<number>((resolve, reject) => query.count((error, n) => error ? reject(error) : resolve(n)));
        } catch (error) {
          msg = error.message;
          return {
            prefix: prefix,
            n_features: count,
            bounds: bnds,
            message: msg,
          };
        }
        if (!count) {
          return { prefix:prefix, n_features: 0, bounds: bnds, message: "No features found" };
        }
      }
      if(getBounds){
        try {
          // get the bounds of the features we'll be returning, to give us an impression of how big a geographic
          // extent it is. We'll assume that if it's a bigger extent, we're less likely to go pixel-peeping
          // and can get away with a more generalised geometry to keep volumes down
          bnds = await new Promise<LatLngBounds>((resolve, reject) => query.bounds((error, b) => error ? reject(error) : resolve(b)));
        } catch (error) {
          msg = "Shouldn't get here, oops!"
        }
      }
      return {
        prefix:prefix,
        n_features: count,
        bounds: bnds,
        message:msg
      }
    }

    /**
     * Adds a maxAllowableOffset parameter to the query to simplify returned geometry.
     * @param query The Esri query object.
     * @param bnds Optional bounds to estimate offset.
     * @param maxAllowableOffsetDegrees Optional explicit offset in degrees.
     * @returns The modified Esri query.
     */
    public simplifyQuery(query: esri.Query, bnds?: LatLngBounds, maxAllowableOffsetDegrees?: number): esri.Query {
      if ("params" in query) {
        // this is not an official parameter of query (for esri leaflet we are supposed to use
        // simplify which calculates offset from a map) but I don't want to need a reference to map
        // here, so we just take pixel size of the visual to be 1000x700, it'll rarely be much bigger
        if (bnds) {
          // from query.simplify source:
          //var mapWidth = Math.abs(map.getBounds().getWest() - map.getBounds().getEast());
          //                  nb bug in source as it compares y to width
          //this.params.maxAllowableOffset = (mapWidth / map.getSize().y) * factor;
          const dataWidthDegrees = Math.abs(bnds.getWest() - bnds.getEast());
          const dataHeightDegrees = Math.abs(bnds.getNorth() - bnds.getSouth());
          const xFactor = dataWidthDegrees / 1000;
          const yFactor = dataHeightDegrees / 700;
          const factor = Math.min(xFactor, yFactor);
          query.params["maxAllowableOffset"] = factor * 0.1;
        } else {
          query.params["maxAllowableOffset"] = maxAllowableOffsetDegrees;
        }
      }
      return query;
    }

    /**
     * Runs the given Esri query, handling paging if the number of features exceeds the per-query limit.
     * @param query The Esri query object.
     * @param signal Abort signal for cancellation.
     * @param expectedCount The expected number of features (optional).
     * @returns A promise resolving to a GeoJSON FeatureCollection of all results.
     */
    public async runQuery(
      query: esri.Query,
      signal: AbortSignal,
      expectedCount: number
    ): Promise<FeatureCollection> {
      let pageCount;
      if(!(expectedCount || expectedCount ===0 )){
        expectedCount = (await this.getQueryCountAndBounds(null, query, signal, true, false)).n_features;
      }
      pageCount = Math.ceil(expectedCount / this.max_feature_count);
      let pageOffsets = [];
      for (let i=0; i<pageCount; i++){
        pageOffsets.push(i * this.max_feature_count);
      }
      query.limit(this.max_feature_count);
      let allProm = Promise.all(pageOffsets.map(function(resultPageStart){
        query.offset(resultPageStart);
        // using the required callback syntax approach will make the calling code in the visual
        // more complex. So I have wrapped the esri query run into a promise so we can use
        // async/await syntax
        return new Promise<FeatureCollection>((resolve, reject) => query.run((error, fc) => error ? reject(error) : resolve(fc)))
      }));
      let combinedFeatureCollection: FeatureCollection;
      try {
        let paginatedResults = await allProm;
        combinedFeatureCollection = paginatedResults.pop();
        paginatedResults.forEach(function(resultFeatureSet){
          Array.prototype.push.apply(combinedFeatureCollection.features, resultFeatureSet.features)
        });
      } catch (error) {
        //console.log(error); // TODO handle properly
        return null; //{n_features: 0, bounds:null};
      }
      return combinedFeatureCollection;
    }
}
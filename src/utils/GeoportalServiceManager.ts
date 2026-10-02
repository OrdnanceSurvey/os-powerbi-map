import * as esri from "esri-leaflet";
import { Feature } from "geojson";
import { LatLngBounds } from "leaflet";
import { GSSServiceDetails } from "../types/geocoding-types";
import {EsriQueryCheckResult, EsriQueryRunResult, GeocodeParams} from "../types/geocoding-types"
import { fetchGSSServices } from "./getGSSInfo";
import {
  batchCodes,
  boundsEsriQuery,
  countEsriQuery,
  isAbortError,
  runEsriQueryPaged,
  runWithConcurrencyLimit
} from "./Geocode_Utils";
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
     * Builds one Esri query per batch of codes. The services error rather than paging when a where
     * clause contains too many codes, so we send several smaller queries instead of one big one.
     * @param params Geocode parameters for the query.
     * @returns An array of Esri query objects, together covering all the codes in the parameters.
     */
    public buildGeometryQueries(params: GeocodeParams): esri.Query[] {
      return batchCodes(params.codes).map((codes) =>
        this.buildGeometryQuery({ ...params, codes: codes })
      );
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
     * Gets the combined count and bounds of the features matched by a set of batched queries.
     * If any batch fails then the whole result is reported as an error, as a partial count or
     * extent would be misleading.
     * @param prefix The GSS code prefix.
     * @param queries The batched Esri query objects, as built by buildGeometryQueries.
     * @param signal Abort signal for cancellation.
     * @param getCount Whether to retrieve the feature count.
     * @param getBounds Whether to retrieve the feature bounds.
     * @returns A promise resolving to an EsriQueryCheckResult.
     */
    public async getQueryCountAndBounds(
      prefix: string,
      queries: esri.Query[],
      signal: AbortSignal,
      getCount: boolean,
      getBounds: boolean
    ): Promise<EsriQueryCheckResult> {
      let bnds: LatLngBounds = null;
      let count: number = getCount ? 0 : -1;
      try {
        const batchResults = await runWithConcurrencyLimit(
          queries.map((query) => async () => {
            const batchCount = getCount ? await countEsriQuery(query) : -1;
            // no point asking a batch which matched nothing for its extent
            const batchBounds = getBounds && batchCount !== 0 ? await boundsEsriQuery(query) : null;
            return { batchCount: batchCount, batchBounds: batchBounds };
          }),
          signal
        );
        batchResults.forEach((batchResult) => {
          if (getCount) { count += batchResult.batchCount; }
          // get the bounds of the features we'll be returning, to give us an impression of how big a geographic
          // extent it is. We'll assume that if it's a bigger extent, we're less likely to go pixel-peeping
          // and can get away with a more generalised geometry to keep volumes down
          if (batchResult.batchBounds && batchResult.batchBounds.isValid()) {
            bnds = bnds ? bnds.extend(batchResult.batchBounds) : batchResult.batchBounds;
          }
        });
      } catch (error) {
        if (isAbortError(error)) { throw error; }
        return {
          prefix: prefix,
          n_features: -1,
          bounds: null,
          message: error instanceof Error ? error.message : String(error),
        };
      }
      if (getCount && count === 0) {
        return { prefix: prefix, n_features: 0, bounds: bnds, message: "No features found" };
      }
      return {
        prefix: prefix,
        n_features: count,
        bounds: bnds
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
          (query.params as any)["maxAllowableOffset"] = factor * 0.1;
        } else {
          (query.params as any)["maxAllowableOffset"] = maxAllowableOffsetDegrees;
        }
      }
      return query;
    }

    /**
     * Applies simplification to each of a set of batched queries.
     * @param queries The batched Esri query objects.
     * @param bnds Optional bounds to estimate offset.
     * @param maxAllowableOffsetDegrees Optional explicit offset in degrees.
     * @returns The modified Esri queries.
     */
    public simplifyQueries(queries: esri.Query[], bnds?: LatLngBounds, maxAllowableOffsetDegrees?: number): esri.Query[] {
      return queries.map((query) => this.simplifyQuery(query, bnds, maxAllowableOffsetDegrees));
    }

    /**
     * Runs a set of batched queries, paging through the results of each, and combines the features.
     * A batch which fails does not discard the features returned by the others; its error message is
     * returned instead, so the caller can tell the user and avoid caching a missing result as a
     * genuine "not found".
     * @param queries The batched Esri query objects, as built by buildGeometryQueries.
     * @param signal Abort signal for cancellation.
     * @returns A promise resolving to the combined features and any error messages.
     */
    public async runQueries(
      queries: esri.Query[],
      signal: AbortSignal
    ): Promise<EsriQueryRunResult> {
      const errors: string[] = [];
      const features: Feature[] = [];
      const batchResults = await runWithConcurrencyLimit(
        queries.map((query) => async () => {
          try {
            return await runEsriQueryPaged(query, this.max_feature_count, signal);
          } catch (error) {
            if (isAbortError(error)) { throw error; }
            errors.push(error instanceof Error ? error.message : String(error));
            return [] as Feature[];
          }
        }),
        signal
      );
      batchResults.forEach((batchFeatures) => {
        Array.prototype.push.apply(features, batchFeatures);
      });
      return { features: features, errors: errors };
    }
}
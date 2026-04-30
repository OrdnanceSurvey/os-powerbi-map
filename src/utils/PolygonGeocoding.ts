"use strict";
import L, { LatLngBounds } from "leaflet";
import * as esri from "esri-leaflet";
import { createHash } from "./utils";
import { OSPowerBIUIManager } from "../ui/uimanager";
import { GSSServiceDetails } from "../types/geocoding-types";
import { GeocodeTypes, GeocodeMetrics, IdentifierParseResults, GeojsonFeatureDictionary, BoundedFeatureGeocodingResult, EsriQueryCheckResult, GeocodeParams } from "../types/geocoding-types"
import { removeNullsAndZero, cleanStringIdentifiers, restoreOriginalIdentifierKeys, restoreOriginalIdentifiers, GSS_CHECKER } from "./Geocode_Utils"
import { GeoportalServiceManager } from "./GeoportalServiceManager";
import { assert } from "console";


/**
 * Handles geocoding of polygon (area) identifiers (such as GSS codes) using Esri services and manages a local cache.
 * Supports detailed and generalised geometry, bounds caching, and batch queries via GeoportalServiceManager.
 */
export class PolygonGeocoder {
  /** Reference to the UI manager for notifications and cache persistence. */
  UIManager: OSPowerBIUIManager;
  /** Local cache of geocoded polygon results, keyed by cleaned identifier. */
  cache: GeojsonFeatureDictionary;
  /** Maximum allowable offset in degrees for geometry simplification. */
  maxAllowableOffsetDegrees: number;
  /** Lookup table mapping GSS code prefixes to service details. */
  service_urls_lookup: { [key: string]: GSSServiceDetails };
  /** Cache of previous subquery bounds by hash. */
  previousSubqueryBounds: { [key: string]: EsriQueryCheckResult };
  /** Cache of previous input bounds by hash. */
  previousInputBounds: { [key: string]: LatLngBounds }
  /** Whether to use detailed geometry for queries. */
  private _useDetailedGeom: boolean;
  /** Manager for GSS ArcGIS online services. */
  geoportalManager: GeoportalServiceManager;
  /** Flag indicating if the cache needs to be persisted. */
  private cacheNeedsSaving: boolean;

  /**
   * Gets whether detailed geometry is used for queries.
   */
  get useDetailedGeom(): boolean {
    return this._useDetailedGeom
  }

  /**
   * Sets whether detailed geometry is used for queries. Clears cache if changed.
   * @param useDetailedGeom True to use detailed geometry, false for generalised.
   */
  set useDetailedGeom(useDetailedGeom: boolean) {
    if (useDetailedGeom !== this._useDetailedGeom) {
      this._clearCache();
      this._useDetailedGeom = useDetailedGeom;
    }
  }

  /**
   * Clears all polygon geocode caches and bounds.
   * @private
   */
  private _clearCache() {
    this.cache = {};
    this.previousSubqueryBounds = {};
    this.previousInputBounds = {};
  }

  /**
   * Constructs a PolygonGeocoder instance. Private constructor to enforce factory method usage.
   * @param serviceManager The GeoportalServiceManager instance.
   * @param UIManager The UI manager instance.
   * @private
   */
  private constructor(serviceManager: GeoportalServiceManager, UIManager: OSPowerBIUIManager) {
    this.UIManager = UIManager;
    this.geoportalManager = serviceManager;
    try {
      this.cache = //{}||
        JSON.parse(
          this.UIManager.visual.getPersistedSettings("polygonGeocodeResults")
        ) || {};
      this._useDetailedGeom = JSON.parse(this.UIManager.visual.getPersistedSettings("usingDetailedGeom"));
      this.previousInputBounds = 
          JSON.parse(
            this.UIManager.visual.getPersistedSettings("polygonGeocodeBounds")
          ) || {};
      for (const key in this.previousInputBounds){
        // rehydrate the json objects to actual L.LatLngBounds objects with their prototypes functions
        // and whatnot
        const unhydratedBounds = this.previousInputBounds[key];
        this.previousInputBounds[key] = Object.assign(new L.LatLngBounds(null,null), unhydratedBounds);
      }
      if (this._useDetailedGeom === null) {
        this._useDetailedGeom = false
      }
    } catch (e: any) {
      this.cache = {};
      this._useDetailedGeom = false;
    }
    //console.log(
    //  Object.keys(this.cache).length + " polygon geocodes found in cache on load, with "
    // + `${this._useDetailedGeom ? "detailed" : "generalised"} geometries, corresponding to `
    //  + Object.keys(this.previousInputBounds).length + " unique input datasets"
    //);
    // 0.00002 is in the region of 1-2 metres
    this.maxAllowableOffsetDegrees = 0.00002;
    this.previousSubqueryBounds = {};

  }

  /**
   * Factory method to asynchronously create a PolygonGeocoder instance.
   * @param UIManager The UI manager instance.
   * @returns A promise resolving to a PolygonGeocoder.
   */
  static async PolygonGeocoder(UIManager: OSPowerBIUIManager): Promise<PolygonGeocoder> {
    // factory pattern to get around the fact we can't make an async constructor, but need one 
    // because we have to retrieve the file giving the service URLs from the network first
    const service_manager = await GeoportalServiceManager.GeoportalServiceManager();
    return new PolygonGeocoder(service_manager, UIManager);
  }

  /**
   * Processes and validates a list of identifiers, determines their type, and prepares them for geocoding.
   * @param identifiers Array of string identifiers.
   * @returns An IdentifierParseResults object describing the identifiers.
   * @private
   */
  private sanitiseIdentifiers(identifiers: string[]): IdentifierParseResults {
    let inputHash = createHash(identifiers);
    let nTotal = identifiers.length;
    let working = removeNullsAndZero(identifiers);
    let nNonNullIn = working.length;
    let nUniqueIn = new Set(working).size;
    let toFetch: string[] = [];
    let invalid: string[] = [];
    let nCached = 0;
    let cleanedInputValues: string[] = [];
    let valid = 0;
    let cleanToDirtyMap = cleanStringIdentifiers(working);
    working = Object.keys(cleanToDirtyMap);
    working.forEach((i) => {
      if (!GSS_CHECKER.test(i)) {
        invalid.push(i);
        return;
      }
      valid += 1;
      if (this.cache[i] === undefined) {
        toFetch.push(i);
      }
      else {
        nCached += cleanToDirtyMap[i].length
      }
      cleanedInputValues.push(i)
    });
    return {
      nUnique: nUniqueIn,
      nTotal: nTotal,
      nNonNull: nNonNullIn,
      nCached: nCached,
      map: cleanToDirtyMap,
      cleanedInputs: cleanedInputValues,
      toFetch: toFetch,
      invalid: invalid,
      type: valid ? GeocodeTypes.GSS : GeocodeTypes.INVALID,
      inputHash: inputHash
    }
  }

  /**
   * Creates geocode metrics for all prefixes in the provided identifiers.
   * @param identifiers Array of string identifiers.
   * @returns A record of GeocodeMetrics by prefix and a totals entry.
   * @private
   */
  private createAllGeocodeMetrics(identifiers: string[]): Record<string, GeocodeMetrics> {
    const allGeocodeMetrics: Record<string, GeocodeMetrics> = {
      totals: {
          nTotal: 0,
          nUnique: 0,
          nNonNull: 0,
          nCached: 0,
          nInvalid: 0,
          nToFetch: 0,
          nFetched: 0, // update this after calling esri query and cacheing
          elapsed: 0, // where to calculate this?
          geocodeType: GeocodeTypes.GSS // Default value, can be updated later
      }
  };

  identifiers.forEach((c) => {
      const prefix = c.substring(0, 3);
      const results = this.sanitiseIdentifiers([c]);

      if (!allGeocodeMetrics[prefix]) {
          allGeocodeMetrics[prefix] = {
              nTotal: 0,
              nUnique: 0,
              nNonNull: 0,
              nCached: 0,
              nInvalid: 0,
              nToFetch: 0,
              nFetched: 0,
              elapsed: 0, // do the tic toc thing
              geocodeType: GeocodeTypes.GSS // Default value, can be updated type: valid ? GeocodeTypes.GSS : GeocodeTypes.INVALID, later
          };
      }

      allGeocodeMetrics[prefix].nTotal += results.nTotal;
      allGeocodeMetrics[prefix].nUnique += results.nUnique;
      allGeocodeMetrics[prefix].nNonNull += results.nNonNull;
      allGeocodeMetrics[prefix].nCached += results.nCached;
      allGeocodeMetrics[prefix].nInvalid += results.invalid.length;
      allGeocodeMetrics[prefix].nToFetch += results.toFetch.length;
      // Update geocodeType if necessary
      allGeocodeMetrics[prefix].geocodeType = results.type;

      // Update totals
      allGeocodeMetrics.totals.nTotal += results.nTotal;
      allGeocodeMetrics.totals.nUnique += results.nUnique;
      allGeocodeMetrics.totals.nNonNull += results.nNonNull;
      allGeocodeMetrics.totals.nCached += results.nCached;
      allGeocodeMetrics.totals.nInvalid += results.invalid.length;
      allGeocodeMetrics.totals.nToFetch += results.toFetch.length;
  });

  return allGeocodeMetrics;
  }


  /**
   * Geocodes a list of polygon identifiers (GSS codes), using cache and Esri services as needed.
   * Handles bounds queries, feature queries, UI notifications, and error reporting.
   * @param identifiers Array of string identifiers.
   * @param signal Abort signal for cancellation.
   * @param updateid Update identifier for logging.
   * @returns A promise resolving to a BoundedFeatureGeocodingResult.
   */
  public async polygon_geocode(
    identifiers: string[],
    signal: AbortSignal = null,
    updateid: string
  ): Promise<BoundedFeatureGeocodingResult> {
    // if geocoding takes longer than 4s, display a toast notification so the user
    // knows what's up
    try {
      const timeoutID = setTimeout(
        function () {
          this.UIManager.DisplayToastNotification(
            "Geocode running",
            "Waiting for geocoding results",
            "warning"
          );
        }.bind(this),
        4000
      );
      this.UIManager.addDevMessage(`Geocode called in update ${updateid} at ${new Date().toISOString()}` );
      const tic = performance.now();
      let parsedIdentifiers = this.sanitiseIdentifiers(identifiers);

      let allGeocodeMetrics = this.createAllGeocodeMetrics(identifiers);

      // Get the bounds for *all* the requested features (**whether already cached or not** and **across all the 
      // feature services to be queried if there is more than one GSS code type**). 
      // This is so that the queries which actually retrieve the data (for whatever features are not cached) 
      // can use a simplification level appropriate to the extent of *all* the data that will be displayed, not just what 
      // is being retrieved now. Also so we can suggest a map zoom/extent that is appropriate for all the input data.
      // In doing do check that the services are valid and reachable
      const erroredQueryPrefixes = [];
      const allQueryDetails = await this.geoportalManager.parseServiceDetails(
        Array.from(parsedIdentifiers.cleanedInputs), this._useDetailedGeom
      );
      let totalBounds: LatLngBounds;
      const seenItAllBefore = parsedIdentifiers.inputHash in this.previousInputBounds;

      if (!seenItAllBefore) {
        if (parsedIdentifiers.type !== GeocodeTypes.GSS) {
          this.UIManager.addError("No valid GSS identifiers were present");
          clearTimeout(timeoutID);
          return { geocodes: null, bounds: null, aborted: false};
        }
        let n_blank = identifiers.length - parsedIdentifiers.nNonNull;
        let debugMessage = `${identifiers.length} non-blank GSS codes found for geocoding ` +
          `(${parsedIdentifiers.nUnique} unique)`;
        if (n_blank) {
          debugMessage += `, and ${n_blank} blank/null values`
        }
        debugMessage += '.';
        if (parsedIdentifiers.nCached) {
          debugMessage +=
            ` Of these, ${parsedIdentifiers.nCached} are already cached in the visual and won't be re-requested.`
        }
        this.UIManager.addDebugMessage(debugMessage);
        if (parsedIdentifiers.invalid.length > 0) {
          const invalidInputs = restoreOriginalIdentifiers(parsedIdentifiers.invalid, parsedIdentifiers.map);
          this.UIManager.addError(
            "The following identifiers do not appear to be valid GSS codes and will not be sent to the geocoding APIs " +
            `for data security reasons: ${invalidInputs}`
          );
        }
      }

      if (seenItAllBefore && parsedIdentifiers.toFetch.length) {
        // this shouldn't happen
      }

      if (!seenItAllBefore) {// && parsedIdentifiers.toFetch.length>0) {
        // we haven't seen this exact same data before. We need to send one query for each GSS code type to establish 
        // the count and spatial bounds of the features that will be returned by this query
        let boundsQueryPromises: Promise<EsriQueryCheckResult>[] = [];
        for (const prefix in allQueryDetails) {
          // for each service we need to query (i.e. each unique GSS code type in the input codes), get the bounds and featurecount
          // for all the values present and cache this. 
          const thisQueryParams = allQueryDetails[prefix];
          const seenThisServiceQueryBefore: boolean = thisQueryParams.codesHash in this.previousSubqueryBounds;
          if (!seenThisServiceQueryBefore) {
            const boundsQuery = this.geoportalManager.buildGeometryQuery(thisQueryParams);
            // do not await here in the loop, instead do promise.all on the requests and await that. This is so each bounds query
            // (one to each feature service) can run in parallel rather than one after another which should be much faster for a 
            // dataset containing lots of different GSS code types
            const boundsResultProm: Promise<EsriQueryCheckResult> = this.geoportalManager.getQueryCountAndBounds(prefix, boundsQuery, signal, true, true);
            boundsQueryPromises.push(boundsResultProm)
          }
        }
        let allProm = Promise.all(boundsQueryPromises);
        let boundsQueryResults = await (allProm);
        // because we didn't process the results in the loop we need to have another loop to sort them back out after they've all run
        boundsQueryResults.forEach(function (boundsResult: EsriQueryCheckResult) {
          const prefix = boundsResult.prefix;
          const thisQueryParams = allQueryDetails[prefix];
          if (boundsResult.n_features === 0) {
            this.UIManager.addWarning(
              `No matching features found for prefix ${prefix}`
            );
            erroredQueryPrefixes.push(prefix);
          } else if (boundsResult.n_features === -1) {
            this.UIManager.addError(
              `An error occurred calling the polygon geocoding service for '${prefix}' GSS codes. ` +
              "This is an external service outside of our control - please try again later"
            );
            erroredQueryPrefixes.push(prefix);
          }
          else {
            // save the bounds+count for this particular set of GSS codes to the cache
            this.previousSubqueryBounds[thisQueryParams.codesHash] = boundsResult;
            this.cacheNeedsSaving = true
          }
        }.bind(this));
        let newTotalBounds: L.LatLngBounds;
        for (const prefix in allQueryDetails) {
          if (erroredQueryPrefixes.includes(prefix)) { continue }
          const thisQueryParams = allQueryDetails[prefix]
          const subBounds = this.previousSubqueryBounds[thisQueryParams.codesHash].bounds
          newTotalBounds = newTotalBounds ? newTotalBounds.extend(subBounds) : subBounds;
        }
        if (newTotalBounds) {
          // cache this in case we get called again with the exact same inputs, so we don't have to re-query
          // all the bounds if the user has just changed the colour or something
          this.previousInputBounds[parsedIdentifiers.inputHash] = newTotalBounds;
          this.cacheNeedsSaving = true;
          //console.log(`Completed bounds queries from ${boundsQueryPromises.length} services`);
        }
      }
      else {
        //console.log("Geocoding data fully cached! Reusing bounds and features");
        // this implies that all data are the same so we will not be fetching any, check it's so
        assert(parsedIdentifiers.toFetch.length === 0);
      }
      totalBounds = this.previousInputBounds[parsedIdentifiers.inputHash]

      if (signal.aborted) {
        clearTimeout(timeoutID);
        this.UIManager.DisplayToastNotification(null);
        this.UIManager.addDevMessage(`Geocoding in update ${updateid} aborted after bounds and before features`+
         `, due to data change while still running. ${parsedIdentifiers.toFetch.length} still to fetch.`);
        return { geocodes: null, bounds: null, aborted:true };
      }

      // now run the queries for each service we need to actually retrieve data from
      if (parsedIdentifiers.toFetch.length > 0) {
        const requiredQueryDetails = await this.geoportalManager.parseServiceDetails(Array.from(parsedIdentifiers.toFetch), this._useDetailedGeom);
        for (const prefix in requiredQueryDetails) {
          if (erroredQueryPrefixes.includes(prefix)) {
            continue; // we've already logged an error for it
          }
          const queryParams = requiredQueryDetails[prefix];
          const countQueryParams = allQueryDetails[prefix];
          const expectedCount = countQueryParams.knownCount;
          queryParams.knownCount = expectedCount;
          let query = this.geoportalManager.buildGeometryQuery(queryParams);
          // simplify each dataset query based on the bounds of all the data being requested by user,
          // not just what is uncached and in this particular query
          query = this.geoportalManager.simplifyQuery(query, totalBounds);
          // nb this does mean that we cache the results for each feature at a given simplification level so if we
          // get called with a superset later, then features previously requested will have more detail than the
          // new ones
          const n_features = await this.callAndCacheEsriQuery(query, queryParams, signal);

          // update allGeocodeMetrics for logs
          if (allGeocodeMetrics[prefix] && typeof n_features === 'number' && !isNaN(n_features)) {
            // update number fetched
            allGeocodeMetrics[prefix].nFetched = n_features;
            allGeocodeMetrics.totals.nFetched += n_features; // Update totals
            // and cached
            allGeocodeMetrics[prefix].nCached = n_features;
            allGeocodeMetrics.totals.nCached += n_features;// Update totals
            const thistoc = performance.now();
            allGeocodeMetrics[prefix].elapsed = thistoc-tic;
          }
          if (signal.aborted) {
            clearTimeout(timeoutID);
            this.UIManager.DisplayToastNotification(null);
            this.UIManager.addDevMessage(`Geocoding in update ${updateid} aborted after retrieving features for ${prefix}`);
            return { geocodes: null, bounds: null, aborted:true };
          }
          if (n_features === -1) {
            //console.log("shouldn't get here oops");
          } else {
            this.UIManager.addDebugMessage(
              `${n_features} of ${queryParams.codes.length} ${queryParams.entity} (${prefix}) ` +
              `identifiers were successfully geocoded.`
            );
          }
        }
        //console.log("Completed all geocoding queries");
      }

      // finally build the desired return object from the original raw user input and the now-cached results
      let results: GeojsonFeatureDictionary = {};
      const notfound_clean: string[] = [];
      parsedIdentifiers.cleanedInputs.forEach((cleanIdentifier) => {
        if (this.cache[cleanIdentifier]) {
          const item = this.cache[cleanIdentifier];
          // ESRI service returns a geojson feature with the queried field on the properties.
          // This causes our symbology logic to display that field in tooltip table iif no other
          // tooltip fields have been populated, which isn't desirable as it's not a field in
          // our data. Instead we will be displaying it in tooltip header.
          if (item.properties) {
            item.properties = null;
          }
          results[cleanIdentifier] = item;
        }
        else {
          if (parsedIdentifiers.toFetch.includes(cleanIdentifier)) {
            notfound_clean.push(cleanIdentifier);
            this.cache[cleanIdentifier] = null; // so we don't bother querying api for it next time
            // TODO or some distinct error value which we check for
            this.cacheNeedsSaving = true;
          }
        }
      });
      const notfound_orig = restoreOriginalIdentifiers(notfound_clean, parsedIdentifiers.map);
      if (notfound_orig.length > 0) {
        // nb in point geocoder we iterate over input values and then build notfound based on checking to see 
        // if they not returned due to being invalid. Here we're just iterating over cleaned values which means 
        // we'll report the cleaned rather than the input value to the user as not found. Never mind.
        if (notfound_orig.length > 100) {
          let first100 = notfound_orig.slice(0, 100);
          let remaining = notfound_orig.length - first100.length;
          this.UIManager.addError(
            `The following values failed to return a result from our geocoding API and will not be mapped: ${first100.join(", ") + ` + ${remaining} more.`
            }`
          );
        } else if (notfound_orig.length > 0) {
          this.UIManager.addError(
            `The following values failed to return a result from our geocoding API and will not be mapped: ${notfound_orig.join(
              ", "
            )}`
          );
        }
      }
      results = restoreOriginalIdentifierKeys(results, parsedIdentifiers.map)
      clearTimeout(timeoutID);
      this.UIManager.DisplayToastNotification(null);
      const toc = performance.now();
      allGeocodeMetrics.totals.elapsed = toc - tic;
          
      if (!signal.aborted) {
        this.saveCache();
        return { geocodes: results, bounds: totalBounds, aborted: false, allGeocodeMetrics: allGeocodeMetrics };
      }
      else {
        //console.log("Not returning geocode results to caller as operation was aborted")
        return { geocodes: null, bounds: null, aborted: true};
      }
    }
    catch (e) {
      if ((e instanceof Error) && !(e.name === 'AbortError')) { throw e; }
      //console.log(
      //  "Geocode aborted due to new update!"
      //);
    }
  }

  /**
   * Calls the Esri query and caches the resulting features.
   * @param query The Esri query object.
   * @param params Geocode parameters for the query.
   * @param signal Abort signal for cancellation.
   * @returns A promise resolving to the number of features returned.
   * @private
   */
  private async callAndCacheEsriQuery(
    query: esri.Query,
    params: GeocodeParams,
    signal: AbortSignal
  ): Promise<number> {
    const res = await this.geoportalManager.runQuery(query, signal, params.knownCount);
    if (!res) { return 0; }
    res.features.forEach((feat) => {
      this.cache[feat.properties[params.codefield]] = feat;
    });
    this.cacheNeedsSaving = true
    return res.features.length; //{n_features: res.features.length, bounds:bnds};
  }

  /**
   * Persists the polygon geocode cache and bounds to the UI manager's visual storage.
   * @private
   */
  private saveCache() {
    if (!this.cacheNeedsSaving) { return; }
    this.UIManager.visual.persistDataToCard("polygonGeocodeResults", this.cache);
    this.UIManager.visual.persistDataToCard("usingDetailedGeom", this._useDetailedGeom);
    this.UIManager.visual.persistDataToCard("polygonGeocodeBounds", this.previousInputBounds);
    this.cacheNeedsSaving = false
  }
}


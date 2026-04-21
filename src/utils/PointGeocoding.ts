import { postcode_regex} from "../resources";
import { postcodeUrl_Esri, uprnUrl_Esri } from "../resources";
import * as esri from "esri-leaflet";
import { promisify } from "util";
import { FeatureCollection } from "geojson";
import { OSPowerBIUIManager } from "../ui/uimanager";
import { PointDictionary, GeocodeTypes, IdentifierParseResults, GeocodeParams, GeocodeMetrics } from "../types/geocoding-types"
import { isNumeric, removeNullsAndZero, isStringArr, cleanStringIdentifiers, restoreOriginalIdentifierKeys, restoreOriginalIdentifiers, GSS_CHECKER } from "./Geocode_Utils"

/**
 * Handles geocoding of point identifiers (postcodes, UPRNs) using Esri services and manages a local cache.
 */
export class PointGeocoder {
    /** Reference to the UI manager for notifications and cache persistence. */
    private UIManager: OSPowerBIUIManager;
    /** Regular expression for validating postcodes. */
    private postcode_checker: RegExp;
    /** Local cache of geocoded results. */
    cache: PointDictionary;
    /** Maximum number of features to request per batch, by geocode type. */
    private max_feature_counts: { [key in GeocodeTypes]?: number } = {
        [GeocodeTypes.POSTCODE]: 2000,
        [GeocodeTypes.UPRN]: 2000
    }

    /**
     * Constructs a PointGeocoder instance.
     * @param UIManager The UI manager instance.
     */
    constructor(UIManager: OSPowerBIUIManager) {
      this.UIManager = UIManager;
      this.postcode_checker = new RegExp(postcode_regex);
      try {
        this.cache =
          JSON.parse(
            this.UIManager.visual.getPersistedSettings("geocodeResults")
          ) || {};
      } catch (e: any) {
        this.cache = {};
      }
      this.UIManager.addDebugMessage(Object.keys(this.cache).length + " geocodes found in cache on load");
    }
  
    /**
     * For a string or numeric value check with regular expression and number matching whether it appears 
     * to be a potentially-valid postcode, a potentially-valid GSS code, a potentially-valid UPRN, or 
     * none of these. Use to pre-filter user provided data before sending to API to avoid concerns about 
     * inadvertent data leakage if user enters a field containing some other potentially sensitive 
     * information into the geocoding field well, and also to avoid sending large text content to the API
     * for efficiency reasons
     * @param i - a string or numeric value for which we want to assess if it is a postcode, UPRN, 
     * GSS code, or neither
     * @returns 
     */
    private checkTypeAndValidity(i:string|number){
      if (typeof i === "number" || isNumeric(i)) {
        let n = parseInt(i.toString());
        if (Number.isInteger(n) && n.toString().length <= 12) {
          return GeocodeTypes.UPRN        
        }
      }
      else if (this.postcode_checker.test(i)){
        return GeocodeTypes.POSTCODE;
      }
      else if (GSS_CHECKER.test(i)){
        return GeocodeTypes.GSS;
      }
      return GeocodeTypes.INVALID;
    }
  
     /**
     * Work out what type of input we have (postcode or UPRN), check whether the values 
     * appear to be valid postcodes or UPRNs, clean postcodes by removing spaces and 
     * converting to uppercase, establish which ones we need to fetch
     * @param identifiers A list of string or numeric identifiers received from powerBI
     * @returns An identifiersInfo object containing:
     * - items to fetch from API, 
     * - number of unique identifiers, 
     * - number that were already cached, 
     * - the type (postcode or UPRN), 
     * - list items that were invalid (not valid postcodes or UPRNs) 
     * - for postcodes, a mapping from cleaned to raw values, 
     * - and a list of all the cleaned values
     * // TODO move to geocode_utils
     */
     private sanitiseIdentifiers(identifiers:string[]|number[]):IdentifierParseResults{
      //const res:identifiersInfo = {}toFetch, nUnique, nCached, type
      let nTotal = identifiers.length;
      let working = removeNullsAndZero(identifiers);
      let nNonNullIn = working.length;
      let nUniqueIn = new Set(working).size;
      let toFetch:any[] = [];
      let invalid = [];
      let nCached = 0;
      let cleanToDirtyMap;
      let cleanedInputValues = []
      if(isStringArr(working)){
        cleanToDirtyMap = cleanStringIdentifiers(working);
        // iterate over the values which are unique after cleaning
        // i.e. given ['SO16 0AS', 'so160 as', 'so16 0as   ', 'SO16 0AS', null, '', 'bob']
        // we only want to check validity of and potentially fetch (or check cache for) 
        // ['SO160AS', 'BOB']
        working = Object.keys(cleanToDirtyMap);
      }
      else {
        // iterate over the unique values
        // i.e. given [1, 2, 3, 4, 1, 1, 1]
        // we only want to fetch (or check cache for) [1, 2, 3, 4]
        working = Array.from(new Set(working));
      }
      let overallType:GeocodeTypes|null = null;
      working.forEach((i) => {
        let thisType = this.checkTypeAndValidity(i);
        //if(thisType===identifierTypes.INVALID) { 
        if (!(thisType===GeocodeTypes.POSTCODE || thisType===GeocodeTypes.UPRN)){
          invalid.push(i); // 'BOB' goes here
          return;
        }
        else if (overallType === null) { 
          overallType = thisType; 
        }
        else if (thisType !== overallType ){
          // think this could only happen if UPRNs were being stored as text mixed up with PCs
          throw new Error("Mixed identifier types");
        }
        if(this.cache[i] === undefined) { 
          toFetch.push(i); // 'SO160AS' goes here if not cached
        }
        else { 
          nCached += cleanToDirtyMap ? cleanToDirtyMap[i].length : 1; 
        }
        cleanedInputValues.push(i); // 'SO160AS' goes here whether cached or not
      });
      return {
        nUnique: nUniqueIn,
        nTotal: nTotal,
        nNonNull: nNonNullIn,
        nCached: nCached,
        type: overallType,
        map: cleanToDirtyMap||null,
        cleanedInputs: cleanedInputValues,
        toFetch: toFetch,
        invalid: invalid,
        inputHash: null
      }
    }
  
    /**
     * Geocodes a list of identifiers (postcodes or UPRNs), using cache and Esri services as needed.
     * Handles UI notifications and error reporting.
     * @param identifiers Array of string or number identifiers.
     * @param signal Abort signal for cancellation.
     * @returns An object containing geocoded results and metrics, or null if input is invalid.
     */
    public async geocode_identifiers(identifiers: string[] | number[], signal: AbortSignal) {
      const tic = performance.now();
      // geocode a series of strings which are assumed (and checked) to be postcodes
      // or numbers which are assumed (and checked) to be uprns
      const timeoutID = setTimeout(
        function () {
          // if geocoding takes longer than 4s, display a toast notification so the user
          // knows what's up
          this.UIManager.DisplayToastNotification(
            "Geocode running",
            "Waiting for geocoding results",
            "warning"
          );
        }.bind(this),
        4000
      );
      // anything already coded and saved in the add-in, re-use
  
      this.UIManager.addDebugMessage(Object.keys(this.cache).length + " geocodes found in cache");
      let cacheNeedsSaving = false;
  
     // work out what type of identifiers we have and check they are valid by regex etc
     let parsedIdentifiers = this.sanitiseIdentifiers(identifiers);
     if (! (
       parsedIdentifiers.type===GeocodeTypes.POSTCODE 
       || parsedIdentifiers.type===GeocodeTypes.UPRN)){
         this.UIManager.addError(
               "The data provided for geocoding do not appear to be either postcodes or UPRNs, and so "+
               "cannot be geocoded to point locations."
         );
         clearTimeout(timeoutID);
         this.UIManager.DisplayToastNotification(null);
         return null
      }
      let what = parsedIdentifiers.type === GeocodeTypes.POSTCODE 
        ? "postcode" 
        : parsedIdentifiers.type === GeocodeTypes.UPRN
          ? "UPRN" 
          : "other"
      let n_blank = identifiers.length - parsedIdentifiers.nNonNull;
      let debugMessage = `${identifiers.length} non-blank ${what} values found for geocoding ` + 
        `(${parsedIdentifiers.nUnique} unique)`;
      if(n_blank){
        debugMessage += `, and ${n_blank} blank/null values`
      }
      debugMessage += '.';
      if (parsedIdentifiers.nCached){ debugMessage += 
        ` Of these, ${parsedIdentifiers.nCached} are already cached in the visual and won't be re-requested.`
      }
      this.UIManager.addDebugMessage(debugMessage);
      if (parsedIdentifiers.invalid.length > 0){
        const invalidInputs = restoreOriginalIdentifiers(parsedIdentifiers.invalid, parsedIdentifiers.map)
        this.UIManager
          .addError(`The following identifiers do not appear to be valid postcodes or UPRNs, and won't be sent to \
        the geocoding API for data security reasons: ${invalidInputs}.`);
      }
      let apiCallCompleted = false;
      // Fetch data from the API and use it to populate the cache, which is indexed by clean identifier
      if (parsedIdentifiers.toFetch.length > 0) {
            let esriResponses = await this.batch_geocode_esri(parsedIdentifiers.toFetch, parsedIdentifiers.type);
            if(esriResponses !== null) {apiCallCompleted = true;} 
            if (esriResponses && Object.keys(esriResponses).length){
              cacheNeedsSaving = true;
              this.cache = {...this.cache, ...esriResponses}
        }
      }
      // now build the actual return object by going back over the input and retrieving the values from the cache
      // which is now populated
      // the cache now holds everything that could be retrieved, plus whatever was already there.
      // Now build a result object with keys of clean identifiers and values of locations, for all the cleaned inputs, 
      // by getting the lat/lon from the cache (no matter if we only just fetched it or already had it from 
      // another time)
      let results: PointDictionary = {};
      const cleanedInputs = parsedIdentifiers.cleanedInputs
      const notfound_clean:any[] = [];
      let nFetched: number = 0;
      cleanedInputs.forEach((i:string|number) => {
        if (this.cache[i]) {
          results[i] = this.cache[i];
          if (parsedIdentifiers.toFetch.includes(i)) { nFetched ++}
        }
        else {
          if (parsedIdentifiers.toFetch.includes(i)) {
            notfound_clean.push(i);
            this.cache[i] = null; // null will be treated as an error value so the cache read check
                                  // will skip it next time. But only do this if the API call itself 
                                  // did not error; otherwise we'd want to be able to try those values 
                                  // again later
            cacheNeedsSaving = true
          }
        }
      });
      const notfound_orig = parsedIdentifiers.map ? restoreOriginalIdentifiers(notfound_clean, parsedIdentifiers.map): notfound_clean;
      if (apiCallCompleted && notfound_orig.length > 0) {
        if (notfound_orig.length > 100) {
          let first100 = notfound_orig.slice(0, 100);
          let remaining = notfound_orig.length - first100.length;
          this.UIManager.addError(
            `The following ${what}s failed to return a result from our geocoding API and will not be mapped: ${
              first100.join(", ") + ` + ${remaining} more.`
            }`
          );
        } else {
          this.UIManager.addError(
            `The following ${what} values failed to return a result from our geocoding API and will not be mapped 
            (Please note that we can only geocode to current postcodes/UPRNs, not historical ones): 
            ${notfound_orig.join(", ")}.`
          );
        }
      }
      if(parsedIdentifiers.map){
        results = restoreOriginalIdentifierKeys(results, parsedIdentifiers.map);
      }
      // persist the cache
      if (cacheNeedsSaving) {
        this.UIManager.visual.persistDataToCard("geocodeResults", this.cache);
      }
      const toc = performance.now();

      const geocodeMetrics:GeocodeMetrics = {
        nTotal: parsedIdentifiers.nTotal,
        nUnique: parsedIdentifiers.nUnique,
        nNonNull: parsedIdentifiers.nNonNull,
        nCached: parsedIdentifiers.nCached,
        nInvalid: parsedIdentifiers.invalid.length,
        nToFetch: parsedIdentifiers.toFetch.length,
        nFetched: nFetched,
        elapsed: toc-tic,
        geocodeType: parsedIdentifiers.type
      }

      // clear countdown for displaying progress toast, and remove any visible toast
      clearTimeout(timeoutID);
      this.UIManager.DisplayToastNotification(null);

      return {geocodes: results, metrics: geocodeMetrics};
    }
    
    /**
     * Performs a batch geocoding request to the Esri service for the given identifiers and geocode type.
     * Sends the identifiers to the appropriate Esri endpoint (e.g., postcode or UPRN service),
     * retrieves the geocoded point locations, and returns them as a PointDictionary.
     * Handles batching if the number of identifiers exceeds the service's per-request limit.
     *
     * @param identifiers Array of string or number identifiers to geocode.
     * @param type The geocode type (GeocodeTypes.POSTCODE or GeocodeTypes.UPRN).
     * @returns A promise resolving to a PointDictionary mapping identifiers to [longitude, latitude] pairs.
     * @private
     */
    private async batch_geocode_esri(identifiers: string[] | number[], type: GeocodeTypes): Promise<PointDictionary>{
      let params: GeocodeParams
      let codefield = type === GeocodeTypes.POSTCODE ? "postcode" : "uprn";
      // TODO replace with a parseQueryDetails equivalent
      let url = type === GeocodeTypes.POSTCODE ? postcodeUrl_Esri : uprnUrl_Esri;
      let entity = type === GeocodeTypes.POSTCODE ? "postcodes" : "uprns";
      params = {
        URL: url,
        codefield: codefield,
        codes:identifiers as string[],
        entity:entity
      }
      const in_clause =
       type === GeocodeTypes.POSTCODE
        ? `${params.codefield} IN (` +
          params.codes.map((i) => `'${i.toUpperCase().replace(/\s/g,'')}'`).join(",") +
        ")"
        : `${params.codefield} IN (` +
          params.codes.join(",") +
        ")"
        ;
      const query = esri.query({
        url: params.URL,
      });
      query.where(in_clause);
      query.precision(6);
      query.fields([params.codefield, 'latitude', 'longitude']);
      query.returnGeometry(false);
      
      let maxRecordCount = this.max_feature_counts[type];
      query.limit(maxRecordCount);
      const pageCount = Math.ceil(identifiers.length / maxRecordCount);
      let pageOffsets = [];
      for (let i=0; i<pageCount; i++){
        pageOffsets.push(i * maxRecordCount);
      }
      let allProm = Promise.all(pageOffsets.map(function(resultPageStart){
        query.offset(resultPageStart);
        const queryRun = promisify(query.run).bind(query);
        return queryRun()
      }));
      //const queryrun = promisify(query.run).bind(query);
      let combinedFeatureCollection: FeatureCollection;
      try {
        let paginatedResults = await allProm //queryrun();
        combinedFeatureCollection = paginatedResults.pop();
        paginatedResults.forEach(function(resultFeatureSet){
          Array.prototype.push.apply(combinedFeatureCollection.features, resultFeatureSet.features)
        });
      } catch (error) {
        //console.log(error); // TODO handle properly
        return null; //{n_features: 0, bounds:null};
      }
      let returnDict = {}
      //return res;
      combinedFeatureCollection.features.forEach((feat) => {
        returnDict[feat.properties[params.codefield]] = [feat.properties.longitude, feat.properties.latitude];
      });
      return returnDict
    }
    
    // ***********   Redundant code below this point left in for future reference   *************** //

    /*private async geocode_postcode_osnames(postcode:string):Promise<any>{
          // makes a call to the OS Names API to find (or not) one postcode. Needs to be wrapped in a rate limiter 
          // so we don't get blocked.
          // leaving this in commented, as we may wish to use OS APIs for other things later
          //https://api.os.uk/search/names/v1/find?query=OX17%202LT&fq=local_type:Postcode&maxresults=1&key=APIKEY
          const url = "https://api.os.uk/search/names/v1/find?fq=local_type:Postcode&maxresults=1&key=" + this.apikey + "&query=" + postcode;
          const response  = await fetch(url);
          const result = await response.json();
          return {postcode, result}
    }*/
          
    /* 
      // Performs batch geocoding of postcodes and UPRNs using a custom API, with local validation and error handling.
      // This is currently unused, as we have switched to using Esri services for geocoding, but we may wish to use  
      // something like this in future if we want to call a custom API for geocoding other identifier types, or if 
      // we want to use our own API for postcode/UPRN geocoding instead of Esri's services.
      private async batch_geocode_api(
        
        identifiers: string[] | number[]
      ): Promise<any> {
        const invalid = [];
        const validPostcodes = [];
        const validUprns = [];
        // Check all the identifiers locally to see if they could be valid postcodes or UPRNs, 
        // based on a regular expression for postcodes and "being an integer of <= 12 digits" 
        // for UPRNs. As well as ensuring we don't burden the API or network with long text 
        // data by mistake, this is also important to prevent inadvertent data leakage if the user 
        // drags in the wrong field (e.g. one containing PII) to the field wells. Any such information 
        // will not leave the local client.
        identifiers.forEach((i) => {
          if (this.postcode_checker.test(i)) {
            validPostcodes.push(i);
          } else if (typeof i === "number" || this.isNumeric(i)) {
            let n = parseInt(i);
            if (Number.isInteger(n) && n.toString().length <= 12) {
              validUprns.push(n);
            }
          } else {
            invalid.push(i);
          }
        });
        
        const opts:RequestInit = {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            'x-api-key': this.UIManager.visual.formattingSettings.apiKey,
            'x-visual-id': this.UIManager.visual.visual_id
          },
          body: null,
          cache: "force-cache"
        };
        let postcodeResp, uprnResp;
        if (validPostcodes.length > 0) {
          opts.body = JSON.stringify(validPostcodes);
          postcodeResp = await fetcher(postcodeUrl);
        }
        if (validUprns.length > 0) {
          opts.body = JSON.stringify(validUprns);
          uprnResp = await fetcher(uprnUrl);
        }
        if (
          (postcodeResp && !postcodeResp.apiSuccess) ||
          (uprnResp && !uprnResp.apiSuccess)
        ) {
          //this.UIManager.addError(
        //   "Apologies, our geocoding API is currently unavailable. Try again later or use an alternative like Longitude and Latitude or Easting and Northing."
          //);
          return {
            results: [],
            invalid: invalid,
            error: ["Apologies, our geocoding API is currently unavailable. Try again later or use an alternative like Longitude and Latitude or Easting and Northing."]
          };
        }
        return {
          results: (postcodeResp?.resp || []).concat(uprnResp?.resp || []),
          invalid: invalid,
        };
    
        async function fetcher(url) {
          try {
            const resp = await fetch(url, opts);
            if (resp.ok) {
              return { apiSuccess: true, resp: await resp.json() };
            } else {
              console.log(`API returned ${resp.status} error.`);
              return { apiSucess: true, resp: [] };
            }
          } catch (error) {
            return { apiSuccess: false, resp: [] };
          }
        }
      }
    */
  
  }

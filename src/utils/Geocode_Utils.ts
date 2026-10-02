import * as esri from "esri-leaflet";
import { Feature, FeatureCollection } from "geojson";
import { LatLngBounds } from "leaflet";
import { StringToStringsDict } from "../types/data-types";
import { PointDictionary, GeojsonFeatureDictionary } from "../types/geocoding-types";
import { gss_regex } from "../resources";

export const GSS_CHECKER = new RegExp(gss_regex);

/**
 * Maximum number of codes to place in the "IN (...)" clause of a single query. Measured against the
 * ONS/BoundaryLine ward service and the OS UPRN service (Oct 2026): both accept exactly 4000 codes
 * and reject 4001 with "SQL query is nested too deeply", regardless of how long the clause is. 1000
 * leaves plenty of headroom and, at the concurrency below, was the quickest of the sizes tested.
 */
export const MAX_CODES_PER_QUERY = 1000;

/**
 * Maximum number of characters to allow in the "IN (...)" clause of a single query. The services
 * happily accept far longer clauses than this (48,000 characters tested fine), so this is only a
 * guard against unexpectedly long identifiers, and normally doesn't bind before the code count does.
 */
export const MAX_WHERE_CLAUSE_CHARS = 20000;

/** Number of batched queries to have in flight against a service at any one time. */
export const MAX_CONCURRENT_QUERIES = 4;

/**
 * Checks if the input array is an array of strings.
 * @param arr The array to check.
 * @returns True if the array is a string array, false otherwise.
 */
export function isStringArr(arr: string[] | number[]): arr is string[] {
    return (typeof(arr[0])==="string")
}

/**
 * Checks if the input value is numeric (can be parsed as an integer).
 * @param str The value to check.
 * @returns True if the value is numeric, false otherwise.
 */
export function isNumeric(str) {
    if (typeof str != "string") return false;
    return !isNaN(parseInt(str));
}
  
/**
 * Removes null, undefined, and zero values from an array of identifiers.
 * @param identifiers Array of string or number identifiers.
 * @returns A new array with null, undefined, and zero values removed.
 */
export function removeNullsAndZero(identifiers: string[] | number[]) {
    // this would also remove 0 but there is not a uprn 0 so who cares
    return identifiers.flatMap((x) => (x ? [x] : []));
}

/**
 * For an array of strings, converts each value to uppercase and removes all whitespace.
 * Returns a dictionary mapping each such cleaned value to a list of all the unique "dirty" 
 * input versions that cleaned up to that. Null / empty strings are dropped.
 * @example
 * // returns e.g. { 'SO160AS': ['SO16 0AS', 'so160 as', 'so16 0as   '] }
 * cleanStringIdentifiers(['SO16 0AS', 'so160 as', 'so16 0as   ', 'SO16 0AS', null, ''])
 * @param identifiers Array of string identifiers.
 * @returns Dictionary mapping cleaned identifiers to arrays of original versions.
 */
export function cleanStringIdentifiers(identifiers: string[]): StringToStringsDict {
    identifiers = removeNullsAndZero(identifiers);
    const unique = new Set(identifiers);
    const cleanToDirtyMap: { [key: string]: string[] } = {};
    const cleaned: string[] = [];
    unique.forEach((i) => {
      const clean = `${i.toUpperCase().replace(/\s/g,'')}`
      cleaned.push(clean);
      cleanToDirtyMap[clean]
        ? cleanToDirtyMap[clean].push(i)
        : (cleanToDirtyMap[clean] = [i]);
    });
    return cleanToDirtyMap
}

/**
 * For an array containing "cleaned" strings (strings that have been converted to uppercase and all 
 * spaces removed), returns an array with all the "dirty" versions that were input.
 * @param cleanedIdentifiers Array of cleaned string identifiers.
 * @param cleanToDirtyMap Dictionary mapping cleaned identifiers to arrays of original versions.
 * @returns Array of original (dirty) identifiers.
 */
export function restoreOriginalIdentifiers(cleanedIdentifiers: string[], cleanToDirtyMap: StringToStringsDict) {
    let res = [];
    cleanedIdentifiers.forEach((cleanIdentifier) => {
        const uncleanedVersions = cleanToDirtyMap[cleanIdentifier];
        uncleanedVersions.forEach((originalIdentifier) => {
            res.push(originalIdentifier)
        })
    });
    return res;
}

/**
 * For a dictionary with "cleaned" keys (strings that have been converted to uppercase and all 
 * spaces removed), returns a version of it with one copy of the entry for each "dirty" version of that 
 * key present in the mapping. The reverse of cleanStringIdentifiers.
 * @param geocodeResults Dictionary with cleaned keys (e.g., geocoding results).
 * @param cleanToDirtyMap Dictionary mapping cleaned identifiers to arrays of original versions.
 * @returns Dictionary with original (dirty) keys.
 */
export function restoreOriginalIdentifierKeys(
    geocodeResults: PointDictionary | GeojsonFeatureDictionary, 
    cleanToDirtyMap: StringToStringsDict
) {
    let res = {};
    Object.keys(geocodeResults).forEach((cleanIdentifier) => {
        const uncleanedIdentifiers = cleanToDirtyMap[cleanIdentifier];
        uncleanedIdentifiers.forEach((originalIdentifier) => {
        res[originalIdentifier] = geocodeResults[cleanIdentifier]
        })
    });
    return res;
}

/** 
 * From an array of GeoJSON features, extracts all property names across all features.
 * @param loadedData Array of GeoJSON features.
 * @returns Sorted array of all unique property keys.
 */
export function getAllColumns(loadedData:Feature[]): string[]{
    let allProps = new Set<string>();   
    loadedData.forEach((feat) => {
        if(feat.properties){
            Object.keys(feat.properties).forEach((prop) => {
                allProps.add(prop);
            });
        }
    });
    return Array.from(allProps).sort();    
}

/**
 * For each feature in the array, and for each property, find which properties are unique across all features
 * and therefore could be used as an identifier field
 * @param loadedData 
 * @returns 
 */
export function getUniqueColumns(loadedData:Feature[]): string[]{
        let propertyCounts: {[key:string]: Set<string>} = {};
        loadedData.forEach((feat) => {
            if(feat.properties){
                Object.keys(feat.properties).forEach((prop) => {
                    const value = feat.properties[prop];
                    if(!propertyCounts[prop]){
                        propertyCounts[prop] = new Set<string>();
                    }
                    propertyCounts[prop].add(value);
                });
            }
        });
        let uniqueProps: string[] = [];
        let nFeatures = loadedData.length;
        Object.keys(propertyCounts).forEach((prop) => {
            if(propertyCounts[prop].size === nFeatures){
                uniqueProps.push(prop);
            }
        });
        return uniqueProps;
    }

/**
 * Splits a list of codes into batches that are small enough to be safely used in the "IN (...)"
 * clause of a single query. ArcGIS Online services return an error rather than a paged result when
 * the where clause gets too long, so we have to batch the codes client-side rather than relying on
 * server-side pagination. Duplicate codes are removed.
 * @param codes The codes to be split into batches.
 * @param maxCodesPerBatch Maximum number of codes in a batch.
 * @param maxCharsPerBatch Maximum estimated length, in characters, of the clause for a batch.
 * @returns An array of code batches.
 */
export function batchCodes<T extends string | number>(
    codes: T[],
    maxCodesPerBatch: number = MAX_CODES_PER_QUERY,
    maxCharsPerBatch: number = MAX_WHERE_CLAUSE_CHARS
): T[][] {
    const batches: T[][] = [];
    let current: T[] = [];
    let currentChars = 0;
    Array.from(new Set(codes)).forEach((code) => {
        const codeChars = String(code).length + 3; // allow for the quotes and separating comma
        const full = current.length >= maxCodesPerBatch || currentChars + codeChars > maxCharsPerBatch;
        if (current.length && full) {
            batches.push(current);
            current = [];
            currentChars = 0;
        }
        current.push(code);
        currentChars += codeChars;
    });
    if (current.length) { batches.push(current); }
    return batches;
}

/**
 * Creates an Error with the name used by the fetch/AbortController convention, so that callers can
 * tell a cancelled operation apart from a genuine failure.
 * @param message Optional message for the error.
 * @returns An Error named "AbortError".
 */
export function abortError(message: string = "Operation aborted"): Error {
    const err = new Error(message);
    err.name = "AbortError";
    return err;
}

/**
 * Checks whether an unknown thrown value represents a cancelled operation.
 * @param error The caught value.
 * @returns True if the value represents an abort.
 */
export function isAbortError(error: unknown): boolean {
    return !!error && (error as { name?: string }).name === "AbortError";
}

/**
 * Converts the error argument given by an esri-leaflet callback (a plain object with code and
 * message properties) into a standard Error with a readable message.
 * @param error The error reported by esri-leaflet.
 * @param context Description of what was being attempted, included in the message.
 * @returns An Error describing the failure.
 */
function asQueryError(error: any, context: string): Error {
    if (error instanceof Error) { return error; }
    const code = error && error.code ? ` (code ${error.code})` : "";
    const message = (error && error.message) || "unknown error";
    return new Error(`Error ${context}: ${message}${code}`);
}

/**
 * Promisified version of esri.Query.count which rejects with a readable Error on failure.
 * @param query The Esri query object.
 * @returns A promise resolving to the number of matching features.
 */
export function countEsriQuery(query: esri.Query): Promise<number> {
    return new Promise<number>((resolve, reject) =>
        query.count((error: any, count: number) =>
            error ? reject(asQueryError(error, "counting features")) : resolve(count)
        )
    );
}

/**
 * Promisified version of esri.Query.bounds which rejects with a readable Error on failure.
 * @param query The Esri query object.
 * @returns A promise resolving to the bounds of the matching features.
 */
export function boundsEsriQuery(query: esri.Query): Promise<LatLngBounds> {
    return new Promise<LatLngBounds>((resolve, reject) =>
        query.bounds((error: any, bounds: LatLngBounds) =>
            error ? reject(asQueryError(error, "retrieving feature bounds")) : resolve(bounds)
        )
    );
}

/**
 * Runs a single page of a query, returning the features along with the service's own report of
 * whether there are more records to come.
 * @param query The Esri query object.
 * @returns A promise resolving to the page's features and the service's exceededTransferLimit flag,
 * which is undefined if the service didn't report one.
 */
function runEsriQueryPage(query: esri.Query): Promise<{ features: Feature[], moreAvailable: boolean }> {
    return new Promise((resolve, reject) =>
        query.run((error: any, featureCollection: FeatureCollection, response: any) => {
            if (error) {
                reject(asQueryError(error, "retrieving features"));
                return;
            }
            // esri-leaflet gives us the raw service response as its third argument; services which
            // support pagination set exceededTransferLimit on it (older ones put it on properties)
            const more = response && (response.exceededTransferLimit !== undefined
                ? response.exceededTransferLimit
                : response.properties && response.properties.exceededTransferLimit);
            resolve({
                features: (featureCollection && featureCollection.features) || [],
                moreAvailable: more
            });
        })
    );
}

/**
 * Runs a single query, requesting successive pages of results until the service tells us there are
 * no more. Paging this way avoids having to run a separate count query first. If the service does
 * not report whether more records are available we fall back to assuming that a page shorter than
 * the one we asked for is the last one - note that this is only reliable if the service's own
 * maxRecordCount is at least as large as the requested page size.
 * @param query The Esri query object, which will be mutated to set its limit and offset.
 * @param pageSize Number of features to request per page.
 * @param signal Optional abort signal, checked between pages.
 * @returns A promise resolving to all the features returned by the query.
 */
export async function runEsriQueryPaged(
    query: esri.Query,
    pageSize: number,
    signal?: AbortSignal
): Promise<Feature[]> {
    const features: Feature[] = [];
    let offset = 0;
    query.limit(pageSize);
    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (signal && signal.aborted) { throw abortError(); }
        query.offset(offset);
        const page = await runEsriQueryPage(query);
        Array.prototype.push.apply(features, page.features);
        if (!page.features.length) { break; } // nothing more to fetch, and guards against looping forever
        const moreToCome = page.moreAvailable === undefined
            ? page.features.length >= pageSize
            : page.moreAvailable;
        if (!moreToCome) { break; }
        offset += page.features.length;
    }
    return features;
}

/**
 * Runs the given asynchronous tasks a few at a time, so that batching a large request doesn't
 * result in hundreds of simultaneous calls to a service.
 * @param taskFactories Functions which each start one task when called.
 * @param signal Optional abort signal, checked before each group of tasks is started.
 * @param maxConcurrent Maximum number of tasks to have running at once.
 * @returns A promise resolving to the task results, in the order the tasks were given.
 */
export async function runWithConcurrencyLimit<T>(
    taskFactories: (() => Promise<T>)[],
    signal?: AbortSignal,
    maxConcurrent: number = MAX_CONCURRENT_QUERIES
): Promise<T[]> {
    const results: T[] = [];
    for (let i = 0; i < taskFactories.length; i += maxConcurrent) {
        if (signal && signal.aborted) { throw abortError(); }
        const group = taskFactories.slice(i, i + maxConcurrent).map((task) => task());
        Array.prototype.push.apply(results, await Promise.all(group));
    }
    return results;
}

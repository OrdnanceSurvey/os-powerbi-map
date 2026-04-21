import { Feature } from "geojson";
import { StringToStringsDict } from "../types/data-types";
import { PointDictionary, GeojsonFeatureDictionary } from "../types/geocoding-types";
import { gss_regex } from "../resources";

export const GSS_CHECKER = new RegExp(gss_regex);

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

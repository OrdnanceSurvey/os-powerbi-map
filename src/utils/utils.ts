import {Md5} from 'ts-md5';

/**
 * Creates an MD5 hash of the given object (as a string or buffer).
 * @param object The object or string to hash.
 * @returns {string} The MD5 hash as a hexadecimal string.
 */
export function createHash(object){
    const md5 = new Md5();
    const msgUint8 = new TextEncoder().encode(object); // encode as (utf-8) Uint8Array
    md5.appendByteArray(msgUint8);
    // Generate the MD5 hex string
    const hash:string = md5.end(false) as string;
    return hash
}

/**
 * Determines whether a Power BI DataView has a filter applied.
 * @param dataview The Power BI DataView to check.
 * @returns {boolean} True if a data filter is applied, false otherwise.
 */
export function isDataviewFiltered(dataview:powerbi.DataView):boolean{
  if ('isDataFilterApplied' in dataview.metadata){
    return dataview.metadata.isDataFilterApplied as boolean;
  }
  return false;
}

/**
 * Rounds a numeric value to a specified number of decimal places and returns it as a string.
 * @param val The value to round.
 * @param dp The number of decimal places.
 * @returns {string} The rounded value as a string.
 */
export function roundToStr(val, dp){
  return (Math.round((val + Number.EPSILON) * Math.pow(10,dp)) / Math.pow(10, dp)).toString()
}

import proj4 from 'proj4';
import { CRSUnits, FeatureWithCrs } from '../types/geocoding-types';

//** Find out if possible, and otherwise attempt to guess, whether units of a CRS are degrees or meters */
export function getCRSUnits(geojson: FeatureWithCrs): CRSUnits {
  const crsName = geojson.crs?.properties?.name;

  if (crsName) {
    const def = proj4.defs(crsName);
    if (!def) {
      console.warn(`CRS definition not found for: ${crsName}`);
      //return CRSUnits.UNKNOWN;
    }
    else if (def.units === 'degrees') return CRSUnits.DEGREES;
    else if (def.units === 'meters' || def.units === 'm') return CRSUnits.METERS;
    //if (!def.units) return CRSUnits.UNKNOWN;
    //return CRSUnits.UNKNOWN;
  }
  else {
    // guess whether feature coordinates are in lat/lon or projected by checking the range of the first coordinate
    let firstCoord, firstGeometry;
    if (geojson.geometry.type === 'GeometryCollection' && geojson.geometry.geometries.length > 0) {
        console.warn('GeometryCollection found, using first geometry for CRS unit check');
        firstGeometry = geojson.geometry.geometries[0] || null;
    }
    else{
      firstGeometry = geojson.geometry;
    }
    if (firstGeometry.type === 'Polygon' || firstGeometry.type === 'MultiLineString') {
        firstCoord = firstGeometry.coordinates[0][0];
    } else if (firstGeometry.type === 'MultiPolygon') {
        firstCoord = firstGeometry.coordinates[0][0][0];
    } else if (firstGeometry.type === 'Point') {
        firstCoord = firstGeometry.coordinates;
    } else if (firstGeometry.type === 'MultiPoint' || firstGeometry.type === 'LineString') {
        firstCoord = firstGeometry.coordinates[0];
    } else {
      firstCoord = null;
    }
    let isLatLon = false;
    if (firstCoord && Array.isArray(firstCoord) && firstCoord.length === 2) {
        const [lng, lat] = firstCoord;
        isLatLon = (lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90);
    }
    
    return isLatLon ? CRSUnits.DEGREES : CRSUnits.METERS;
  }
  
  
}

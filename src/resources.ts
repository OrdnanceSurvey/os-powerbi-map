import {createHash} from './utils/utils';
import pbiviz from "../pbiviz.json"

/**
 * Contains resource constants and utility functions for the OS Power BI visual.
 * Includes URLs, color palettes, and other static resources.
 */
export const visualVersion = pbiviz.visual.version;
// connection string we insert in at build
export const APP_INSIGHTS_CONNECTION_STRING = '{{APP_INSIGHTS}}';

// ******* Visual ID and expiry date handling logic *******
// Supports building visuals which have an in-built expiry date and/or a specific ID set 
// at compile time (such an ID can be used for authorisation purposes at visual load by calling an API which 
// returns a boolean indicating if that build is authorised). To use this functionality, a build script 
// can overwrite these placeholders at build time, but if they are not overwritten (i.e. if the 
// visual is built directly using pbiviz package or if the debug version is run), then the visual 
// will still work as in the open source released builds.) A python build script is included in the 
// repo to automate the process of building visuals with varying IDs and expiry dates; alternatively 
// this can be done via a github CI flow  or by editing the placeholders manually.

// These two lines may be modified by the python build script just before the webpack build...
let visual_id_placeholder = '{{VISUAL_ID}}';
let exp_date_placeholder = '{{EXPIRY_DATE}}';
// ... but if they have not been (because we have built the visual manually or are running 
// the debug version), then we still need to function. We need to export consts VISUAL_ID
// and EXPIRY_DATE below (which will be used by the authorisation code to check if this visual is 
// already authorised or if an API call should be made to check authorisation).
// If, in the transpiled code from webpack, the placeholder variables above are not 
// equal to the placeholder values we can see above in this source code, then the post-build 
// script has changed them so those are what we want to export. If in the transpiled code 
// they ARE equal to the the placeholder values then we need to replace them at _runtime_ with 
// "safe" values so the code can run if it has been built by pbiviz_package but not modified 
// by our post-build script.
// But there is a catch! We can't just do this: 
// export const VISUAL_ID = visual_id_placeholder === '{{VISUAL_ID}} ? 'safe_value' : visual_id_placeholder
// Because webpack / terser recognises that's going to be always true based on code as written and 
// will optimise it away so that it just sets VISUAL_ID = 'safe_value'. So we have to trick it so that the 
// conditional checks remain in the optimised code. 
// We do this by doing some operations on the placeholder variables that webpack can't evaluate at build time, 
// but which will still give us the information we need at runtime to know if the post-build script has modified them or not.
const parsed_date = (new Date(Date.parse(exp_date_placeholder))).toString()
// trick webpack by doing a date parse and looking at the result, it can't evaluate this
export const EXPIRY_DATE = parsed_date === "Invalid Date"
  ? '2099-12-31'
  : exp_date_placeholder;
// trick webpack by doing a hash and comparing the results to the hash of the original placeholder value
export const VISUAL_ID = createHash(visual_id_placeholder) === '54e4e5122f27d258efc2068c2ec9e582' 
  ? 'OPEN_SOURCE'
  : visual_id_placeholder
// ******* End of visual ID and expiry date handling logic *******

// Regex patterns for validating postcodes and hex color codes
export const postcode_regex =
  "^([A-Za-z][A-Ha-hJ-Yj-y]?[0-9][A-Za-z0-9]? {0,}[0-9][A-Za-z]{2}|[Gg][Ii][Rr] ?0[Aa]{2})$";

export const hexColourRegex = 
  "^#(([0-9a-fA-F]{2}){3,4}|([0-9a-fA-F]){3,4})$"
  
export const gss_regex = "^[EWSN][0-9]{8}$";

// SAS token expires 12/7/2026
/**
 * The URL for the CSV file containing the current ArcGIS Service URLs on the government / ONS Geoportal to be used for polygon geocoding of GSS codes
 */
export const service_urls_url = 
  "https://gdisquadstorage.file.core.windows.net/os-powerbi-visual-storage/service_urls.json?sv=2022-11-02&ss=bfqt&srt=o&sp=r&se=2026-07-12T20:02:36Z&st=2024-07-12T12:02:36Z&spr=https&sig=UZRNlmjaZd4lQpuHeX5iqVCth3xXjzKXrV3Ebqh5eH8%3D"
export const internal_boundaryline_url = 
 "https://osvm1764.ordsvy.gov.uk:6443/arcgis/rest/services/Hosted/powerbi_boundaries/FeatureServer/4";

export const postcodeUrl = "https://os-powerbi-api.azurewebsites.net/postcodes";
export const uprnUrl = "https://os-powerbi-api.azurewebsites.net/uprns";
export const authUrl = "https://os-powerbi-api.azurewebsites.net/auth";

export const postcodeUrl_Esri = "https://services5.arcgis.com/piNGxor37zqmvRAm/arcgis/rest/services/codepoint_open/FeatureServer/0";
export const uprnUrl_Esri = "https://services5.arcgis.com/piNGxor37zqmvRAm/arcgis/rest/services/open_uprn/FeatureServer/0";
export const ONS_ESRI_ATTRIB = "Polygon features source: Office for National Statistics licensed under the Open Government Licence v.3.0 | Powered by ESRI"
export function GET_OS_ATTRIB(){
  const year = (new Date()).getFullYear().toString();
  return `Contains OS data &copy Crown copyright and database rights ${year} <em class="terms">(Terms)</em>`;
}

// Colour palettes for the visual
export const colours: Record<string, string> = {
  GREYSTONE_NEUTRAL: '#666666',
  YELLOW_HOVER: '#FFC20E',
  CYAN_SELECT: '#00FFFF',
  NULLVALUES: '#333333',
  DARKNEUTRAL: '#222222'
}

export const palettes: Record<string, string[]> = {
  os_gdv: ["#FF1F5B", "#00CD6C","#009ADE","#AF58BA","#FFC61E","#F28522","#A0B1BA","#A6761D","#E9002D","#FFAA00","#00B000","#C40F5B","#FD8D3C","#089099"],
  os_gdv_8: ["#FF1F5B", "#00CD6C","#009ADE","#AF58BA","#FFC61E","#F28522","#A0B1BA","#A6761D"],
  colourbrewer_12_1: ['#a6cee3','#1f78b4','#b2df8a','#33a02c','#fb9a99','#e31a1c','#fdbf6f','#ff7f00','#cab2d6','#6a3d9a','#ffff99','#b15928'],
  colorbrewer_12_2: ['#8dd3c7','#ffffb3','#bebada','#fb8072','#80b1d3','#fdb462','#b3de69','#fccde5','#d9d9d9','#bc80bd','#ccebc5','#ffed6f']
}
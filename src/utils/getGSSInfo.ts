import { service_urls_url } from "../resources";
import { GSSServiceDetails } from "../types/geocoding-types";
import localData from "../service_urls.json"

/**
 * Fetches GSS (Government Statistical Service) entity descriptions from a remote file.
 * This allows us to have deployed visuals automatically display the most up-to-date geoservice 
 * details in the info/help pane.
 * Falls back to a local JSON file if the fetch fails.
 * @returns A promise resolving to an array of objects, each containing an Entity name and its Prefixes.
 */
export async function fetchGSSDescriptions(): Promise<{ Entity: string, Prefixes: string[] }[]> {
    const data = await fetchGSSServices();
    return processGSSData_Descriptions(data);
}

/**
 * Fetches GSS (Government Statistical Service) service details from a remote file.
 * This allows us to have deployed visuals automatically use the most up-to-date geoservices for each 
 * GSS type as ONS continually update their services, with each new version having a new URL and identifier 
 * column name.
 * Falls back to a local JSON file if the fetch fails.
 * @returns A promise resolving to an array of GSSServiceDetails.
 */
export async function fetchGSSServices(): Promise<GSSServiceDetails[]>{
    try {
        // attempt to load the service urls config from the well known location to get most up to date
        // information
        const response = await fetch(service_urls_url);
        if (!response.ok) {
            throw new Error("Initial fetch failed");
        }
        const data = await response.json();
        return data
    } catch (error) {
        console.log("Fetching GSS services from local JSON file due to error:", error);
        return localData;
    }
}

/**
 * Groups GSS data by entity and collects their prefixes, including country information.
 * @param data Array of objects with Prefix, Entity, and Country fields.
 * @returns An array of objects, each containing an Entity name and its Prefixes.
 * @private
 */
function processGSSData_Descriptions(
    data: { Prefix: string, Entity: string, Country: string }[]
): { Entity: string, Prefixes: string[] }[] {
    let groupedData = data.reduce((acc: any, urlObj: { Prefix: string, Entity: string, Country: string }) => {
        if (!acc[urlObj.Entity]) {
            acc[urlObj.Entity] = {
                Entity: urlObj.Entity,
                Prefixes: []
            };
        }
        acc[urlObj.Entity].Prefixes.push(`${urlObj.Country} - ${urlObj.Prefix}`);
        return acc;
    }, {});

    return Object.values(groupedData);
}



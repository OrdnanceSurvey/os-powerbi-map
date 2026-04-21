import { Feature, FeatureCollection } from "geojson"
import { parse } from "geojson-precision"
import simplify from "@turf/simplify";
import kinks from "@turf/kinks";
import buffer from "@turf/buffer";
import {LineString, MultiLineString, Polygon, MultiPolygon } from "geojson";
import { getCRSUnits } from "./utils";
import { CRSUnits } from "../types/geocoding-types";

interface SimplificationResult {
    result: Feature;
    status: "Success" | "Fixed" | "Failed";
}
export class GeojsonOptimizer {
    private dp_meters: number = 2; // decimal places for rounding coordinates in meters
    private dp_degrees: number = 6; // decimal places for rounding coordinates in degrees
    private tolerance_meters: number = 0.5; // simplification tolerance in meters
    private tolerance_degrees: number = 0.0000045; // simplification tolerance in degrees (~0.5m at equator)

    constructor(dp_meters?: number, dp_degrees?: number, tolerance_meters?: number, tolerance_degrees?: number) {
        if (dp_meters) this.dp_meters = dp_meters;
        if (dp_degrees) this.dp_degrees = dp_degrees;
        if (tolerance_meters) this.tolerance_meters = tolerance_meters;
        if (tolerance_degrees) this.tolerance_degrees = tolerance_degrees;
    }

    private reducePrecision(data: Feature, isLatLon: boolean): Feature {
        const dp = isLatLon ? this.dp_degrees : this.dp_meters;
        return parse(data, dp);
    }

    private simplifyData(data: Feature, isLatLon:boolean): SimplificationResult {
        const tolerance = isLatLon ? this.tolerance_degrees : this.tolerance_meters;
        try {
            return { result: simplify(data, { tolerance, highQuality: false }), status: "Success" };
        } catch (e) {
            data = this.fixGeometryIssues(data);
            try {
                return { result: simplify(data, { tolerance, highQuality: false }), status: "Fixed" };
            } catch (e) {
                console.warn('Failed to simplify geometry:', e.message);
                return { result: data, status: "Failed" }; // return original if simplification fails
            }
        }
    }
    
    private fixGeometryIssues(data: Feature): Feature {
        // Implement any geometry fixing logic here if needed.
        // For now, just a basic self-intersection check and buffer fix for polygons, which are common 
        // issues that can cause simplification to fail.
        const geomType = data.geometry.type;
        if (
            geomType === "LineString" ||
            geomType === "MultiLineString" ||
            geomType === "Polygon" ||
            geomType === "MultiPolygon"
        ) {
            const kinksResult = kinks(data as Feature<
                LineString | MultiLineString | Polygon | MultiPolygon, { [name: string]: any }
            >);
            if (kinksResult.features.length > 0) {
                console.warn(`Geometry has ${kinksResult.features.length} self-intersections, attempting to fix...`);
                try {
                    const buffered = buffer(data, 0, { units: 'meters' });
                    return buffered;
                } catch (e) {
                    console.error('Failed to fix geometry: ', e);
                    return data; // return original if fixing fails
                }
            }
        }
        return data;
    }

    public optimizeFeature(feature: Feature): { optimizedFeature: Feature; simplificationStatus: string } {
        const crsUnits = getCRSUnits(feature);
        const isLatLon = crsUnits === CRSUnits.DEGREES;
        let optimizedFeature = this.reducePrecision(feature, isLatLon);
        const simplificationResult = this.simplifyData(optimizedFeature, isLatLon);
        optimizedFeature = simplificationResult.result;
        return { optimizedFeature, simplificationStatus: simplificationResult.status };
    }

    public reprojectData(data: FeatureCollection, targetCRS: string): FeatureCollection {
        // Implement a reprojection algorithm here if needed.
        // For now, we return the data as is.
        return data;
    }

  /*   public autoSimplify(data: Feature, isLatLon: boolean): Feature {
        // estimate a tolerance based on the average spacing of vertices in the geometry. 
        // Use 2x the average vertex spacing as the tolerance for simplification.
        if (data.geometry.type === 'GeometryCollection' && data.geometry.geometries.length > 0) {
            console.warn('GeometryCollection found, using first geometry for autoSimplify');    
            data = { ...data, geometry: data.geometry.geometries[0] };
        }
        let totalDistance = 0;
        let totalPoints = 0;   
        // get the total length/perimeter of the geometry using turf.length, and the total number of points. Skip if not a LineString or Polygon
        if (data.geometry.type === 'LineString') {  
            const coords = data.geometry.coordinates as number[][];

    } */
    
}
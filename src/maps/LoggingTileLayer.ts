import L from "leaflet";
import { LogDataProvider, LogRecordTypes } from "../logging/LoggingTypes";

/**
 * An extension of L.TileLayer that tracks how many tiles are created at each zoom level and
 * provides this information via getLogInfo. Counts are reset each time getLogInfo is called.
 */
export class LoggingTileLayer extends L.TileLayer implements LogDataProvider {
    /** Tracks the number of tile requests by zoom level, plus totals and uncached counts. */
    private requestCountsByZoomLevel: Record<number | string, number> = {};
    /** Flag to reset counts on the next tile creation. */
    private resetCountsNext: boolean = false;

    /**
     * Creates a tile and tracks tile requests by zoom level and cache status.
     * @param coords The tile coordinates.
     * @param done The callback to call when the tile is ready.
     * @returns The created HTML element for the tile.
     */
    protected createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
        const url = this.getTileUrl(coords);
        const alreadyCached = this.isCached(url);
        const htmlElement = super.createTile(coords, done);
        const zoom = this._getZoomForUrl();
        if (this.resetCountsNext) {
            this.requestCountsByZoomLevel = {};
            this.resetCountsNext = false;
        }
        if (zoom in this.requestCountsByZoomLevel) {
            this.requestCountsByZoomLevel[zoom] += 1;
        } else {
            this.requestCountsByZoomLevel[zoom] = 1;
        }
        if ("total" in this.requestCountsByZoomLevel) {
            this.requestCountsByZoomLevel["total"] += 1;
        } else {
            this.requestCountsByZoomLevel["total"] = 1;
        }
        if (!("uncached" in this.requestCountsByZoomLevel)) {
            this.requestCountsByZoomLevel["uncached"] = 0;
        }
        if (!alreadyCached) {
            this.requestCountsByZoomLevel["uncached"] += 1;
        }
        return htmlElement;
    }

    /**
     * Checks if a tile image is already cached by the browser.
     * Note: This method may only detect memory cache, not disk cache.
     * @param src The image source URL.
     * @returns True if the image is cached, false otherwise.
     */
    private isCached(src): boolean {
        // THIS DOESN'T REALLY WORK: I think it only recognises when image is in memory cache not disk cache. It doesn't
        // stay in memory cache for more than a second or two.
        const img = new Image();
        img.src = src;
        const complete = img.complete;
        img.src = "";
        return complete;
    }

    /**
     * Returns an object representing the counts of tiles requested since the last call at each zoom level.
     * The object includes per-zoom counts, a total, and an uncached count (this being the number actually 
     * requested from the API).
     * Example:
     * {
     *   1: 73,
     *   2: 56,
     *   3: 287,
     *   total: 416,
     *   uncached: 228
     * }
     * Only zoom levels where a non-zero amount of tiles have been requested will be present.
     * @returns An object with tile request counts.
     */
    getLogInfo() {
        this.resetCountsNext = true;
        return this.requestCountsByZoomLevel;
    }

    /**
     * Returns the metric name for logging.
     * @returns The LogRecordTypes enum value for map requests.
     */
    getMetricName(): LogRecordTypes {
        return LogRecordTypes.MAP_REQUEST;
    }
}
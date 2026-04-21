/**
 * Wraps a Leaflet LatLngBounds object and provides a method to export the bounds 
 * as a WKT string in a format that is suitable for logging.
 */
export class LoggableBounds {
    /** The underlying Leaflet LatLngBounds instance. */
    private bounds: L.LatLngBounds;

    /**
     * Constructs a LoggableBounds instance.
     * @param normalBounds The initial Leaflet LatLngBounds.
     */
    constructor(normalBounds: L.LatLngBounds) {
        this.bounds = normalBounds;
    }

    /**
     * Extends the current bounds to include the given bounds.
     * @param extraBounds The bounds to extend with.
     */
    extend(extraBounds: L.LatLngBounds) {
        this.bounds.extend(extraBounds);
    }

    /**
     * Returns the bounds as a WKT (Well-Known Text) POLYGON string.
     * @returns {string} The WKT POLYGON representation of the bounds.
     */
    getWktString() {
        return `POLYGON((
            ${this.bounds.getWest()} ${this.bounds.getSouth()},
            ${this.bounds.getWest()} ${this.bounds.getNorth()},
            ${this.bounds.getEast()} ${this.bounds.getNorth()},
            ${this.bounds.getEast()} ${this.bounds.getSouth()},
            ${this.bounds.getWest()} ${this.bounds.getSouth()}
            ))`.replace(/\s+/g, ' ').trim();
    }
}
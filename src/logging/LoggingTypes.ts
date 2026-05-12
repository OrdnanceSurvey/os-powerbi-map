/**
 * Represents a single log record for the visual, capturing session, API, and metric details.
 */
export class LogRecord {
    /// Global-level things on the log record, to be set by the visual whne sending the record 
    /** Unique session identifier for the log record. */
    public sessionId: string;
    /** The API key in use when the log was created. */
    public apiKey: string;
    /** Whether the visual was in edit mode when the log was created. */
    public isEditMode: boolean;
    /** The version number of the visual */
    public version: string;
    /** The update identifier for the log record. */
    public updateId: string;

    /// Log entry details, to be set by the log creator
    /** Timestamp of when the log was created. */
    public logTime: Date;
    /** The main log entry payload (can be any type). */
    public logEntry: any;
    /** The type of metric/event being logged. */
    public metric: LogRecordTypes;
    
}

/**
 * Enum of supported log record types (metrics/events) for the visual.
 */
export enum LogRecordTypes {
    MAP_REQUEST = "Map Request",           /**< Map tile or view request */
    API_KEY_CHANGE = "API Key Change",     /**< API key was changed */
    VISUAL_LOAD = "Visual Load",           /**< Visual loaded */
    UPRN_GEOCODE = "UPRN Geocode",         /**< UPRN geocoding operation */
    POSTCODE_GEOCODE = "Postcode Geocode", /**< Postcode geocoding operation */
    LONLAT_POINTS_ADDED = "Lon/lat points added", /**< Points added by longitude/latitude */
    //BNG_POINTS_ADDED,
    ONS_GEOCODE = "ONS Geocode",           /**< ONS (GSS) geocoding operation */
    REFERENCE_LAYER = "Reference Layer",   /**< Reference layer added or changed */
    USER_GEOM_ADDED = "User Geometry added",/**< User geometry added */
    DATA_UPLOAD_SUCCESS = "Data Upload",         /**< User data upload operation */
    DATA_UPLOAD_FAILURE = "Data Upload Failure",         /**< User data upload operation failure */
    UPLOADED_DATA_GEOCODE = "Uploaded Data Geocode",/**< Uploaded data geocoding operation */
    UPLOADED_DATA_UNMATCHED_DISPLAYED = "Uploaded Data Unmatched Displayed",/**< Uploaded data unmatched records displayed */
    CRS_LOAD_SUCCESS = "CRS Load Success",   /**< Coordinate Reference System load operation */
    CRS_LOAD_FAILURE = "CRS Load Failure",   /**< Coordinate Reference System load operation */
}

/**
 * Formats log records for export, e.g., to CSV.
 */
export class LogFormatter {
    /**
     * Exports a log record as a delimited CSV string.
     * @param lr The log record to export.
     * @returns The log record as a CSV string.
     */
    exportToCsv(lr: LogRecord): string {
        // might need to add a newline to this
        return `${lr.metric}|${lr.logTime}|${lr.apiKey}|${lr.sessionId}|${lr.updateId}|${lr.isEditMode}|${lr.logEntry}`;
    }
}

/**
 * Interface for classes that can send log records.
 */
export interface LogWriter {
    /**
     * Sends a log record.
     * @param LogRecord The log record to send.
     */
    sendLogRecord(LogRecord): void;
}

/**
 * Interface for classes that provide log data and metric names.
 */
export interface LogDataProvider {
    /**
     * Returns an object containing log information.
     */
    getLogInfo(): {};
    /**
     * Returns the metric name for the log.
     */
    getMetricName(): LogRecordTypes;
}

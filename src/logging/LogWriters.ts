import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { LogFormatter, LogRecord, LogWriter } from "./LoggingTypes";
import { APP_INSIGHTS_CONNECTION_STRING } from "../resources";

/**
 * LogWriter implementation that sends log records to Azure Application Insights.
 */
export class AppInsightsLogger implements LogWriter {
  /** The Application Insights instance. */
  private appInsights;

  /**
   * Constructs an AppInsightsLogger and initializes Application Insights.
   */
  constructor() {
    this.appInsights = new ApplicationInsights({
      config: {
        // TODO: Move the connection string to a resources file
        connectionString:
          APP_INSIGHTS_CONNECTION_STRING,
        /* ...Other Configuration Options... */
      },
    });
    this.appInsights.loadAppInsights();
    this.appInsights.trackPageView();
  }

  /**
   * Sends a log record to Application Insights as a custom event.
   * @param lr The log record to send.
   */
  sendLogRecord(lr: LogRecord): void {
    this.appInsights.trackEvent({
      name: "Power BI Visual Log",
      properties: Object.assign({}, lr),
    });
  }
}

/**
 * Prototype LogWriter implementation that formats log records as CSV and (intended to) appends them to 
 * a blob storage. Not complete.
 */
export class CsvBlobLogger implements LogWriter {
  /** Formatter for converting log records to CSV text. */
  textLogFormatter: LogFormatter;
  /** The last session ID used for blob naming. */
  lastSessionId: string;
  /** The current blob PUT URL for appending log content. */
  currentBlobPutUrl: string;

  /**
   * Constructs a CsvBlobLogger and initializes the log formatter.
   */
  constructor() {
    this.textLogFormatter = new LogFormatter();
    this.lastSessionId = "";
  }

  /**
   * Formats a log record as CSV and (intended to) appends it to a blob via REST API.
   * Handles blob naming and session changes.
   * @param lr The log record to send.
   */
  sendLogRecord(lr: LogRecord): void {
    // figure out the blob we need to write to based on the sessionID (has the old one expired, need to start a new one after 1 hour)
    if (lr.sessionId != this.lastSessionId) {
      // TODO maybe close / "seal" the previous blob if there was one 
      // (but if that is necessary what will happen when the visual just closes rather than timing out.. I hope it isn't)

      this.lastSessionId = lr.sessionId;
      // TODO create a new appendblob named with the new session id, write a header line?
      this.currentBlobPutUrl = "URL WE JUST CREATED SOMEHOW"
    }

    // format the record via textLogFormatter
    const textContent = this.textLogFormatter.exportToCsv(lr);

    // TODO append the text to the blob via put request to REST URL including a hard-coded SAS token
    // appendContentToBlob(this.currentBlobPutUrl, textContent)
  }
}
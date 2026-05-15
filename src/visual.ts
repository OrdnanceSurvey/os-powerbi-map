"use strict";
import "./../style/visual.less";
import "./../node_modules/leaflet/dist/leaflet.css";
import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
// Supports weights 100-900
import '@fontsource-variable/hanken-grotesk';
import "./ui/spinner";
import "leaflet-lasso";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.extensibility.ISelectionId;
import IVisualEventService = powerbi.extensibility.IVisualEventService;

import { ParsedCardSettingsWrapper, Layers } from "./settings/PowerBISettings";

import proj4 from "proj4";
import L from "leaflet";
import "./utils/proj4leaflet";
import { isEqual } from "lodash";

import { ColourValueTypes } from "./types/carto-types";
import { ControlDisplayStatus, VisualStatus } from "./datamodels/SettingsStateProcessors";
import { OSMapsParsedTable } from "./datamodels/osmaps-parsed-table";
import { OSMapsCartographicFeatureCollection} from "./datamodels/osmaps-feature-collection";
import { SettingsChangeTypes } from "./datamodels/SettingsStateProcessors";
import { ostn15_osgb_to_etrs_lite } from "./ostn_lite";
import { OSPowerBIUIManager } from "./ui/uimanager"
import { VisualAuth } from "./utils/auth"
import { UploadResult } from "./types/geocoding-types";

import {OSMapsDataviewConverter} from "./dataconversion/osmaps-dataview-converter";
import { OSMapsGeoJSONBuilder } from "./dataconversion/osmaps-feature-collection-builder";

import { isDataviewFiltered } from "./utils/utils";
import { v4 as uuidv4 } from 'uuid';
import { LogRecord, LogRecordTypes, LogWriter } from "./logging/LoggingTypes";
import { AppInsightsLogger } from "./logging/LogWriters";
import { visualVersion } from "./resources";

/**
 * Main class for the Ordnance Survey Maps for Power BI custom visual.
 * Handles data conversion, map rendering, user interaction, formatting, authorization, and logging.
 * Integrates with Power BI’s visual API and manages the lifecycle of the visual.
 */
export class OSPowerBIVisual implements IVisual {
  /** Stores the current formatting and settings for the visual. */
  public formattingSettings: ParsedCardSettingsWrapper;
  /** Service for managing formatting settings and the formatting pane. */
  private formattingSettingsService: FormattingSettingsService;
  /** Reference to the Power BI host environment. */
  public host: IVisualHost;
  /** Holds the current set of point features for the map. */
  private pointsViewModel: OSMapsCartographicFeatureCollection;
  /** Holds the current set of polygon/feature data for the map. */
  private featuresViewModel: OSMapsCartographicFeatureCollection;
  /** Converts Power BI data views into internal data structures. */
  private converter: OSMapsDataviewConverter;
  /** Builds GeoJSON feature collections from parsed data. */
  private geojson_builder: OSMapsGeoJSONBuilder;
  /** Manages selection state for Power BI data points. */
  private selectionManager: ISelectionManager;
  /** Handles rendering events for the visual. */
  private events: IVisualEventService;
  /** Stores constant values used throughout the visual. */
  public constants: Record<string, any>;
  /** Manages UI elements and interactions. */
  private UIManager: OSPowerBIUIManager;
  /** Handles authorization logic for the visual. */
  public authoriser: VisualAuth;
  /** Indicates if the visual is authorized to display data. */
  public isAuthorised: boolean = true;
  /** Used to abort asynchronous operations during updates. */
  private abortController: AbortController = new AbortController();
  /** Flag to skip the next update cycle. */
  skipNextUpdate: boolean;
  private uploadJustToggledOn: boolean = false;
  private controlsVisibility: ControlDisplayStatus = {
    pointSizingPresent: false,
    pointColouringType: ColourValueTypes.NONE,
    featureSizingPresent: false,
    featureColouringType: ColourValueTypes.NONE,
    uploadFilename: null,
    featureJoinFieldname: null
  }
  private currentStatus: VisualStatus = {
    anyDataShowing: false,
    keyStatus: "not_determined",
    previousDataExpected: false,
    previousExtentValid: false,
    apiKey: "",
    currentUpdateId: null
  }
  /** Tracks update events and their timestamps. */
  private updateLog: Record<string, Date>;
  /** Stores the ID of the last rendering update. */
  private lastRenderingUpdate: string;
  private sessionId: string;
  logWriter: LogWriter;

  // only check version once
  private hasCheckedVersion = false;

  get keyAllowsPremiumData(): boolean {
    return this.currentStatus.keyStatus === "premium";
  }
  get keyStatus(): "free" | "premium" | "invalid" | "not_determined" {
    return this.currentStatus.keyStatus;
  }
  /**
   * Initializes the visual, sets up services, UI, authorization, and logging.
   * @param options Visual constructor options from Power BI.
   */
  constructor(options: VisualConstructorOptions) {
    this.constants = {
      maxSelections:500
    }
    this.formattingSettingsService = new FormattingSettingsService();
    this.host = options.host;
    this.authoriser = new VisualAuth();
    this.skipNextUpdate=false;
    this.currentStatus.anyDataShowing=false;
    this.events = options.host.eventService;
    this.sessionId = uuidv4();
    this.logWriter = new AppInsightsLogger();

    // Check if EPSG:27700 is already defined using proj4.defs() as a getter
    if (!proj4.defs("EPSG:27700")) {
      // Load OSTN transform, (or rather our 1:10 cut-down version)
      // read the base-64 encoded .gsb file and convert to ArrayBuffer for browser compatibility
      const binaryString = atob(ostn15_osgb_to_etrs_lite);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const gsb_buff = bytes.buffer as ArrayBuffer;
      // pass the ArrayBuffer to proj4 to load as a nadgrid identified by 'ostn'
      proj4.nadgrid("ostn", gsb_buff);
      // create the transform, referencing the loaded nadgrid
      // this definition will be used by *l.proj.geojson* when adding OSGB data to a 3857 map
      // using OSTN:
      proj4.defs(
        "EPSG:27700",
        "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +nadgrids=@ostn,null +units=m +no_defs +type=crs"
      );
    }
        
    this.UIManager = new OSPowerBIUIManager(this, options.element)
    this.selectionManager = this.host.createSelectionManager();
    this.selectionManager.registerOnSelectCallback((ids:ISelectionId[]) => {
      //console.log(ids);
    });
    this.converter = new OSMapsDataviewConverter(this.UIManager);
    this.geojson_builder = new OSMapsGeoJSONBuilder(this.UIManager);
    this.checkPermission();
    this.updateLog = {};
    const lr = new LogRecord();
    lr.metric = LogRecordTypes.VISUAL_LOAD;
    lr.logTime = new Date();
    this.sendLogRecord(lr);

    // check github version number against built version and display notice to
    // user if newer version is available
    if (!this.hasCheckedVersion) {
      this.hasCheckedVersion = true;
      this.checkForNewerVersionAndNotifyUser();
    }

  }

  public receiveUploadedData(result: UploadResult){
    this.geojson_builder.populateUserDataGeocoder(result);
    this.updateUploadFilename(result.fileName || "");
    this.updateJoinFieldsDropdown(result.uniqueColNames || []);
  }
  
  /**
   * Applies or clears selection in the Power BI visual.
   * @param selectionHandles Array of selection IDs to apply.
   */
  public async applySelection(selectionHandles: ISelectionId[]) {
    if (selectionHandles.length === 0){
      await this.selectionManager.clear();
    }
    else {await this.selectionManager.select(selectionHandles);}
  }

    /**
   * Checks if a newer version of the visual is available on Github and updates
   * the UI accordingly.
   * @private
   */
  private async checkForNewerVersionAndNotifyUser(): Promise<void> {
    try {
        const res = await fetch(
          "https://api.github.com/repos/OrdnanceSurvey/os-powerbi-map/releases/latest",
          { cache: "no-store" }
        );

        if (!res.ok) return;

        const data = await res.json();
        const latestVersion = data.tag_name?.replace(/^v/, "");

        if (latestVersion !== visualVersion) {
          this.UIManager.displayNewerVersionNotice(latestVersion);
        }
      } catch {
        // Silently ignore: offline / blocked / GitHub unavailable
      }

  }
  

  /**
   * Checks if the user is authorized and updates the UI accordingly.
   * Disables the app and shows authorization info if not authorized.
   * @private
   */
  private async checkPermission() {
    const isAllowed = await this.authoriser.IsAuthorised();
    if(!isAllowed) {
      this.disableApp();
      const authDetails = await this.authoriser.AuthDetails();
      this.UIManager.displayAuthInfo(authDetails);
      this.UIManager.setUnauthorisedAlert();
    }
    else{
      const authDetails = await this.authoriser.AuthDetails();
      this.UIManager.displayAuthInfo(authDetails);
    }
  }
  /**
   * Disables the visual if not authorized.
   * @private
   */
  private disableApp(){
    this.isAuthorised = false;
    this.UIManager.updateMapCanRender();
  }

  public updateUploadFilename(filename:string){
    this.controlsVisibility.uploadFilename = filename;
    this.formattingSettings.uploadedDataConfigCard.FileName = filename;
     this.host.persistProperties({
        merge: [{
          objectName: 'userDataSettings',
          properties: {
            fileName: filename
          },
          selector: null
        }]
      });
  }

  public updateKeyStatus(newStatus: "free" | "premium" | "invalid"){
    this.currentStatus.keyStatus = newStatus;
    this.formattingSettings.apiKeyStatus = newStatus;
    this.persistDataToCard("lastKeyStatus", newStatus);
  }

  public updateJoinFieldsDropdown(colNames:string[]){
    const dropdownItems = colNames.map(col => ({
      value: col,
      displayName: col
    }));

    this.formattingSettings.uploadedDataConfigCard.DropdownContents = colNames;
    //this.formattingSettings.uploadedDataSettingsCard.setIdentifier();
     this.host.persistProperties({
        merge: [{
          objectName: 'userDataSettings',
          properties: {
            dummyUpdateTrigger: Date.now()
          },
          selector: null
        }]
      });
  }

  /**
   * Main update loop. Handles data conversion, map rendering, UI updates, and error handling.
   * @param options Visual update options from Power BI.
   */
  public async update(options: VisualUpdateOptions) {
    this.events.renderingStarted(options);
    const updateId = uuidv4();
    this.currentStatus.currentUpdateId = updateId;
    const startDate = new Date();
    this.UIManager.addDevMessage(`Update called at ${startDate.toISOString()}, id is ${updateId}`)
    this.updateLog[updateId] = startDate;
    const updateHasData = options.dataViews[0] &&
                    options.dataViews[0].table &&
                    options.dataViews[0].table.rows &&
                    options.dataViews[0].table.rows.length > 0;
    
    const newSettingsWrapper =
      this.formattingSettingsService.populateFormattingSettingsModel(
        ParsedCardSettingsWrapper,
        options.dataViews[0]
      );
    newSettingsWrapper.ensureConsistency();
    newSettingsWrapper.dataviewIsFiltered = isDataviewFiltered(options.dataViews[0]);
    // change second param to false to hide all the dev messages
    this.UIManager.ToggleDebugMode(newSettingsWrapper.mapSettingsCard.showDebug, false);
    
    if(!this.isAuthorised){
      this.UIManager.addDevMessage(`Not authorised: update ${updateId} cancelled`);
      this.events.renderingFailed(options);
      this.currentStatus.currentUpdateId = null;
      return;
    }
    
    if(this.skipNextUpdate){
      // we often want to skip an update that's called automatically after there has been a call to persistProperties, because 
      // we have already updated the map in response to the user action that triggered the persist, and the automatic update 
      // that follows would be redundant and can lead to a loop of updates being triggered. 
      // However, we only want to skip the next update if there is currently data showing on the map, if there isn't then 
      // we want to allow the update to go through so that if the user has just added data we can show it without them having to
      // trigger another update. 
      // We use the currentStatus.anyDataShowing for this, which is set to true at the end of an update if there is data in the 
      // dataview, and is set to false at the start of an update if there is no data in the dataview. This means that if an 
      // update is triggered when there is no data showing, skipNextUpdate will be ignored and the update will go through, 
      // and if an update is triggered when there is data showing, skipNextUpdate will be respected and the update will be skipped.
      this.skipNextUpdate = false;
      if(this.currentStatus.anyDataShowing){
        this.UIManager.addDevMessage(`Update ${updateId} done at ${new Date().toISOString()} - skipped`)
        this.events.renderingFinished(options);
        this.currentStatus.currentUpdateId = null;
        return;
      }
      else{
        this.UIManager.addDevMessage(`Not skipping post-persist update as no data are currently showing`)
      }
    }

    const isFirstUpdate = !this.formattingSettings;
    let whatChanged: SettingsChangeTypes = newSettingsWrapper.whatChanged(this.formattingSettings||null);
    this.uploadJustToggledOn = whatChanged.UploadToggle && !this.uploadJustToggledOn;
    this.formattingSettings = newSettingsWrapper;

    this.UIManager.mapManager.updateSettings(newSettingsWrapper);
    this.formattingSettings.updateControlsDisplay(this.controlsVisibility);
    
    let boundsForNewMap: L.LatLngBounds = this.getBoundsForNewMap();
    let hadSavedExtent = boundsForNewMap !== null;
      
    if (isFirstUpdate) {
      // this will run even if there is no data, which is what we want, it will load the api key and its status 
      // from last time if this is not a "new" visual
      this.UIManager.addDevMessage(`Update ${updateId} - Is first update!`);
      this.switchOffZPSSwitch();
      this.controlsVisibility.uploadFilename = this.formattingSettings.uploadedDataConfigCard.FileName;
      this.currentStatus.keyStatus = this.formattingSettings.apiKeyStatus;
      this.currentStatus.apiKey = this.formattingSettings.apiKey;
      this.currentStatus.previousDataExpected = this.getPersistedSettings("expectingData");
      this.currentStatus.previousExtentValid = hadSavedExtent && this.currentStatus.previousDataExpected;
      this.UIManager.addDevMessage(`Update ${updateId} - hadSavedExtent: ${hadSavedExtent}, previousDataExpected: ${this.currentStatus.previousDataExpected}, 
        previousExtentValid: ${this.currentStatus.previousExtentValid}`);
    }

    if ((!isFirstUpdate) && whatChanged.UploadToggle && this.uploadJustToggledOn) {
      this.UIManager.ToggleUserDataUploader(true, updateHasData);
      // The update was triggered by the user toggling on the upload data toggle in the formatting pane, 
      // so we want to open the uploader and then exit the update without doing anything else, as we 
      // don't want to trigger a map render until after the user has uploaded some data, and uploading 
      // data will trigger another update anyway.
      // turn off the toggle in the settings pane so that it behaves like a non-latching button
      this.formattingSettings.uploadedDataConfigCard.uploadDataToggle.value = false;
      const persistObj:VisualObjectInstance = {
        objectName: 'userDataSettings',
        properties: {
          uploadDataToggle: false
        },
        selector: null
      }
      this.host.persistProperties({merge:[persistObj]});
      this.currentStatus.currentUpdateId = null;
      return;
    }
    this.uploadJustToggledOn = false;

    if (whatChanged.APIKey) {
      this.UIManager.addDevMessage(`Update ${updateId} - API key changed, awaiting apikey check`);
      // we use await for this check because we don't want update to proceed if api key is not valid, 
      // i.e. we want updateMapCanRender to give the right result below
      await this.UIManager.apiKeyUpdated();
      this.currentStatus.apiKey = this.formattingSettings.apiKey;
    }

    const mapCanRender = this.UIManager.updateMapCanRender();
    if(!mapCanRender) {
      this.UIManager.addDevMessage(`Update ${updateId} - done at ${new Date().toISOString()} - map can't render`)
      this.events.renderingFinished(options);
      this.currentStatus.currentUpdateId = null;
      return;
    };
    
    if (whatChanged.UploadJoinField && newSettingsWrapper.uploadedDataConfigCard.SelectIdentifierField.value) {
      // the user chose a different join field from the dropdown in the formatting pane, so we need to reindex the geocoder with the new join field
      // and then allow the rest of the update to proceed so that the map will re-render with the new geocoder settings.
      this.geojson_builder.reindexUserDataGeocoder(String(this.formattingSettings.uploadedDataConfigCard.SelectIdentifierField.value.value));
    }

    let isFirstMapBuild:boolean = this.UIManager.mapManager.map ? false : true;
    let buildingMapAndBaselayers:boolean = (whatChanged.ShouldRebuildMap || isFirstMapBuild) && mapCanRender;
    let buildingBaseLayers:boolean = whatChanged.ShouldRebuildBaseLayers && !buildingMapAndBaselayers && mapCanRender;
    
    if (buildingMapAndBaselayers) {
      // we need to build the map for the  first time, or rebuild the map to change the projection
      // if boundsForNewMap is not null then it implies we have an extent cached 
      // or there is already a map built (CRS change),  this takes priority
      this.UIManager.addDevMessage(`Update ${updateId} - Building new map, preventZoomToData is ${this.currentStatus.previousExtentValid}`);
      this.UIManager.mapManager.buildMap(boundsForNewMap); // with the new setting of useosgb
      this.UIManager.mapManager.buildBaseLayers();
      this.UIManager.mapManager.toggleVisibility(true);
      if (!newSettingsWrapper.zoomPanSelectStatus) {
        // Add lasso for selection of points if the zoom-pan select toggle is off
        // at the time the map is built
        this.UIManager.mapManager.toggleLasso(true);
      }
    } 
    else if (buildingBaseLayers) {
      this.UIManager.mapManager.buildBaseLayers();
      this.UIManager.mapManager.toggleVisibility(true);
      this.UIManager.mapManager.updateZoomLimits();
    }

    if (whatChanged.ShouldUpdateReferenceFeatures){
      // Here the "await" syntax inside this if-block, together with the inconsistent behaviour of how 
      // PowerBI calls update on reconstructing a previously-loaded visual, was causing a tricky bug. 
      // Essentially the initial update might run, during which the conditional was true due to 
      // allChange, but there was no data in this update. We'd get to here and await the reference layer update. 
      // During that another update would fire and this one did contain the data but no reference layer 
      // change, so we did not get to this await.
      // That update would load its data to the map and complete synchronously. Then the await from the 
      // first update would continue once the reference layer update completed, and then the map data 
      // rendering code would clear the map due to no data. This resulted in data appearing briefly on the 
      // map and then disappearing again.
      // So instead we now use promise/then so that only the dependent code relating to reference layers 
      // has to wait till after the reference layer manager is ready.
      this.UIManager.addDevMessage(`Update ${updateId} - awaiting reference layer update`);
      //await this.UIManager.mapManager.updateReferenceLayers(); // DON'T DO THIS! See above
      //this.UIManager.addDevMessage(`Update ${updateId} completed reference layer update`);
      //this.UIManager.legendManager.updateRefLegend(this.UIManager.mapManager.refLayerManager);
      this.UIManager.mapManager.updateReferenceLayers().then(() => {
        this.UIManager.addDevMessage(`Update ${updateId} - completed reference layer update`);
        this.UIManager.legendManager.updateRefLegend(this.UIManager.mapManager.refLayerManager);
      });
    }

    this.UIManager.SetViewOrEditMode(options.viewMode);
    this.UIManager.legendManager.setLegendVisibility(newSettingsWrapper.mapSettingsCard.showLegend);
    if (!isFirstUpdate && !(options.type & powerbi.VisualUpdateType.Data)) {
      this.UIManager.addDevMessage(`Update ${updateId} - done at ${new Date().toISOString()} - not a data update (type ${options.type})`)
      this.events.renderingFinished(options); 
      this.currentStatus.currentUpdateId = null;
      return;
    }

    // Prevent any ongoing geocoding calls from a previous update from updating the map after they return, as we now know 
    // that the present update is a data update and so needs to supersede those earlier update(s). 
    // We do this by using an abort controller, and passing its signal to any async functions that need to be 
    // aware of this, and then calling abort() on the controller here at the start of the update, which will cause the signal 
    // to be triggered and any async functions that are still running and are awaiting when this happens to know that they 
    // should not continue with updating the map when they complete. 
    // We then create a new abort controller for the current update and store it on the visual, so that the next update loop
    // can cancel the the results from this one if necessary, etc
    this.abortController.abort();
    this.abortController = new AbortController();
    
    // display a loading spinner if update takes longer than 3s to run
    const startSpinnerTimeoutID = setTimeout(function () {
      this.UIManager.mapManager.ToggleSpinner(true);
    }.bind(this), 3000);
    try{    
      // parse the dataview and update map layers iif any data have changed
      // TODO this is not a perfect check because change could be just after a persistProperties call 
      // (the skipNextUpdate logic is not 100%)
      // e.g. saving map extent after panning, so we will be doing unnecessary data processing in that case.
      if (whatChanged.ChangeAll || !whatChanged.AnySetting) {
        let newDataTable: OSMapsParsedTable;
        // only if the data has changed do we re-parse the dataview as this could be quite 
        // expensive to do
        newDataTable = this.converter.convert(options);
        if (!newDataTable) {
          // there are no data in the update, so we should clear the map
          if(this.lastRenderingUpdate && (startDate < this.updateLog[this.lastRenderingUpdate])){
            // safeguard against any missed async issues which could mean that this update has been superseded by a later update which has rendered data to the map
            this.UIManager.addDevMessage(`Update ${updateId} contains no data but appears to be an outdated update: buggily clearing map!`);
            //return; 
            //uncomment this return if we find this safeguard is actually needed, but for now we want to know if it ever happens that an outdated update 
            //gets to this point, so we log it but still allow the map to be cleared as it should be if there is no data, even if the update is outdated
          }
          // there's no data so clear the map
          this.UIManager.addDevMessage(`Update ${updateId} - no data in dataview, clearing map, rendered in ${this.lastRenderingUpdate}, this time "${startDate.toISOString()}, that time ${this.updateLog[this.lastRenderingUpdate]?.toISOString()}`);
          this.UIManager.mapManager.clearDataFromMap(Layers.Points);
          this.UIManager.legendManager.updatePointsLegend(null);
          this.UIManager.legendManager.updateSizeLegend(null);
          this.UIManager.mapManager.clearDataFromMap(Layers.Features);
          this.currentStatus.anyDataShowing = false;
          this.persistDataToCard("expectingData", false);
          this.UIManager.legendManager.updateFeaturesLegend(null);
          this.pointsViewModel = null;
          this.featuresViewModel = null;
          clearTimeout(startSpinnerTimeoutID);
          this.UIManager.mapManager.ToggleSpinner(false);
          this.UIManager.addDevMessage(`Update ${updateId} - done at ${new Date().toISOString()} - no data, map cleared`)
          // TODO this errors if no dataview
          this.UIManager.addDevMessage(`${JSON.stringify(options.dataViews[0].table||
            `Table not present in dataview! Update type ${options.type}`, null, 2)}`)
          this.events.renderingFinished(options);
          this.currentStatus.currentUpdateId = null;
          return;
        }
        this.controlsVisibility.featureJoinFieldname = newDataTable.geojsonRefFieldname;

        // build a new points set from the latest data, but don't add it to the map yet
        const pointCartoSettings = newSettingsWrapper.getCartoSettings(Layers.Points);
        // This await also poses an issue. If the data are cleared whilst awaiting this, then we'd end up 
        // with data on the map after clearing it. To prevent this we pass in the abortcontroller signal, a new update 
        // will cause signal.aborted to be true on the old one and geojson_builder will return a null point set.
        // But then we need to check here if that has occurred, as a null point set can also occur if there are no data! 
        // So we need to check if the build was aborted during the async (awaited) part, before processing the results.
        const pointRes = await this.geojson_builder.buildPointSet(newDataTable, pointCartoSettings, this.abortController.signal);
        const newPointSet = pointRes.featurecoll;
        const pointBuildIsAborted = pointRes.isAborted;
        const pointBuildLogs = pointRes.logRecords;
        if(pointBuildIsAborted){
          this.UIManager.addDevMessage(`Update ${updateId} - aborted while building points set at ${new Date().toISOString()}`);
          this.currentStatus.currentUpdateId = null;
          return;
        }
        if (newPointSet.length === 0) {
          // there is a data object, but no points, so remove old ones from the map
          this.UIManager.addDevMessage(`Update ${updateId} - no points in data, clearing points from map`);
          this.UIManager.mapManager.clearDataFromMap(Layers.Points);
          this.UIManager.legendManager.updatePointsLegend(null);
          this.UIManager.legendManager.updateSizeLegend(null);
        }

        this.controlsVisibility.pointColouringType = newPointSet.colourScalingType;
        this.controlsVisibility.pointSizingPresent = newPointSet.hasSizeScaling;
        // check whether the old points are the same as the new points both in terms of 
        // geometry-only and also in terms of geometry+attributes
        if (
          (!this.pointsViewModel && newPointSet.length) ||
          (this.pointsViewModel && !this.pointsViewModel.GeometriesEqual(newPointSet))
        ) {
          // there were previously no points but now are, or there were previously points 
          // but new ones have different locations => should rebuild on map then zoom to them
          whatChanged.PointLocations = true;
          whatChanged.PointAttribs = true;
          for(let lr of pointBuildLogs){
            lr.updateId = updateId;
            this.sendLogRecord(lr)
          }
        } 
        else if (
          this.pointsViewModel && !isEqual(this.pointsViewModel, newPointSet)
        ) {
          // The locations were equal, but the attributes differ (size / colour / popup 
          // field config changed) => should rebuild on map but don't re-zoom to them
          whatChanged.PointAttribs = true;
        }
        // save it for next time
        this.pointsViewModel = newPointSet.length ? newPointSet : null;

        // now do polygons (/lines/whatevers)
        // See async comment for buildPointSet above.
        const featureRes = await this.geojson_builder.buildGeometriedFeatures(newDataTable, newSettingsWrapper, this.abortController.signal, updateId);
        const newPolygonSet = featureRes.featurecoll;
        const featureBuildIsAborted = featureRes.isAborted;
        const featureBuildLogs = featureRes.logRecords;
        if(featureBuildIsAborted){
          this.UIManager.addDevMessage(`Update ${updateId} aborted while building feature set at ${new Date().toISOString()}`);
          this.currentStatus.currentUpdateId = null;
          return;
        }
        if (newPolygonSet.length === 0) {
          // there is a data object, but no polygons, so remove old ones from map
          this.UIManager.addDevMessage(`Update ${updateId} - no features in data, clearing features from map`);
          this.UIManager.mapManager.clearDataFromMap(Layers.Features);
          this.UIManager.legendManager.updateFeaturesLegend(null);
          this.UIManager.legendManager.updateUnmatchedLegend(null);
        }
        this.controlsVisibility.featureColouringType = newPolygonSet.colourScalingType;
        this.controlsVisibility.featureSizingPresent = newPolygonSet.hasSizeScaling;
        if (
          (!this.featuresViewModel && newPolygonSet.length) ||
          (this.featuresViewModel && !this.featuresViewModel.GeometriesEqual(newPolygonSet))
        ) {
          // there were previously no features but now are, or there were previously features 
          // but new ones have different geoms => should rebuild on map then zoom to them
          whatChanged.PolygonLocations = true;
          whatChanged.PolygonAttribs = true;
          for(let lr of featureBuildLogs){
            lr.updateId = updateId;
            this.sendLogRecord(lr)
          }
        } 
        else if (
          this.featuresViewModel && !isEqual(this.featuresViewModel, newPolygonSet)
        ) {
          // The geoms were equal, but the attributes differ (size / colour / popup 
          // field config changed) => should rebuild on map but don't re-zoom to them
          whatChanged.PolygonAttribs = true;
        }
        this.featuresViewModel = newPolygonSet.length ? newPolygonSet : null;
      }
      // end if datachanged
      else {
        if (
          (whatChanged.PointCartoSettings) 
          &&
          this.pointsViewModel
        ) {
          // points data have not changed but required symbology has. Update the points on the map
          // without re-parsing the dataview
          this.pointsViewModel.updateCartoSettings(newSettingsWrapper.getCartoSettings(Layers.Points));
        } 
        if (
        // features data have not changed but required symbology has. Update the features on the map
        // without re-parsing the dataview
        (whatChanged.FeatureCartoSettings)
        && this.featuresViewModel
        ) {
          this.featuresViewModel.updateCartoSettings(newSettingsWrapper.getCartoSettings(Layers.Features));
          const unmatchedSymbol = newSettingsWrapper.unmatchedDataStylingCard.DefaultStylingProperties;
          unmatchedSymbol.symbolName = newSettingsWrapper.uploadedDataConfigCard.FileName;
          this.featuresViewModel.updateDefaultSymbolConfig(unmatchedSymbol)
        }
      }
      // end processing the powerbi data into our objects

      // re-add points or polygons to map if needed, zooming to the added data if required
      
      // Points need to be added differently depending on whether there are also features (polygons).
      // Firstly they will need to be added to a different physical map/leaflet layer if polygons are also 
      // present. hasFeatureLayerFeatures will cause the points to be rendered as SVG, leaving the canvas 
      // free for polygons.
      // Secondly they will need to be rendered with different colouring and/or borders if features are 
      // present and current settings mean there is a potential for points overlapping polygons to have 
      // the same colour
      const hasFeatureLayerFeatures = this.featuresViewModel && this.featuresViewModel.length>0;
      // don't zoom to data if we had an extent to restore AND had expectingdata true AND this is the first time 
      // of adding data to the map: we are just restoring the visual state from when the user left it, so we 
      // should trust that the restored extent is what they want to see rather than zooming to the data and losing that restored view.
      const preventZoomToData = this.currentStatus.previousExtentValid;
      if (this.pointsViewModel && this.pointsViewModel.length>0) {
        // Use "safe" point symbols iif both layers are present, both layers have categorical data, both layers 
        // have the "use default categorical colours" toggle turned on. 
        // "Safe" means either different colour palette for points, a border on points, or both (TBD - not a user 
        // choice)
        const useSafePointSymbols = this.pointsViewModel.isCategorical 
            && newSettingsWrapper.markerPointCartoSettingsCard.DefaultCategoricalColours
            && this.featuresViewModel && this.featuresViewModel.length>this.featuresViewModel.length_unlinked && this.featuresViewModel.isCategorical
            && newSettingsWrapper.featureCartoSettingsCard.DefaultCategoricalColours;
        // Use "safe" symbols for selected points iif both layers are present. "Safe" means that points have a grey 
        // border when selected so they can be distinguished if within a polygon that is also selected.
        const useSafePointSelectionSymbols = this.featuresViewModel && this.featuresViewModel.length>0
        // normally we avoid rebuilding points if only polygons have changed. But now we can't avoid it because a change 
        // to existence or symbology of polygons might mean that the point symbols have to change to avoid the symbols conflicting.
        const rebuildPoints = whatChanged.ShouldRebuildPoints 
          || (useSafePointSymbols != this.pointsViewModel.useSafePointColouring)
          || (useSafePointSelectionSymbols != this.pointsViewModel.useSafePointSelectionColouring)
        if(rebuildPoints){
          this.pointsViewModel.suppressDuplicateGeoms = true;
          if(useSafePointSymbols != this.pointsViewModel.useSafePointColouring){
            this.pointsViewModel.useSafePointColouring = useSafePointSymbols;
            this.pointsViewModel.updateCartoSettings(newSettingsWrapper.getCartoSettings(Layers.Points))
          }
          if(useSafePointSelectionSymbols != this.pointsViewModel.useSafePointSelectionColouring){
            this.pointsViewModel.useSafePointSelectionColouring = useSafePointSelectionSymbols
          }
          const zoomDecision = whatChanged.ShouldRezoomMap && !preventZoomToData;
          this.currentStatus.previousExtentValid = false; // only prevent zoom on first data addition after load
          this.UIManager.addDevMessage(`Update id: ${updateId} - Rendering data on layer: ${Layers[Layers.Points]} with ${this.pointsViewModel.length} features`);
          this.UIManager.addDevMessage(`Update id: ${updateId} - Zoom decision for points layer: ${zoomDecision}`);
          // do the leaflet stuff to actually add the points to the map, to whichever layer they need to go on (canvas or svg), 
          // and zooming or not zooming to them as appropriate
          this.UIManager.mapManager.renderData(
            this.pointsViewModel, Layers.Points, hasFeatureLayerFeatures, zoomDecision
          );
          this.currentStatus.previousDataExpected = false; // next time it will be something that's just been added

          this.currentStatus.anyDataShowing = true;
          this.lastRenderingUpdate = updateId;
          this.UIManager.legendManager.updatePointsLegend(this.pointsViewModel);
          this.UIManager.legendManager.updateSizeLegend(this.pointsViewModel);
          this.UIManager.DisplayToastNotification(null);
          this.persistDataToCard("expectingData", true);
        }
      }

      if (whatChanged.ShouldRebuildFeatures && hasFeatureLayerFeatures) {
        this.featuresViewModel.suppressDuplicateGeoms = true;
        const zoomDecision = whatChanged.ShouldRezoomMap && !preventZoomToData;
        this.currentStatus.previousExtentValid = false; // only prevent zoom on first data addition after load
        this.UIManager.addDevMessage(`Update id: ${updateId} - Zoom decision for features layer: ${zoomDecision}`);
        this.UIManager.addDevMessage(`Update id: ${updateId} - Rendering data on layer: ${Layers[Layers.Features]} with ${this.featuresViewModel.length} features`);
        this.UIManager.mapManager.renderData(
          this.featuresViewModel, Layers.Features, true, zoomDecision
        );
        this.currentStatus.previousDataExpected = false; // next time it will be something that's just been added
        this.lastRenderingUpdate = updateId;
        this.currentStatus.anyDataShowing = true;
        this.UIManager.legendManager.updateFeaturesLegend(this.featuresViewModel);
        this.UIManager.legendManager.updateUnmatchedLegend(this.featuresViewModel);
        this.UIManager.DisplayToastNotification(null);
        this.persistDataToCard("expectingData", true);
      }

      this.UIManager.setSelectability(
        // prevent map selection (lasso) if the data view is filtered, or if zoom-pan select 
        // is turned on
        this.formattingSettings.dataviewIsFiltered,
        whatChanged.ZoomPanSelectStatus
      );
    }
    catch(error){
      this.UIManager.addError(
        "An unknown error occurred processing the data. Apologies for the inconvenience."
      );
      this.UIManager.addDevMessage(error);
    }
    finally{
      clearTimeout(startSpinnerTimeoutID);
      this.UIManager.mapManager.ToggleSpinner(false);
      this.UIManager.DisplayToastNotification(null);
    }
    this.formattingSettings.updateControlsDisplay(this.controlsVisibility);
    this.UIManager.addDevMessage(`Update ${updateId} - done at ${new Date().toISOString()} - complete`);
    this.events.renderingFinished(options);
    this.currentStatus.currentUpdateId = null;
  }
 
  /**
   * Sends a log record using the configured log writer.
   * @param lr Log record to send.
   */
  public sendLogRecord(lr: LogRecord) {
    lr.sessionId = this.sessionId;
    if(!lr.apiKey){
      lr.apiKey = this.currentStatus.apiKey;
    }
    if(!lr.isEditMode){
      lr.isEditMode = this.UIManager.isEditMode;
    }
    if(!lr.version){
      lr.version = visualVersion;
    }
    if(!lr.updateId){
      lr.updateId = this.currentStatus.currentUpdateId;
    }
    this.logWriter.sendLogRecord(lr);
    //console.log("Log Record sent: ",lr);
  }

  /**
   * Determines the bounds for initializing or rebuilding the map. Loads from persisted settings
   * on first build if present, or default Ambleside extent otherwise, and uses current map bounds
   * on subsequent builds.
   * @returns {L.LatLngBounds} The bounds for the new map, or null if not available.
   * @private
   */
  private getBoundsForNewMap() {
    let boundsForNewMap: L.LatLngBounds;
    let isFirstMapBuild:boolean = this.UIManager.mapManager.map ? false : true;
    if (isFirstMapBuild) {
      const previousExtentProps = JSON.parse(this.getPersistedSettings("mapExtent"));
      boundsForNewMap = Object.assign(new L.LatLngBounds(null, null), previousExtentProps);
       try{
         boundsForNewMap.getCenter();
         //this.currentStatus.storedBoundsAreValid = true;
       }
       catch{
         // Seems a hacky way of checking if valid but
         boundsForNewMap = null
        // this will result in the map constructor not doing a zoom and so the initial extent will come from the 
        // default zoom and centre in MapSettingsCard, centring on Ambleside
       }
    }
    else {
      // rebuilding new map within this visual instance, because the CRS of the map has changed
      boundsForNewMap = this.UIManager.mapManager.map.getBounds();
    }
    return boundsForNewMap;
  }
  
  /**
   * Returns properties pane formatting model content hierarchies, properties and latest formatting values.
   * This method is called once every time we open properties pane or when the user edits any format property.
   * @returns {powerbi.visuals.FormattingModel} The formatting model for the properties pane.
   */
  public getFormattingModel(): powerbi.visuals.FormattingModel {
    return this.formattingSettingsService.buildFormattingModel(
      this.formattingSettings
    );
  }
  
  /**
   * Cleanup logic for when the visual is destroyed.
   */
  public destroy(): void {
    // powerbi docs say this "often" doesn't get called ... actually it seems to be never
    
  }

  /**
   * Retrieves persisted settings from the formatting model.
   * @param identifier The identifier for the persisted setting.
   * @returns The persisted setting value or null.
   */
  public getPersistedSettings(identifier) {
    // load a value from the persistedSettingsCard, if it's there
    return (
      // TODO implement getters and setters on the card for the known identifiers
      this.formattingSettings.persistedSettingsCard[identifier]?.value || null
    );
  }

  /**
   * Programmatically disables the zoom-pan-select switch.
   */
  public switchOffZPSSwitch() {
    const instance: VisualObjectInstance = {
      objectName: "mapSettings",
      selector: undefined,
      properties: { zoomPanSelect: false },
    };
    this.host.persistProperties({
      merge: [instance],
    });
  }

  /**
   * Persists data to the hidden settings card for caching or state retention.
   * @param identifier The identifier for the persisted data.
   * @param results The data to persist.
   */
  public persistDataToCard(identifier, results): void {
    // Saves the 'results' object to the hidden persistedSettings card, identified by 'identifier', to
    // persist for "an amount" of time - hopefully permanently once the report is saved.
    // Used for storing geocoding results to avoid re-calling API for things we've already coded,
    // for storing uploaded geometries, for persisting map extent and layers, etc... anything that we need to 
    // save which isn't directly tied to a formatting control.
    const props = {};
    if(typeof results === "string" || typeof results === "number" || typeof results === "boolean"){
      props[identifier] = results;
    }
    else {
      props[identifier] = JSON.stringify(results);
    }
    const instance: VisualObjectInstance = {
      objectName: "osmapsPersistedSettings",
      selector: undefined,
      properties: props,
    };
    this.UIManager.addDevMessage("Persisting data to " + identifier + ", will trigger new update");
    if(identifier === "mapExtent"){
      //this.skipNextUpdate=true;
    }
    this.host.persistProperties({
      merge: [instance],
    });
  }
}
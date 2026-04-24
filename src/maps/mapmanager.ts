"use strict";

import L, { LeafletEvent, LeafletEventHandlerFn } from "leaflet";
import "../../node_modules/leaflet-groupedlayercontrol/dist/leaflet.groupedlayercontrol.min"
import "../../node_modules/leaflet-notifications/js/leaflet-notifications";
import "../../node_modules/leaflet-notifications/css/leaflet-notifications.min.css";
import * as turf from '@turf/turf';
import proj4 from "proj4";
import "../utils/proj4leaflet";
import LogoWhite from "../images/os-logo-maps-white";

import { OSMapsCartographicFeatureCollection } from "../datamodels/osmaps-feature-collection";
import { OSMapsGeoJson } from "../datamodels/osmaps-features";
import { Layers, ParsedCardSettingsWrapper } from "../settings/PowerBISettings";
import { OSPowerBIVisual } from "../visual";
import ISelectionId = powerbi.extensibility.ISelectionId;
import { OSPowerBIUIManager } from "../ui/uimanager";
import { OSPowerBIReferenceLayerManager } from "./ReferenceLayerManager"
import { ONS_ESRI_ATTRIB, GET_OS_ATTRIB, colours } from "../resources";
import {LoggingTileLayer} from "./LoggingTileLayer";
import {LoggableBounds} from "./LoggableBounds";
import { LogRecord, LogRecordTypes } from "../logging/LoggingTypes";

/**
 * Manages the Leaflet map instance, layers, and user interactions for the OS Power BI visual.
 * Handles map creation, base layers, feature layers, logging, and lasso selection.
 */
export class OSPowerBIMapManager {
  private mapLogo: HTMLElement;
  private layerControl?: L.Control.GroupedLayers | null;
  private lassoControl: L.Control.Lasso;
  private renderingCanvas: L.Canvas;
  private leafletPointsLayer: L.Proj.GeoJSON | null;
  private leafletFeaturesLayer: L.Proj.GeoJSON | null;
  private hostVisual: OSPowerBIVisual;
  private settings: ParsedCardSettingsWrapper;
  private osgb_crs: L.Proj.CRS;
  public notificationControl;
  private _currentBaseLayers = {};
  private zpsHandler: LeafletEventHandlerFn;
  map: L.Map | null;
  pointsCollection: OSMapsCartographicFeatureCollection;
  featuresCollection: OSMapsCartographicFeatureCollection;
  private div: HTMLElement;
  private UIManager: OSPowerBIUIManager;
  /** We need to be able to zoom out beyond the min that's set by the OS Maps API in order to see the whole country!! */
  private OVERZOOM_LEVELS = 2;
  private popup: L.Popup;
  private currentFeatureIdentifiers:Set<string> = new Set<string>;
  public refLayerManager: OSPowerBIReferenceLayerManager;

  private saveExtentTimeout: NodeJS.Timeout;
  private saveLayerTimeout: NodeJS.Timeout;
  private recentZoomPanCount: number = 0;
  private recentViewedBounds: LoggableBounds = null;
  ONSAttributionShown: boolean = false;


  /**
   * Creates a new map manager.
   * @param UIManager The UI manager instance.
   * @param div The HTML element to render the map into.
   */
  constructor(UIManager: OSPowerBIUIManager, div: HTMLElement) {
    this.UIManager = UIManager;
    this.hostVisual = UIManager.visual;
    this.div = div;
    this.lassoControl = L.control.lasso();
    this.osgb_crs = new L.Proj.CRS(
      // this definition will be used by *leaflet* when adding non-OSGB data to an OSGB map
      "EPSG:27700",
      "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +nadgrids=@ostn,null +units=m +no_defs +type=crs",
      {
        resolutions: [
          896.0, 448.0, 224.0, 112.0, 56.0, 28.0, 14.0, 7.0, 3.5, 1.75, 0.875,
          0.4375, 0.21875, 0.109375,
        ],
        origin: [-238375.0, 1376256.0],
      }
    );
    this.updateSettings(this.hostVisual.formattingSettings);
    this.lassoControl = L.control.lasso();
    this.createZPSHandler();

    // map branding w logo
    this.mapLogo = document.createElement("div");
    this.mapLogo.innerHTML = LogoWhite;
    this.mapLogo.setAttribute("class", "map-logo");
    this.div.appendChild(this.mapLogo);
  }

  /**
   * Updates the map manager's settings.
   * @param newSettings The new parsed settings.
   */
  updateSettings(newSettings: ParsedCardSettingsWrapper): void {
    this.settings = newSettings;
  }

  /**
   * Builds map options for Leaflet map creation.
   * @param osgb Whether to use the OSGB CRS.
   * @returns The map options.
   * @private
   */
  private _buildMapOptions(osgb: boolean): L.MapOptions {
    const mapSettings = this.settings.mapSettingsCard;
    if (osgb) {
      return {
        crs: this.osgb_crs,
        // NOTE that for osgb / L.proj.crs, this needs a patch to proj4leaflet so can't use the directly
        // node-installed version
        minZoom: mapSettings.getMinZoomLevel() - this.OVERZOOM_LEVELS,
        maxZoom: mapSettings.getMaxZoomLevel(this.hostVisual.keyAllowsPremiumData),
        center: mapSettings.getCentre(),
        zoom: mapSettings.getDefaultZoomLevel(),
        zoomSnap: 0.5,
        zoomDelta: 0.5, // allow half-zoom levels as feedback indicated the native levels are too coarse
        // default is 60, so set to 120 to make it half as fast and therefore go as far as one zoom-button click i.e. 0.5 levels:
        wheelPxPerZoomLevel: 120,
        maxBounds: mapSettings.getMaxBounds(),
        attributionControl: true,
        layers: [],
      };
    }
    return {
      center: mapSettings.getCentre(),
      //crs:L.CRS.EPSG857, // don't specify CRS and it will default to web mercator
      maxBounds: mapSettings.getMaxBounds(),
      zoom: mapSettings.getDefaultZoomLevel(),
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 120,
      minZoom: mapSettings.getMinZoomLevel() - this.OVERZOOM_LEVELS,
      maxZoom: mapSettings.getMaxZoomLevel(this.hostVisual.keyAllowsPremiumData),
      layers: [],
    };
  }

  /**
   * Builds and initializes the Leaflet map.
   * @param initialBounds The initial bounds to zoom to.
   */
  buildMap(initialBounds:L.LatLngBounds): void {
    if (this.layerControl && this.layerControl.remove) {
      this.layerControl.remove();
      this.layerControl = null;
    }
    if (this.leafletPointsLayer) {
      this.clearDataFromMap(Layers.Points);
    }
    if (this.leafletFeaturesLayer) {
      this.clearDataFromMap(Layers.Features);
    }
    if (this.map && this.map.remove) {
      this.UIManager.addDevMessage("Removing old map");
      this.map.off();
      this.map.remove();
      this.map = null;
    }
    const mapSettings = this.settings.mapSettingsCard;
    if (mapSettings.useOSGB) {
      this.UIManager.addDevMessage("Building new map in OSGB CRS");
      this.map = L.map(this.div, this._buildMapOptions(true));
    } else {
      this.UIManager.addDevMessage("Building new map in webmercator CRS");
      this.map = L.map(this.div, this._buildMapOptions(false));
    }
    if (initialBounds) {
      this.zoomMapToBounds(initialBounds);
    }
    this.map.off("lasso.finished");
    this.map.on("lasso.finished", this.createLassoHandler());
    this.map.on("baselayerchange", (e) => {
      if(this.saveLayerTimeout) { this.cancelLayerAutosave() }
      this.saveLayerTimeout = setTimeout(function(lyrname) {
        this.hostVisual.persistDataToCard("layername", lyrname)
      }.bind(this), 3000, e.name);
    });
    this.map.on("zoomend dragend", ()=> {
      // we want to log zoom and pan interactions, but not more often than every few seconds, 
      // so we use a timeout to delay logging until the user has stopped interacting for a few seconds, 
      // and if they interact again before that time is up we reset the timer. We track how 
      // many zoom/pan interactions they have done and the bounds they have viewed in that time.
      // When the timeout does expire, we log the interactions since it last did and reset the counters, 
      // and we also save the map extent for use in the initial view next time the visual is loaded.
      if(this.saveExtentTimeout) { this.cancelExtentAutosave() }
      this.recentZoomPanCount ++;
      if(!this.recentViewedBounds){
        this.recentViewedBounds = new LoggableBounds(this.map.getBounds())
      }
      else{
        this.recentViewedBounds.extend(this.map.getBounds());
      }
      this.saveExtentTimeout = setTimeout(function () {
        this.hostVisual.persistDataToCard("mapExtent", this.map.getBounds());
        this.sendLog();
      }.bind(this), 3000);
    });
    this.map.attributionControl.setPrefix(false);

    // TODO can we put this in DOMManager instead of here
    this.notificationControl = L.control
    //@ts-ignore
      .notifications({
        timeout: 20000,
        position: "topright",
        closable: true,
        className: "osmaps-toast",
      })
      .addTo(this.map);

      this.map.createPane("referenceOverlays");
      this.map.getPane("referenceOverlays").style.zIndex = '450';
  }

  /**
   * Collects and returns log data for the map tile views, map moves and map bounds, 
   * and resets counters.
   * @returns An object containing log data.
   */
  getLogData() {
    let lyrLogs = {};
    for (const lyrname in this._currentBaseLayers) {
      lyrLogs[lyrname] = this._currentBaseLayers[lyrname].getLogInfo();
      lyrLogs[lyrname].srid = this.settings.mapSettingsCard.getSRID()
    }
    lyrLogs['nMapMoves'] = this.recentZoomPanCount;
    lyrLogs['viewedBounds'] = this.recentViewedBounds.getWktString();
    this.recentZoomPanCount = 0;
    this.recentViewedBounds = null;
    return lyrLogs;
  }

  /**
   * Sends a log record for the map tile views, zoom/pan interactions, and map bounds since 
   * the last time this was called.
   */
  sendLog(){
    let logData = this.getLogData();
    let logRecord: LogRecord = new LogRecord();
    //logRecord.sessionId = this.hostVisual.sessionId;
    logRecord.updateId = null;
    logRecord.metric = LogRecordTypes.MAP_REQUEST;
    logRecord.apiKey = this.settings.mapSettingsCard.apiKey;
    logRecord.logTime = new Date();
    logRecord.isEditMode = this.UIManager.isEditMode;
    logRecord.logEntry = logData;
    this.hostVisual.sendLogRecord(logRecord);
  }

  /**
   * Zooms the map to the specified bounds.
   * @param bounds The bounds to zoom to.
   */
  zoomMapToBounds(bounds:L.LatLngBounds){
    try{
      this.map.fitBounds(bounds); // hacky but it works
    }
    catch(error){
      //console.log("Previous bounds invalid")
    }
  }

  /**
   * Toggles the lasso selection tool on or off.
   * @param turnOn Whether to enable or disable the lasso tool.
   */
  toggleLasso(turnOn: boolean) {
    if (turnOn) {
      this.lassoControl.addTo(this.map);
    } else {
      this.lassoControl.disable();
      this.lassoControl.remove();
    }
  }

  /**
   * Builds and adds the base layer control to the map.
   */
  async buildBaseLayers() {
    for (const key in this._currentBaseLayers) {
      const layer = this._currentBaseLayers[key];
      layer.remove();
    }
    this.layerControl && this.layerControl.remove();
    const mapSettings = this.settings.mapSettingsCard;
    this.UIManager.addDevMessage(`Building base layer control with api key: ${mapSettings.apiKey} (allows premium: ${this.hostVisual.keyAllowsPremiumData}, premium setting: ${mapSettings.usePremium})`);
    const srid = mapSettings.getSRID();
    const minzoom = mapSettings.getMinZoomLevel() - this.OVERZOOM_LEVELS;
    const minNativeZoom = mapSettings.getMinZoomLevel();
    const maxzoom = mapSettings.getMaxZoomLevel(this.hostVisual.keyAllowsPremiumData);
    const attribution = `<span class="map-attribution--big">${GET_OS_ATTRIB()}</span>`;
    document.addEventListener("click", (event) => {
      const button = event.target as HTMLElement;
      if (button.classList.contains("terms")) {
        this.hostVisual.host.launchUrl(
          // map viewing terms can stay as this url
          "https://labs.os.uk/licensing/public-viewing-terms.pdf"
        );
      }
    });
    const osgb_roads = new LoggingTileLayer(//L.tileLayer(
      "https://api.os.uk/maps/raster/v1/zxy/Road_" +
        srid +
        "/{z}/{x}/{y}.png?key=" +
        mapSettings.apiKey,
      {
        attribution: attribution,
        minNativeZoom: minNativeZoom,
        maxNativeZoom: maxzoom,
        minZoom: minzoom,
        bounds: mapSettings.getMaxBounds(),
      }
    );
    const osgb_outdoor = new LoggingTileLayer(//L.tileLayer(
      "https://api.os.uk/maps/raster/v1/zxy/Outdoor_" +
        srid +
        "/{z}/{x}/{y}.png?key=" +
        mapSettings.apiKey,
      {
        attribution: attribution,
        minNativeZoom: minNativeZoom,
        maxNativeZoom: maxzoom,
        minZoom: minzoom,
        bounds: mapSettings.getMaxBounds(),
      }
    );
    const osgb_light = new LoggingTileLayer(//L.tileLayer(
      "https://api.os.uk/maps/raster/v1/zxy/Light_" +
        srid +
        "/{z}/{x}/{y}.png?key=" +
        mapSettings.apiKey,
      {
        attribution: attribution,
        minNativeZoom: minNativeZoom,
        maxNativeZoom: maxzoom,
        minZoom: minzoom,
        bounds: mapSettings.getMaxBounds(),
      }
    );
    const osgb_leisure = new LoggingTileLayer(//L.tileLayer(
      "https://api.os.uk/maps/raster/v1/zxy/Leisure_27700/{z}/{x}/{y}.png?key=" +
        mapSettings.apiKey,
      {
        attribution: attribution,
        minNativeZoom: minNativeZoom,
        maxNativeZoom: 9,
        minZoom: minzoom,
        bounds: mapSettings.getMaxBounds(),
      }
    );
    /*const osgb_roads_backup = L.tileLayer(
          "https://api.os.uk/maps/raster/v1/zxy/Road_27700/{z}/{x}/{y}.png?key=" +
            mapSettings.apiKey,
          { attribution: attribution, minZoom: 10, maxZoom: maxzoom }
        );*/

    const layers =
      mapSettings.useOSGB && mapSettings.usePremium && this.hostVisual.keyAllowsPremiumData
        ? {
            "OS Roads": osgb_roads,
            "OS Outdoor": osgb_outdoor,
            "OS Light": osgb_light,
            "OS Leisure": osgb_leisure,
          }
        : {
            "OS Roads": osgb_roads,
            "OS Outdoor": osgb_outdoor,
            "OS Light": osgb_light,
          };
    
          this.layerControl = L.control.layers(
            layers
        );
    const initialLayerName =
      this.hostVisual.getPersistedSettings("layername") || "";
    const initialLayer = layers[initialLayerName] || layers["OS Light"];
    this.layerControl.addTo(this.map);
    initialLayer.addTo(this.map);
    this._currentBaseLayers = layers;
  }

  /**
   * Updates reference/contextual layers on the map, based on the current settings (reference layer identifiers are 
   * part of the settings model, not the data model).
   */
  async updateReferenceLayers(){
    // Add specified GSS Codes as a "reference" layer, not connected to the powerbi data model.
    // For this we can use ESRI-leaflet feature layers and thus benefit from their caching, auto-simplification 
    // etc
    
    // use the same rendering canvas as the features rather than allowing it to render on its
    // own canvas. This means we get the benefit of canvas rendering but don't have to use two 
    // separate canvases, which doesn't work. We need to careful with ordering within the canvas 
    // though: by adding reference layers first we ensure they are "behind" map features.
    this.initialiseCanvas();
    if(!this.refLayerManager){
      this.refLayerManager = await OSPowerBIReferenceLayerManager.OSPowerBIReferenceLayerManager(this, this.UIManager);
    }
    this.refLayerManager.updateReferenceLayers(this.settings, this.currentFeatureIdentifiers, this.renderingCanvas)
  }

  /**
   * Creates a handler for lasso selection events.
   *  // the whole selection process when filters are applied is a bit of a mess when using the Table dataview model, as we 
      // are, because of the lack of support for Highlight in that model; selections from other visuals are sent to us as 
      // if the data had just been filtered. This is why currently we only allow selection in our visual when the dataview 
      // is not otherwise filtered (has no selections / slicers applied). This really needs to be improved, which currently 
      // would mean using the normal dataview model with support for highlighted rows - but we don't currently want to do that 
      // due to the need for grouping fields to always be added.
   * 
   * @returns The lasso handler function.
   * @private
   */
  private createLassoHandler() {
    type LassoHandlerFinishedEvent = L.LeafletEvent &
      LassoHandlerFinishedEventData;
    const h = async (e: LeafletEvent) => {
      const event = e as LassoHandlerFinishedEvent; // TODO don't use type cast
      const others: L.Layer[] = [];
      if (event.layers.length > this.hostVisual.constants.maxSelections) {
        // it all just gets too slow if we try to select too many - lots and lots of large payloads 
        // between powerbi and the powerbi services
        this.UIManager.addError(
          `Too many features selected! A maximum of ${this.hostVisual.constants.maxSelections} ` +
            `can be selected at once; you selected ${event.layers.length}`
        );
        return;
      }
      this.clearMapSelection(true);
      const selectionHandles: ISelectionId[] = [];

      for (const layer of event.layers as L.GeoJSON[]) {
        if (
          layer.feature instanceof OSMapsGeoJson &&
          layer.feature.selectionHandle
        ) {
          selectionHandles.push(layer.feature.selectionHandle);
          layer.setStyle({
            fillColor: layer.feature.selectionColour, //colours.CYANSELECT,
            color: layer.feature.selectionBorderColour,
          });
          layer.feature.isSelected = true;
        } else {
          others.push(layer);
        }
      }
      await this.hostVisual.applySelection(selectionHandles);
    };
    return h;
  }

  /**
   * Creates a handler for zoom/pan/select events.
   * This functionality is currently disabled (just by hiding the toggle for it) due to 
   * performance issues when there are a lot of features in view, but we may want to re-enable 
   * it in future with some optimizations
   * @private
   */
  private createZPSHandler() {
    const h = async (e: LeafletEvent) => {
      const visibleFeatures = [];
      const mapBounds = this.map.getBounds();
      this.map.eachLayer(
        function (layer) {
          if (layer instanceof L.CircleMarker) {
            if (mapBounds.contains(layer.getLatLng())) {
              visibleFeatures.push(layer);
            }
          }
          // approximate check only
          else if (layer.getBounds && mapBounds.contains(layer.getBounds())) {
            visibleFeatures.push(layer);
          }
        }.bind(this)
      );
      const selectionHandles: ISelectionId[] = [];
      let i: number = 0;
      for (const layer of visibleFeatures) {
        if (i >= this.hostVisual.constants.maxSelections) {
          this.UIManager.addWarning(
            `Too many features in view for auto-selection! A maximum of ` +
              `${this.hostVisual.constants.maxSelections} can be selected at once but ${visibleFeatures.length} are currently in view`
          );
          return; // do not apply partial selection
        }
        if (layer.feature.selectionHandle) {
          selectionHandles.push(layer.feature.selectionHandle);
          i++;
        }
      }
      await this.hostVisual.applySelection(selectionHandles);
    };
    this.zpsHandler = h;
  }

  /**
   * Updates the map's zoom limits and bounds, which depend on the layer, the CRS, and the API key status.
   */
  public updateZoomLimits() {
    if (!this.map) {
      return;
    }
    const mapSettings = this.settings.mapSettingsCard;
    this.map.setMaxZoom(mapSettings.getMaxZoomLevel(this.hostVisual.keyAllowsPremiumData));
    this.map.setMinZoom(mapSettings.getMinZoomLevel() - this.OVERZOOM_LEVELS);
    this.map.setMaxBounds(mapSettings.getMaxBounds());
  }

  /**
   * Toggles the map's visibility.
   * @param turnOn True to show, false to hide.
   */
  public toggleVisibility(turnOn: boolean) {
    if (turnOn) {
      this.div.setAttribute("style", "display: block");
    } else {
      this.div.setAttribute("style", "display: none");
    }
  }

  /**
   * Enables or disables the zoom-pan-select handler. Currently permanently disabled
   * @param turnOn True to enable, false to disable.
   */
  public toggleZoomPanSelect(turnOn: boolean) {
    if (turnOn) {
      this.clearMapSelection(true);
      this.map.on("moveend zoomend", this.zpsHandler);
    } else {
      this.map.off("moveend zoomend", this.zpsHandler);
    }
  }

  /**
   * Clears all map selection, optionally propagating to Power BI.
   * @param propagateToPowerBI Whether to clear selection in Power BI as well.
   */
  public async clearMapSelection(propagateToPowerBI: boolean) {
    this.map &&
      this.map.eachLayer(function (layer: L.GeoJSON) {
        //if (Object.hasOwn(layer, 'feature')){
        if (layer.feature instanceof OSMapsGeoJson) {
          const f = layer["feature"] as OSMapsGeoJson;
          layer.setStyle({
            color: f.borderColour as string,
            fillColor: f.fillColour as string,
          });
          layer.feature.isSelected = false;
        }
      });
    if (propagateToPowerBI) {
      await this.hostVisual.applySelection([]);
    }
  }

  /**
   * Toggles the ONS attribution on the map.
   * @param turnOn True to show, false to hide.
   */
  public toggleOnsAttribution(turnOn:boolean){
    if(turnOn){
      this.map.attributionControl.addAttribution(`${ONS_ESRI_ATTRIB}`);
      this.ONSAttributionShown = true;
    }
    else{
      this.map.attributionControl.removeAttribution(`${ONS_ESRI_ATTRIB}`);
      this.ONSAttributionShown = false;
    }
  }

  /**
   * Removes all data from the specified map layer.
   * @param which The layer to clear (points or features).
   */
  public clearDataFromMap(which: Layers) {
    // clear popups
    let popups = document.getElementsByClassName(
      "leaflet-popup"
    ) as HTMLCollectionOf<Element>;
    for (let i = 0; i < popups.length; i++) {
      popups[i].remove();
    }
    if (which == Layers.Points) {
      if (this.leafletPointsLayer) {
        this.leafletPointsLayer.eachLayer(
          function (layer) {
            if (layer instanceof L.CircleMarker) {
              // TODO fix this; this will remove points that are in the features layer.
              // We really need to use separate leafletlayers
              this.leafletPointsLayer.removeLayer(layer);
            }
          }.bind(this)
        );
        this.leafletPointsLayer.remove();
        this.leafletPointsLayer = null;
      }
    } else if (which == Layers.Features) {
      if (this.leafletFeaturesLayer) {
        this.leafletFeaturesLayer.eachLayer(
          function (layer) {
            if (true) {
              //(!(layer instanceof L.CircleMarker)){
              this.leafletFeaturesLayer.removeLayer(layer);
            }
          }.bind(this)
        );
        this.leafletFeaturesLayer.remove();
        this.leafletFeaturesLayer = null;
        this.toggleOnsAttribution(false);
        this.currentFeatureIdentifiers.clear();
        // ensure the reference layers show any features which have been specified but were previously 
        // not shown due to being present in the data layer
        if(this.refLayerManager){
          this.refLayerManager.UpdateReferenceWhere(this.currentFeatureIdentifiers);
        }
      }
    }
  }

  /**
   * Initializes the rendering canvas for the map.
   * @private
   */
  private initialiseCanvas(){
    if (!this.renderingCanvas) {
      this.renderingCanvas = L.canvas({
        padding: 0.5,
        pane: "overlayPane", // pane determines the z index
      });
    }
  }

  /**
   * Renders a feature collection on the map.
   * @param data The cartographic feature collection.
   * @param whichLayer Enum value representing which leaflet geojson layer to render to.
   * @param featureLayerHasFeatures Whether the feature layer has features (this affects whether points 
   * will be rendered on a canvas or not).
   * @param zoomOnAdd Whether to zoom to the data after rendering.
   */
  public renderData(
    data: OSMapsCartographicFeatureCollection,
    whichLayer: Layers,
    featureLayerHasFeatures: boolean,
    zoomOnAdd: boolean
  ) {
    // Puts geojsons on the map, removing existing ones first.
    const startTime = performance.now();
    let isSlowWarningShown = false;
    this.clearDataFromMap(whichLayer);
    this.initialiseCanvas();
    const onEachFeature = function (feature: OSMapsGeoJson, layer) {
      layer.setStyle({
        fillColor: feature.fillColour,
        // border colour: grey for polygons, fill colour for points unless there are also features
        // (which could be polygons) present, in which case grey for points as well so they show up
        // when overlaying polygon of same colour
        color: feature.borderColour,
        weight: feature.weight, // means border thickness or line itself,
        fillOpacity: feature.opacity, // fill opacity varies with data / control / highlight
        opacity: 1, // borders always opaque
        dashArray: feature.lineStyle
      });
      layer.on({
        // TODO refactor the handlers to be neater and not have so much duplicated code for mouseover/mouseout 
        // with the selection handler, which also has similar code - maybe have a single function that takes 
        // the "state" as a parameter and sets the appropriate styles based on that
        mouseover: function (e) {
          // Subtly highlight features being hovered.
          // For non-opaque polygon features, increase the opacity if possible.
          // If the fill opacity can't be increased much to visually highlight,
          // i.e. it is already greater than 0.8, then set the border to the yellow hover
          // colour instead. For points and lines, do this regardless of opacity.
          const hoverColour = !(feature.isPoint || feature.isLine)
            ? // because f.p. error if we compare directly
              Math.round((feature.highlightOpacity - feature.opacity) * 100) <
              20
              ? colours.YELLOW_HOVER
              : colours.GREYSTONE_NEUTRAL
            : colours.YELLOW_HOVER;
          layer.setStyle({
            fillOpacity: feature.highlightOpacity,
            color: hoverColour,
          });
          // For points, also set the interior to the hover colour
          if (feature.isPoint) {
            layer.setStyle({ fillColor: hoverColour });
          }
          // ensure the border of the mouseover feature is visible
          // layer.bringToFront();
        }.bind(this),
        mouseout: function (e) {
          if (!feature.isSelected) {
            // return to feature's normal colours
            layer.setStyle({
              fillColor: feature.fillColour,
              color: feature.borderColour,
              fillOpacity: feature.opacity,
            });
          } else {
            // feature is selected so on mouseout return to selected highlight colours
            layer.setStyle({
              fillColor: feature.selectionColour,
              color: feature.selectionBorderColour,
              fillOpacity: feature.opacity,
            });
          }
        }.bind(this),
        click: function (e) {
          // On click, we want to show a popup with content from all features at the clicked point, not just the top one, 
          // so we build the popup here rather than using bindPopup on the layer or PowerBI tooltips.
          // TODO extract to a separate function for neatness and potentially use for a hover handler as well          
          const latlng = e.latlng;
          let allFeatures = [];

          // if clicked feature is a point or line, add it to all features
          // bringToFront() used on lines and points so they are clickable on top of polygons
          if (feature.isPoint || feature.isLine) {
            allFeatures.push(feature);
          }

          // Get overlapping features
          const overlappingFeatures = this.getFeaturesAtClickedPoint(latlng.lng, latlng.lat);
          allFeatures = allFeatures.concat(overlappingFeatures)

          const duplicateGeomFeatures = this.findDuplicateGeometries(feature, data)
          allFeatures = allFeatures.concat(duplicateGeomFeatures)

          // show paged popup if overlapping or duplicate features
          const popup = this.createPaginatedPopup(allFeatures, e.latlng, 
            this.settings.mapSettingsCard.hideDefaultPopupFields, this.settings.mapSettingsCard.ShowIdentifierInPopup);
          this.map.openPopup(popup);
        }.bind(this),
      });
    };

    const buildMarker = function (feature: OSMapsGeoJson, latlng) {
      // specific for points, control how they are rendered
      const marker = L.circleMarker(latlng, {
        radius: feature.size,
        color: feature.borderColour,
        fillColor: feature.fillColour as string,
        opacity: feature.opacity,
        // note that weight (outline thickness) and formula for fill are currently hardcoded
        weight: feature.weight,
        fillOpacity: feature.opacity / 3.0,
        dashArray: feature.lineStyle,
        pane: "markerPane", // this will ensure they render over the features which are in canvas on overlaypane
      });
      // Use a canvas renderer for these points (for better performance) unless there are also polygons
      // to be rendered. We can't render them on separate canvases because of leaflet bug
      // https://github.com/Leaflet/Leaflet/issues/4135 which means if we have multiple canvases
      // only the top one gets events, and we can't put points and polygons on same canvas because
      // we can't control the drawing order of them then.
      if (!featureLayerHasFeatures) {
        // This is the "points layer" in the UI AND there are no features in the "features layer"
        marker.options.renderer = this.renderingCanvas;
      } else if (whichLayer == Layers.Features) {
        // - this is the "features layer" in the UI and these points have come from WKT or JSON in it
        // don't render on the canvas because we want them to render in the marker pane to ensure they go
        // over any polygons also in this WKT dataset, but we can't use a separate canvas to do this
      }
      return marker;
    };

    if (!this.leafletPointsLayer && whichLayer == Layers.Points) {
      this.leafletPointsLayer = L.Proj.geoJson(undefined, {
        onEachFeature: onEachFeature.bind(this),
        // do not set renderer, it gets set at the level of the points to be canvas or not as appropriate
        pointToLayer: buildMarker.bind(this),
      } as any);
      this.map && this.leafletPointsLayer.addTo(this.map);
    }
    if (!this.leafletFeaturesLayer && whichLayer == Layers.Features) {
      this.leafletFeaturesLayer = L.Proj.geoJson(undefined, {
        onEachFeature: onEachFeature.bind(this),
        renderer: this.renderingCanvas, // gets overridden for any points within the WKT features as described above
        pointToLayer: buildMarker.bind(this),
      } as any);
      this.map && this.leafletFeaturesLayer.addTo(this.map);
    }

    const leafletLayer =
      whichLayer == Layers.Points
        ? this.leafletPointsLayer
        : this.leafletFeaturesLayer;

    if (whichLayer==Layers.Features){
      this.currentFeatureIdentifiers.clear();
      this.toggleOnsAttribution(data.hasONSGeocodes)
    }
    // data implements GeoJSON FeatureCollection so we can add it directly!
    // we could just addData(data) rather than for each d of data, but then it's a single
    // operation and we don't have chance to display the notification. Although, it doesn't
    // generally seem to work anyway!
    for (const d of data) {
      if (!isSlowWarningShown && performance.now() - startTime > 4000) {
        this.UIManager.DisplayToastNotification(
          "Rendering features",
          "Waiting for features to be rendered"
        );
        isSlowWarningShown = true;
      }
      try {
        leafletLayer.addData(d);
        if(whichLayer==Layers.Features && typeof(d.sourceidentifier)==="string" ) {
          this.currentFeatureIdentifiers.add(d.sourceidentifier)
        }
      } catch (error) {
        if (error instanceof Error) {
          this.UIManager.addWarning(
            "An unexpected error occurred adding a feature to the map - not all features have been rendered"
          );
        }
      }
    }
    // if we have re-rendered polygons then re-set the where clause on reference layers to ensure that 
    // if they contain the same polygons as the data, the matched ones are not shown
    if(whichLayer == Layers.Features && this.refLayerManager){
      this.refLayerManager.UpdateReferenceWhere(this.currentFeatureIdentifiers);
    }
    // ensure points are in front (in case both points and polygons present in the powerbi "features" layer;
    // the powerbi marker points layer will be in front anyhow if both are present)
    this.leafletFeaturesLayer &&
      this.leafletFeaturesLayer.eachLayer(function (layer: L.Layer) {
        if (Object.hasOwn(layer, "feature")) {
          const f = layer["feature"] as OSMapsGeoJson;
          if(f.lockSymbology){
            //@ts-ignore
            layer.bringToBack();
          }
          else if (f.isLine) {
            // @ts-ignore
            layer.bringToFront();
          }
          else if (f.isPoint) {
            // @ts-ignore
            layer.bringToFront();
          }
        }
      });

    if (zoomOnAdd) {
      // If we have points and features this will now zoom the map to whichever has just been added,
      // not the total extent of both
      this.map &&
        this.map.fitBounds(data.knownBounds || leafletLayer.getBounds());
    }

    if (data.hasDuplicateGeometries) {
      this.UIManager.addWarning(
        `Data received from PowerBI contains duplicate ${
          whichLayer == Layers.Points ? "point locations" : "features"
        }` +
          ", which may not be what is wanted. " +
          "For example there may be multiple rows of data associated with the same location. " +
          `There are ${data.length_unique_geoms} unique geometries and ${data.length} rows in total. ` +
          "Consider applying a summary such as Count on the popup, colour, and size fields. " +
          (data.suppressDuplicateGeoms
            ? "For now only the first 'copy' of each feature has been symbolised, but all will be shown in "+
            "popups."
            : ""), "duplicateData"
      );
    } else {
      this.UIManager.removeUnseenNotifsById("duplicateData")
    }
    this.UIManager.DisplayToastNotification();
  }

  // TODO move to DOMManager, maybe
  public ToggleSpinner(turnOn: boolean) {
    // @ts-ignore
    this.map.spin(turnOn);
  }

  /**
   * Cancels the pending extent autosave timeout.
   * @private
   */
  private cancelExtentAutosave(){
    clearTimeout(this.saveExtentTimeout);
  }

  /**
   * Cancels the pending layer autosave timeout.
   * @private
   */
  private cancelLayerAutosave(){
    clearTimeout(this.saveLayerTimeout);
  }

  /**
   * Returns features at the clicked map point. 
   * Using default leaflet click handling on features only gives us the top feature at the clicked point, 
   * but we want to show all features at that point in the popup, so we have to find them ourselves. 
   * IDE shows this method as not being used but it is actually used in the click handler for the map
   * @param lat Latitude of the clicked point.
   * @param lng Longitude of the clicked point.
   * @returns Array of overlapping features.
   * @private
   */
  private getFeaturesAtClickedPoint(lat, lng): OSMapsGeoJson[] {
    function convertClickedPointCRS(feature: OSMapsGeoJson, lat, lng) {
      if (
        feature.crs &&
        feature.crs.properties.name &&
        feature.crs.properties.name === "EPSG:27700"
      ) {
        
        const convertedPointCoords = proj4("EPSG:4326", "EPSG:27700", [
          lat,
          lng,
        ]);
        let convertedPointCoordsRounded = convertedPointCoords.map((coord) =>
          Math.round(coord)
        );
        let convertedPoint = turf.point(convertedPointCoordsRounded);
        return convertedPoint;
      }
      return turf.point([lat, lng]);
    }

    const overlappingFeatures = [];
    if (this.leafletFeaturesLayer) {
      // Iterate through layers
      this.leafletFeaturesLayer.eachLayer(function (layer: L.Layer) {
        if (Object.hasOwn(layer, "feature")
        ) {
          const f = layer["feature"] as OSMapsGeoJson;
          if (f.isPolygon) {
          // convert crs of clicked point to point in poly/line works
          let clickedPoint = convertClickedPointCRS(f, lat, lng);

          const isWithin = turf.booleanPointInPolygon(
            clickedPoint,
            // @ts-ignore
            f.geometry
          );
          if (isWithin) {
            overlappingFeatures.push(f);
          }
        } else if (f.isLine
        ) {
          let clickedPoint = convertClickedPointCRS(f, lat, lng);
          // could use point to line distance to create a tolerance
          // const distance = turf.pointToLineDistance(clickedPoint,
          //   layer.feature.geojson_geometry)
          //   console.log(distance)
          const isWithin = turf.booleanPointOnLine(
            clickedPoint,
            // @ts-ignore
            f.geometry
          );
          if (isWithin) {
            overlappingFeatures.push(f);
          }
        }}
      });
    }
    return overlappingFeatures;
  }

  /**
   * Finds duplicate geometries for a feature in a collection.
   * The featurecollection will not have rendered duplicate geometries on the map, but they may be present in the data and 
   * we want to show them in the popup if so.
   * IDE shows this method as not being used but it is actually used in the click handler for the map.
   * @param feature The feature to check.
   * @param featureCollection The collection to search.
   * @returns Array of duplicate features.
   * @private
   */
  private findDuplicateGeometries(feature: OSMapsGeoJson, featureCollection:OSMapsCartographicFeatureCollection) {
    let allFeatures = []
    if (featureCollection.hasDuplicateGeometries) {
      const sameGeoms: OSMapsGeoJson[] =
      featureCollection.hashToFeaturesDict[feature.geometryIdentifier];
      const uniqueFeatureIdentifiers = new Set<string>(
      );

      // only show duplicate geoms if they got unique attributes
      
        sameGeoms.forEach((item) => {
          if (item.featureIdentifier != feature.featureIdentifier &&!uniqueFeatureIdentifiers.has(item.featureIdentifier)) {
            uniqueFeatureIdentifiers.add(item.featureIdentifier);
            allFeatures.push(item);
          }
        });
    }
    return allFeatures;
  }

  /**
   * Creates a popup for a reference layer feature. 
   * Note that the reference layer is a self-contained layer that is not connected to the Power BI data model, and
   * is implemented using ESRI-leaflet feature layers. Therefore it does not have a buildPopupHTML method, so we build
   * the popup content here instead.
   * @param feature The feature.
   * @param latlng The popup location.
   * @returns The created popup.
   * @private
   */
  private createReferencePopup(feature, latlng){
    const content = `<div class="leaflet-popup-content__attributes">
    <table class='leaflet-popup__attributes-table'>
    <tbody>
    <tr><td title="Identifier">Identifier:</td><td>${feature.properties.identifier}</td></tr>
    </tbody></table>
    </div>`
    // Close any existing popup
    if (this.popup) {
      this.popup.remove(); // Use remove() to ensure the popup is properly closed
    }

    // Create and open the new popup
    this.popup = L.popup()
      .setLatLng(latlng)
      .setContent(content)
      .openOn(this.map);

    return this.popup;
  }

  /**
   * Creates a paginated popup for multiple features at a location.
   * We use this approach instead of leaflet's native popup functionality, or for that matter the 
   * PowerBI tooltip functionality, because that only allows one popup per location, whereas we want 
   * to show all features at a location in the popup, so we build our own pagination within the popup content.
   * IDE shows this method as not being used but it is actually used in the click handler for the map
   * @param features Array of features.
   * @param latlng The popup location.
   * @returns The created popup.
   * @private
   */
  private createPaginatedPopup(features: OSMapsGeoJson[], latlng, hideDefaultPopupFields:boolean, showIdentifier:boolean): L.Popup {
    let currentIndex = 0;

    function generatePopupContent() {
      const feature = features[currentIndex];
      const popupContent = feature.getPopupHTML(hideDefaultPopupFields, showIdentifier)
      const totalFeatures = features.length;

      // Check if there is only one feature
      const isSingleFeature = totalFeatures === 1;

      return `
          <div class="leaflet-popup-content__attributes">
              ${popupContent}
          </div>
          ${
            !isSingleFeature
              ? `
                  <div class="leaflet-popup-content__fixed-footer">
                      <div class="leaflet-popup-content__buttons">
                          <button class="leaflet-popup-content__paging-button" id="prevFeature" ${
                            currentIndex === 0 ? "disabled" : ""
                          }>Previous</button>
                          <button class="leaflet-popup-content__paging-button" id="nextFeature" ${
                            currentIndex === totalFeatures - 1
                              ? "disabled"
                              : ""
                          }>Next</button>
                      </div>
                      <div>Feature ${
                        currentIndex + 1
                      } of ${totalFeatures}</div>
                  </div>
                  `
              : ""
          }
      
  `;
    }

    function attachEventListeners(popup) {
      const prevButton = popup
        .getElement()
        .querySelector("#prevFeature");
      const nextButton = popup
        .getElement()
        .querySelector("#nextFeature");

      if (prevButton) {
        prevButton.addEventListener("click", function (e) {
          e.stopPropagation(); // Stop the event from propagating to the map
          if (currentIndex > 0) {
            currentIndex--;
            updatePopupContent();
          }
        });
      }

      if (nextButton) {
        nextButton.addEventListener("click", function (e) {
          e.stopPropagation(); // Stop the click propagating to the map
          if (currentIndex < features.length - 1) {
            currentIndex++;
            updatePopupContent();
          }
        });
      }
    }

    // made this an arrow function so I could use lexical scope and access this more easily - seemed weird to extract it as a method on the class but can change if you disagree
    const updatePopupContent = () => {
          const content = generatePopupContent();
          if (this.popup) {
            this.popup.setContent(content);
            this.popup.update();
            attachEventListeners(this.popup);
          }
        };

    // Close any existing popup
    if (this.popup) {
      this.popup.remove(); // Use remove() to ensure the popup is properly closed
    }

    // Create and open the new popup
    this.popup = L.popup()
      .setLatLng(latlng)
      .setContent(generatePopupContent())
      .openOn(this.map);

    // Initial attachment of event listeners
    attachEventListeners(this.popup);

    return this.popup;
  }
 
}

interface LassoHandlerFinishedEventData {
    originalEvent: MouseEvent;
    latLngs: L.LatLng[];
    layers: L.Layer[];
  }

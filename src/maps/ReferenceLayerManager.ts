import * as esri from "esri-leaflet";
import {OSPowerBIMapManager}  from "./mapmanager"
import {ParsedCardSettingsWrapper} from "../settings/PowerBISettings"
import { isEqual } from "lodash";
import { LegendGenerator } from "../types/carto-types";
import { GSS_CHECKER } from "../utils/Geocode_Utils";
import { GeoportalServiceManager } from "../utils/GeoportalServiceManager";
import { LogRecord, LogRecordTypes } from "../logging/LoggingTypes";
import { OSPowerBIUIManager } from "../ui/uimanager";
import { LegendSymbolOverrides, SymbolConfiguration } from "../types/powerbi-datamodel-types";

/**
 * Manages reference (contextual) layers on the map, such as administrative boundaries, from ESRI 
 * feature services. These are separate from the "data" layers which are connected to the Power BI data model 
 * and which the user uploads or codes via GSS codes.
 * The reference layers are added based on GSS codes entered by the user in the formatting pane, and are automatically 
 * updated as features are added or removed from the map so that they always provide context for the features on the 
 * map without overlapping them. 
 * The reference layers are styled based on settings in the formatting pane, but have a fixed style otherwise (e.g. they 
 * are not coloured by any data field).
 * The reference layers are implemented using ESRI-leaflet feature layers, so that we can benefit from their caching 
 * and auto-simplification etc. When the user enters GSS codes to show reference layers, we parse those to work out 
 * which feature service(s) we need to pull from, and then add feature layers with where clauses to only pull the 
 * relevant features. When features are added or removed from the map, we update the where clauses on the relevant 
 * reference layer(s) to add or remove those features from the reference layer as needed.
 * We also log metrics on the reference layers, such as how many features are being shown in them, to help us understand 
 * how users are using them.
 * The reference layers also have popups which show the attributes of the features when clicked, to provide more context 
 * to users about the reference features.
 * The reference layers are also included in the legend with a fixed entry (e.g. "Reference layer features") so that 
 * users can see what they look like on the map and understand that they are reference layers providing context 
 * for the data features.
 * The code is structured as a class OSPowerBIReferenceLayerManager which has methods to update the reference layers 
 * based on current settings and map features, and to generate legend entries for the reference layers. It uses 
 * a GeoportalServiceManager to parse the GSS codes and get the relevant feature service details, and it interacts
 * with the OSPowerBIMapManager to add/remove/update the layers on the map.
 */
export class OSPowerBIReferenceLayerManager implements LegendGenerator {
  private mapManager: OSPowerBIMapManager;
  private serviceManager: GeoportalServiceManager;
  private symbolConfig: SymbolConfiguration
  protected legendDiv: HTMLElement|null;
  private referenceGssCodes: Set<string> = new Set<string>;
  private referenceLayers: Record<string, esri.FeatureLayer> = {};
  private _useDetailedGeom: boolean;
  private UIManager: OSPowerBIUIManager;
  
  /**
   * Private constructor. Use the static factory method to create an instance.
   */
  private constructor(MapManager: OSPowerBIMapManager, serviceManager: GeoportalServiceManager, UIManager: OSPowerBIUIManager){
      this.mapManager = MapManager;
      this.serviceManager = serviceManager;
      this.UIManager = UIManager;
  }

  /**
   * Factory method to asynchronously create a reference layer manager.
   */
  static async OSPowerBIReferenceLayerManager(mapManager: OSPowerBIMapManager, UIManager: OSPowerBIUIManager){
    const serviceManager = await GeoportalServiceManager.GeoportalServiceManager();
    return new OSPowerBIReferenceLayerManager(mapManager, serviceManager, UIManager);
  }

  /**
   * Adds alpha transparency to a color string.
   * @param color The base color.
   * @param opacity The opacity value (0-1).
   * @returns The color with alpha applied.
   */
  protected addAlpha(color: string, opacity: number): string {
    // coerce values so ti is between 0 and 1.
    const _opacity = Math.round(Math.min(Math.max(opacity || 0, 0), 1) * 255);
    return color + _opacity.toString(16).toUpperCase();
  }
  
  /**
   * Returns a legend entry for the reference layer.
   * @param namestring The name for the legend.
   * @param opacity Optional opacity.
   * @param withBorder Optional border flag.
   */
  getLegendEntriesDiv(options:LegendSymbolOverrides): HTMLElement {
    if(!this.referenceGssCodes.size) { return null;}
    if(this.legendDiv) { return this.legendDiv; }
    const layerLegendDiv = document.createElement('div');
    layerLegendDiv.className = 'legend__legend-item';
    
    const layerTitleDiv = document.createElement('div');
    layerTitleDiv.className = 'legend__legend-item__title';
    layerTitleDiv.textContent = options.legendName;
    layerTitleDiv.title = options.legendName;
    layerLegendDiv.appendChild(layerTitleDiv);

    const stepsDiv = document.createElement('div');
    stepsDiv.className = "legend__category-legend";
    layerLegendDiv.appendChild(stepsDiv);

    const patchDiv = document.createElement('div');
    patchDiv.style.border = `${this.symbolConfig.lineThickness}px solid black`
    const fadedColour = this.addAlpha(this.symbolConfig.colour, this.symbolConfig.opacity);
    patchDiv.style.backgroundColor = fadedColour;
    // no fill for null values! 
    patchDiv.className = "legend__category-legend__patches"
    stepsDiv.appendChild(patchDiv);
    const labelDiv = document.createElement('div');
    labelDiv.textContent = "Reference layer features";
    stepsDiv.appendChild(labelDiv);

    this.legendDiv = layerLegendDiv;
    return layerLegendDiv;
  }

  /**
   * Updates reference layers based on current settings and map features.
   */
  async updateReferenceLayers(settings: ParsedCardSettingsWrapper, mapFeatureIdentifiers:Set<string>, renderer:L.Canvas|L.SVG){
      // Add specified GSS Codes as a "reference" layer, not connected to the powerbi data model.
      // For this we can use ESRI-leaflet feature layers and thus benefit from their caching, auto-simplification 
      // etc
      
      // Initialize metrics objects
      let allGeocodeMetrics = {};
      let totals = 0;

      // layer styling stuff
      const settingsCard = settings.refLayerStylingCard;
      const configCard = settings.refLayerConfigCard
      const newGssCodes = configCard.OverlayCodes;
      this.symbolConfig = settingsCard.DefaultStylingProperties
      this.legendDiv = null;

      const setStyle = function(feat){
        return {
          color:"black",// this.symbolConfig.borderColour,
          weight: this.symbolConfig.lineThickness,
          dashArray:this.symbolConfig.lineStyle,
          fillOpacity:this.symbolConfig.opacity,
          fillColor:this.symbolConfig.colour
        }
      }.bind(this)
  
      // clean identifiers and check they are valid gss codes
      const identifiers = newGssCodes.split(/[,;\s]+/).flatMap((x) => (x ? [x] : []));
      const cleanIdentifiers = new Set<string>;
      identifiers.forEach((i) => {
        if (typeof(i) != "string") { return }
        const clean = i.toUpperCase().trim();
        if (GSS_CHECKER.test(clean)){
          cleanIdentifiers.add(clean);
        }
      });

      // check if need new detailed geoms returned and if we do, 
      // remove the layers
      const newUseDetailedGeom = settings.mapSettingsCard.useDetailedGeom;
      if (newUseDetailedGeom !== this._useDetailedGeom){
        for(const prefix in this.referenceLayers){
          // delete all layers and referencegsscodes
          const lyr = this.referenceLayers[prefix];
          lyr.remove();
        }
        this.referenceLayers = {};
        //Removing existing reference layers due to detail level change
        this.referenceGssCodes.clear();
        this._useDetailedGeom = newUseDetailedGeom;
      }

      // No change to codes (after removing duplicates, trimming, etc), just update the style
      if (isEqual(cleanIdentifiers, this.referenceGssCodes)){
        for(const prefix in this.referenceLayers){
          const lyr = this.referenceLayers[prefix];
          lyr.setStyle(setStyle);
        }
        return; 
      }
      // Otherwise update the reference layers themselves (there is one per featureservice i.e. 
      // one per GSS code type/prefix), either removing if no longer needed, adding if not already
      // in use, or simply updating the where clause if existing and still used
      this.referenceGssCodes = cleanIdentifiers; // has no duplicates
      const queries = await this.serviceManager.parseServiceDetails(Array.from(cleanIdentifiers), this._useDetailedGeom)
      for (const prefix in this.referenceLayers){
        // if we have an existing layer but not longer any codes for it then delete it
        if (!(prefix in queries)){
          const lyr = this.referenceLayers[prefix];
          lyr.remove();
          delete(this.referenceLayers[prefix]);
        }
      }

      for (const prefix in queries){
        const params = queries[prefix];

        // set log as number of codes being requested? 
        // Not sure if should have more like GSS code geocode log?
        let totalRequested = params.codes.length
        // Store metrics for the current prefix
        allGeocodeMetrics[prefix] = totalRequested;
        // Update totals
        totals += totalRequested;

        // figures out codes not in pbi data so it doesn't show both reference layers and data at same time 
        const codesNotInData = new Set<string>(params.codes.filter(item=>!mapFeatureIdentifiers.has(item)));
        const in_clause = `${params.codefield} IN (` +
          Array.from(codesNotInData).map((i) => `'${i}'`).join(",") +
        ")";

        let layer;
        if (prefix in this.referenceLayers){
          // we have already had this layer, the codes for it may have changed
          layer = this.referenceLayers[prefix];
          layer.setWhere(in_clause);
        }
        else {
          // build the layer, we will keep it until there are no longer any codes for it present, so that we 
          // don't have to rebuild it each time the codes change and thus can keep its cache
          layer = esri.featureLayer({
            url: params.URL,
            style:setStyle,
            //@ts-ignore
            pane:'referenceOverlays',
        
            renderer: renderer,
            //cacheLayers:true,
            onEachFeature(feature, layer) {
                feature.properties['identifier'] = feature.properties[params.codefield.trim()]
            },
          });
          layer.on({
            click: function(e) {
              const popup = this.createReferencePopup(e.layer.feature, e.latlng);
              this.map.openPopup(popup);
              //console.log(e.layer.feature.properties);
            }.bind(this.mapManager),
            load: function(){
              layer.eachFeature(function(lyr){
                //console.log(lyr);
                lyr.bringToBack();
  
              })
            }
          });
          layer.setWhere(in_clause);
          this.mapManager.map.addLayer(layer);
          this.referenceLayers[prefix] = layer;
        }
      }
      
      // Add totals to allGeocodeMetrics
      allGeocodeMetrics['totals'] = totals;
      this.logReferenceLayer(allGeocodeMetrics)
    }

  /**
   * Logs reference layer metrics.
   */
  private logReferenceLayer(allGeocodeMetrics) {
    let logRecord: LogRecord = new LogRecord();
    logRecord.metric = LogRecordTypes.REFERENCE_LAYER;
    logRecord.logTime = new Date();
    logRecord.logEntry = allGeocodeMetrics;
    logRecord.isEditMode = this.UIManager.isEditMode;
    logRecord.apiKey = this.UIManager.visual.formattingSettings.apiKey;
    this.UIManager.visual.sendLogRecord(logRecord)
  }

  /**
   * Updates reference layers for a subset of map features.
   */
  async UpdateReferenceWhere(mapFeatureIdentifiers:Set<string>){
     // When features are added to the map, we want to remove them from the reference layer (if they're shown in it),
    // in case the data features are transparent but the reference features aren't.
    // When features are removed, we want to re-add them back to the reference layer. 
    // So that if codes have been entered to make a reference layer covering an area, this will automatically update 
    // so that the coverage is maintained without an actual overlap with the data features.
    const queries = await this.serviceManager.parseServiceDetails(Array.from(this.referenceGssCodes), this._useDetailedGeom);
    for (const prefix in queries){
      const params = queries[prefix];
      const codesNotInData = new Set<string>(params.codes.filter(item=>!mapFeatureIdentifiers.has(item)));
      const in_clause = `${params.codefield} IN (` +
        Array.from(codesNotInData).map((i) => `'${i}'`).join(",") +
      ")";
      if (prefix in this.referenceLayers){
        // we have already had this layer, the codes for it may have changed
        const layer = this.referenceLayers[prefix];
        layer.setWhere(in_clause);
      }
    }
  }
}
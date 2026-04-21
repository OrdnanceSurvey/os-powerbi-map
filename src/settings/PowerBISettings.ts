/**
 * Contains Power BI formatting settings cards and models for the OS Maps visual.
 * Each card represents a group of settings shown in the Power BI formatting pane.
 * The ParsedCardSettingsWrapper aggregates all cards and provides accessors and logic.
 */

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import FormattingSettingsModel = formattingSettings.Model;
import { SettingsChangeTypes } from "../datamodels/SettingsStateProcessors";
import { isEqual } from "lodash";

import { StylingSettingsDropdownsCard } from "./styling/styling-dropdown-container";
import { PersistedSettingsHolderCard } from "./persistence";
import { ReferenceLayerSettingsCard } from "./data-controls/reference-layer-settings";
import { UserDataSettingsCard } from "./data-controls/user-data-upload-settings";
import { MapSettingsCard } from "./map-settings";

import { ControlDisplayStatus } from "../datamodels/SettingsStateProcessors";

/**
 * The main settings model for the visual, containing all cards and accessors.
 * Instantiated by Power BI based on the UI controls.
 */
export class ParsedCardSettingsWrapper extends FormattingSettingsModel {
  /** Map settings card. */
  mapSettingsCard = new MapSettingsCard();
  /** Persisted settings card - not shown to the user, this is where the visual stores state and data. */
  persistedSettingsCard = new PersistedSettingsHolderCard();
  // symbology card, contains multiple sub-cards for different layer types
  public stylingSettingsCard: StylingSettingsDropdownsCard = new StylingSettingsDropdownsCard();
  /** Reference layer settings card. */
  refLayerConfigCard = new ReferenceLayerSettingsCard();
  /** User data upload settings card. */
  uploadedDataConfigCard = new UserDataSettingsCard();
  
  cards = [
    this.mapSettingsCard,
    this.stylingSettingsCard,
    this.refLayerConfigCard,
    this.uploadedDataConfigCard,
    this.persistedSettingsCard,
  ];
  
  // ***********   ACCESSORS   *************** //
  
  /** Accessors to the individual symbology cards for convenience. */
  get markerPointCartoSettingsCard() {return this.stylingSettingsCard.markerStylingCard;}
  /** Feature cartography settings card. */
  get featureCartoSettingsCard() {return this.stylingSettingsCard.featureStylingCard;}
  /** Unmatched data styling settings card. */
  get unmatchedDataStylingCard() {return this.stylingSettingsCard.unmatchedStylingCard;}
  /** Reference layer styling settings card. */
  get refLayerStylingCard() {return this.stylingSettingsCard.refStylingCard;}

  // provide accessors at this top settings wrapper level to some things set on the 
  // individual cards, to minimise hassle if we change the cards themselves around
  get zoomPanSelectStatus(){ return this.mapSettingsCard.zoomPanSelectStatus;}
  /** Gets the API key. */
  get apiKey(){ return this.mapSettingsCard.apiKey;}
  get apiKeyStatus():"free" | "premium" | "invalid" | "not_determined"{ 
    if (this.persistedSettingsCard.lastKeyStatus.value ==="free"
      || this.persistedSettingsCard.lastKeyStatus.value ==="premium"
      || this.persistedSettingsCard.lastKeyStatus.value ==="invalid"
      || this.persistedSettingsCard.lastKeyStatus.value ==="not_determined"){
      return this.persistedSettingsCard.lastKeyStatus.value;
    }
    return "not_determined";
  } 
  set apiKeyStatus(value:string){ this.persistedSettingsCard.lastKeyStatus.value = value;}
  /** Whether the current dataview is filtered. */
  dataviewIsFiltered:boolean

  // ***********   LOGIC   *************** //
  /**
   * Ensures that settings values are consistent (e.g., min size ≤ max size).
   */
  ensureConsistency():void{
    // check values on settings pane are consistent and correct if not (no such thing as a range slider)
    // - Ensure that value of min size is not greater than value of max size
     this.markerPointCartoSettingsCard.PointSizeMin = 
      Math.min(
        this.markerPointCartoSettingsCard.PointSizeMin,
        this.markerPointCartoSettingsCard.PointSizeMax
      );
    this.featureCartoSettingsCard.PointSizeMin = 
      Math.min(
        this.featureCartoSettingsCard.PointSizeMin,
        this.featureCartoSettingsCard.PointSizeMax
      );
     // TODO any other consistency checks for any of the settings can go here
    //this.uploadedDataSettingsCard.unmatchedDataSettings.visible = this.uploadedDataSettingsCard.showUnmatchedLocalFeatures;
  }

  /** Updates the display of controls based on data presence.
   * @param controlsVisibility An object indicating which controls should be hidden or shown, and how.
   * Individual cards can then use this info to update their own controls accordingly.
   * This is necessary because all controls (including this one) are re-created on every update and 
   * so any dynamic changes to control visibility and labelling need to be re-applied each time.
   * (As opposed to control _values_ which are persisted automatically by Power BI or via persistProperties.)
   */
  updateControlsDisplay(controlsVisibility: ControlDisplayStatus):void{
    this.stylingSettingsCard.markerStylingCard.hasSizeData = controlsVisibility.pointSizingPresent;
    this.stylingSettingsCard.markerStylingCard.colourDataType = controlsVisibility.pointColouringType;
    this.stylingSettingsCard.featureStylingCard.hasSizeData = controlsVisibility.featureSizingPresent;
    this.stylingSettingsCard.featureStylingCard.colourDataType = controlsVisibility.featureColouringType;
    //this.stylingSettingsCard.featureStylingCard.colourFieldName = controlsVisibility.featureColourFieldname;
    this.uploadedDataConfigCard.uploadDataControls.displayName = controlsVisibility.uploadFilename ? `${controlsVisibility.uploadFilename}` : "Configure uploaded data";
    this.uploadedDataConfigCard.uploadDataControls.joinFieldname = controlsVisibility.featureJoinFieldname;
  }

  /**
   * Checks whether the current settings are valid.
   */
  settingsAreValid():void{
    // TODO this would be a good place for logic determining whether the current settings
    // overall are valid (api key is good etc), maybe
  }

  /**
   * Compares this settings object to a previous one and returns a summary of what changed.
   * This is used by the visual to determine what needs to be updated/reprocessed/redrawn.
   * @param oldSettings The previous settings object.
   * @returns A SettingsChangeTypes instance describing the changes.
   */
  whatChanged(oldSettings: ParsedCardSettingsWrapper):SettingsChangeTypes {
    if (!oldSettings) {
      const c = new SettingsChangeTypes();
      c.SetChangeEverything();
      c.SetAutozoom(this.mapSettingsCard.autoZoom);
      return c;
    }
    const changeSummary = new SettingsChangeTypes();
    // todo there is scope to simplify this because I think only one thing can change at a time so 
    // we can just return as soon as we find a change, but for now this is clearer and more explicit
    changeSummary.SetAutozoom(this.mapSettingsCard.autoZoom);
    changeSummary.APIKey = this.mapSettingsCard.apiKey != oldSettings.mapSettingsCard.apiKey;
    changeSummary.MapProjection = this.mapSettingsCard.useOSGB != oldSettings.mapSettingsCard.useOSGB;
    changeSummary.UsingPremium = this.mapSettingsCard.usePremium != oldSettings.mapSettingsCard.usePremium;
    changeSummary.LegendShown = this.mapSettingsCard.showLegend != oldSettings.mapSettingsCard.showLegend;
    changeSummary.UploadJoinField = !isEqual(this.uploadedDataConfigCard.SelectIdentifierField.value, oldSettings.uploadedDataConfigCard.SelectIdentifierField.value);
    changeSummary.UploadedData = !isEqual(this.uploadedDataConfigCard.FileName, oldSettings.uploadedDataConfigCard.FileName);
    changeSummary.UnmatchedLocalFeatures = this.uploadedDataConfigCard.showUnmatchedLocalFeatures != oldSettings.uploadedDataConfigCard.showUnmatchedLocalFeatures;
    changeSummary.UploadToggle = this.uploadedDataConfigCard.uploadDataToggle.value && !oldSettings.uploadedDataConfigCard.uploadDataToggle.value;
    
    changeSummary.PointCartoSettings = !this.markerPointCartoSettingsCard.isEqual(oldSettings.markerPointCartoSettingsCard)
    changeSummary.FeatureCartoSettings = !(this.featureCartoSettingsCard.isEqual(oldSettings.featureCartoSettingsCard)
      && this.unmatchedDataStylingCard.isEqual(oldSettings.unmatchedDataStylingCard));

    changeSummary.ZoomPanSelectStatus = this.mapSettingsCard.zoomPanSelectStatus != oldSettings.mapSettingsCard.zoomPanSelectStatus;
    changeSummary.FilterState = this.dataviewIsFiltered != oldSettings.dataviewIsFiltered
    changeSummary.ReferenceFeatures = (this.refLayerConfigCard.OverlayCodes != oldSettings.refLayerConfigCard.OverlayCodes) ||
      (this.refLayerConfigCard.OverlayCodes.length && (this.mapSettingsCard.useDetailedGeom != oldSettings.mapSettingsCard.useDetailedGeom))
    changeSummary.ReferenceCartoSettings = !changeSummary.ReferenceFeatures && !isEqual(this.refLayerStylingCard, oldSettings.refLayerStylingCard)
    return changeSummary;
  }

  /**
   * Returns a LayerCartoSettings object for the specified layer.
   * @param whichLayer The layer (Points or Features).
   * @returns The LayerCartoSettings for the layer.
   */
  getCartoSettings(whichLayer: Layers){
    return new ScalableLayerCartoSettings(this, whichLayer);
  }
}

/**
 * Aggregates all cartography-related settings for a single map layer (points or features).
 * TODO this may be no longer useful as we have refactored the cartography settings into their own cards,
 * rather than being mixed into an all-layers + specific-layer card as before,
 * but leaving in place for now to avoid breaking other code - can be removed later.
 */
export class ScalableLayerCartoSettings {
  // wraps the values from the UI settings cards in  order to provide all the info necessary
  // for one map layer (a CartographicFeatureCollection) from multiple Cards; this
  // is just to reduce the number of places we need to make changes if we change card 
  // configuration.
  public ColourMin?: string;
  /** Maximum colour value for the layer. */
  public ColourMax: string;
  /** Proportion of values to clip from the colour scale (0-1). */
  public ColourClip: number;
  /** Proportion of values to clip from the size scale (0-1). */
  public PointSizeClip: number;
  /** Whether to use default categorical colours. */
  public DefaultCategoricalColours: boolean;
  /** Default opacity for the layer. */
  public defaultOpacity: number;
  /** Opacity for highlighted features. */
  public highlightOpacity: number;
  /** Maximum point/feature size. */
  public PointSizeMax?: number;
  /** Minimum point/feature size. */
  public PointSizeMin?: number;
  /** Line or border thickness. */
  public lineThickness?: number;
  /** Colour to use for selected features. */
  public ColourSelected: string;
  
  /**
   * Constructs a LayerCartoSettings object from the settings wrapper and layer type.
   * @param formattingSettings The parsed settings wrapper.
   * @param whichLayer The layer (Points or Features).
   */
  constructor(formattingSettings: ParsedCardSettingsWrapper, whichLayer:Layers) {
    const layerSettingsCard = whichLayer==Layers.Points 
      ? formattingSettings.markerPointCartoSettingsCard :
      //: whichLayer==Layers.Features ? 
        formattingSettings.featureCartoSettingsCard
      //: whichLayer==Layers.Reference ? formattingSettings.refLayerStylingCard
      //: formattingSettings.unmatchedDataStylingCard;

      // settings common to either layer but different for each
    this.ColourMax = layerSettingsCard.ColourMaxOrDefault;
    this.ColourMin = layerSettingsCard.ColourMin;
    this.ColourClip = layerSettingsCard.ColourClip;
    this.PointSizeClip = layerSettingsCard.PointSizeClip;
    this.defaultOpacity = layerSettingsCard.defaultOpacity;
    // this prob shouldn't be here, only in put-on-map bit
    this.highlightOpacity = this.defaultOpacity * 1.2;
    
    this.PointSizeMax = layerSettingsCard.PointSizeMax;
    this.PointSizeMin = layerSettingsCard.PointSizeMin;
    this.lineThickness = layerSettingsCard.LineThickness;
    this.DefaultCategoricalColours = layerSettingsCard.DefaultCategoricalColours;
    
    // settings shared between layers
    this.ColourSelected = formattingSettings.mapSettingsCard.ColourSelected;
    
  }
}

/**
 * Enum for the two main map layers: Points and Features.
 */
export enum Layers {
  Points,
  Features,
  //Reference,
  //UnmatchedLocalFeatures
}


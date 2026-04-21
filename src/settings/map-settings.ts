import { formattingSettings} from "powerbi-visuals-utils-formattingmodel";
import FormattingSettingsSlice = formattingSettings.Slice;
import { colours } from "../resources";

/**
 * Card for map-level settings, including API key, projection, zoom, and legend options.
 * Contains logic to determine zoom level ranges and spatial reference based on settings.
 */
export class MapSettingsCard extends formattingSettings.SimpleCard {
  
  // ***********   CONTROLS   *************** //
  usePremiumData = new formattingSettings.ToggleSwitch({
    name: "usePremiumData",
    displayName: "Use Premium data",
    value: false,
    description:
      "If selected then the visual will allow map zoom levels and layers \
        that count as premium data (chargeable), if your API key allows this. \
        If your key does not allow premium data then this setting will have no effect. \
        Turn this off if you have a premium key but do not wish to use premium data to avoid incurring charges.",
  });
  apiKeyField = new formattingSettings.TextInput({
    name: "apiKey",
    displayName: "OS API Key",
    value: "",
    placeholder: "Enter OS API Key",
    description:
      "Enter your OS API key here, this must have Maps API access enabled. \
        If it is a premium key then you will be able to zoom the map to higher zoom levels, and will have \
        access to the OS Leisure layer, by enabling the Premium data toggle below, \
        but if it is a free key then this will not work.",
  });
  useOSGB_UI = new formattingSettings.ToggleSwitch({
    name: "useOSGB",
    displayName: "Use BNG for map",
    value: true,
    description:
      "If selected then the map will be displayed using the OSGB coordinate system rather \
      than Web Mercator. (You can still use OSGB coordinates in your data no matter whether \
      this is set or not)."
  });
  // currently we don't display this setting as the zoom pan select has performance issues
  zoomPanSelect_UI = new formattingSettings.ToggleSwitch({
    name: "zoomPanSelect",
    displayName: "Select visible data on zoom/pan",
    value: false,
    description: "If selected then each time you zoom or pan the map this will cause the visible features \
    to be selected, meaning that other visuals using the same data will update accordingly. \
    This is an alternative to using the lasso tool to make selections."
  });
  showLegend_UI = new formattingSettings.ToggleSwitch({
    name: "showLegend",
    displayName: "Display legend on map",
    value:true,
    description:
     "If selected then a legend will be shown on the map"
  });
  autoZoom_UI = new formattingSettings.ToggleSwitch({
    name:"autoZoom",
    displayName: "Auto-zoom to data",
    value:true,
    description:
      "If selected then the map will zoom/pan to fit visible data each time it changes (except when \
        this is due to filtering being enabled/disabled)"
  });
  showDebug_UI = new formattingSettings.ToggleSwitch({
    name: "showDebugMessages",
    displayName: "Show debug messages",
    value:false,
    description: "If selected then a greater number of messages about the visual's operation will \
    be shown in the info window, for example about geocoding calls. You don't need to use this for \
    normal use of the visual."
  });
  useMoreDetailedGeom_UI = new formattingSettings.ToggleSwitch({
    name: "useMoreDetailedGeom",
    displayName: "Use high-resolution GSS polygons (slower)",
    value: false,
    description: "If selected then a more detailed version of polygon geometries will be used for background \
    layers and in GSS geocoding. These will be more accurate but may be slow to load or pan around, depending on \
    the dataset. Changing this setting will cause the cached values to be discarded so may be slow to update for larger \
    datasets."
  });
  hideDefaultPopupFields_UI = new formattingSettings.ToggleSwitch({
    name: "hideDefaultPopupFields",
    displayName: "Hide default popup fields",
    value: true,
    description: "If selected then symbology fields (colour / size) will not be added to popups unless explicitly included in the popups field well."
  });
    ColourSelectedUI = new formattingSettings.ColorPicker({
    name: "selectionColour",
    value: { value: colours.CYAN_SELECT },
    displayName: "Selected feature colour",
    description: "Colour for features selected using the Lasso.",
  });
  ShowIdentifierInPopupUI = new formattingSettings.ToggleSwitch({
    name: "alwaysShowIdentifier",
    displayName: "Show identifier in popups",
    value: true,
    description: "Toggle to show/hide the identifier field (postcode, UPRN, GSS code, or upload join field) at the top of feature popups.",
  });
  
  // ***********   FORMATTINGSETTINGSCARD IMPLEMENTATION   *************** //
  /** Card name. */
  name: string = "mapSettings";
  /** Card display name. */
  displayName: string = "Map Settings";
  /** Array of formatting setting slices for this card. */
  slices: Array<FormattingSettingsSlice> = [
    this.apiKeyField, 
    this.usePremiumData, 
    this.useOSGB_UI, 
    //this.zoomPanSelect_UI, // uncomment to reenable zoom/pan select
    this.autoZoom_UI,
    this.showLegend_UI,
    this.showDebug_UI,
    this.useMoreDetailedGeom_UI,
   // this.hideDefaultPopupFields_UI // uncomment to reenable hide default popup fields toggle
   this.ColourSelectedUI,
   this.ShowIdentifierInPopupUI
  ];
  /** Card description. */
  description: string = "Settings in this card affect how the map itself behaves.";

  /**
   * Gets the minimum zoom level for the map. Number varies depending on whether OSGB projection is used, 
   * as the zoom levels are different in each projection.
   * @returns The minimum zoom level, determined according to projection.
   */
  getMinZoomLevel():number {
    return this.useOSGB_UI.value ? 0 : 7;
  }

  /**
   * Gets the maximum zoom level for the map, depending on projection and premium status.
   * @returns The maximum zoom level, determined according to projection, premium data setting,
   * and status of API key for premium data use.
   */
  getMaxZoomLevel(keyAllowsPremium: boolean): number {
    // see table at https://osdatahub.os.uk/docs/wmts/technicalSpecification
    // zoom levels available are different in each projection, also zoom levels that
    // count as premium are different too
    return this.useOSGB_UI.value
      ? this.usePremiumData.value && keyAllowsPremium
        ? 13
        : 9
      : this.usePremiumData.value && keyAllowsPremium
      ? 20
      : 16;
  }

  /**
   * Gets the default zoom level for the map.
   * @returns The default zoom level, depending on projection.
   */
  getDefaultZoomLevel(): number {
    return this.useOSGB_UI.value ? 7 : 14;
  }

  /**
   * Gets the spatial reference ID (SRID) for the map.
   * @returns The SRID numeric value as a string.
   */
  getSRID(): "27700" | "3857" {
    return this.useOSGB_UI.value ? "27700" : "3857";
  }

  /**
   * Gets the default map centre as a [lat, lon] tuple.
   * @returns The map centre, hardcoded to Ambleside coordinates.
   */
  getCentre(): [number, number] {
    // Ambleside like wot is in all the OS Maps demo pages
    return [54.425, -2.968];
  }

  /**
   * Gets the maximum bounds for the map.
   * @returns The map bounds as a tuple of [southwest, northeast]. Bounds are larger than 
   * the UK to allow for panning.
   */
  getMaxBounds(): [[number, number], [number, number]] {
    return [
      [49, -15],
      [62, 5]
      //[49.528423, -10.76418],
      //[61.331151, 1.9134116],
    ];
  }

  /** Gets the API key value. */
  get apiKey() { return this.apiKeyField.value}
  /** Gets whether OSGB projection is enabled. */
  get useOSGB() { return this.useOSGB_UI.value}
  /** Gets whether premium data is enabled. */
  get usePremium() { return this.usePremiumData.value}
  /** Gets the zoom/pan select status. */
  get zoomPanSelectStatus(){ return this.zoomPanSelect_UI.value}
  /** Gets whether auto-zoom is enabled. */
  get autoZoom(){ return this.autoZoom_UI.value}
  /** Gets whether debug messages are shown. */
  get showDebug(){ return this.showDebug_UI.value}
  /** Gets whether the legend is shown. */
  get showLegend() { return this.showLegend_UI.value}
  /** Gets whether detailed GSS polygons are used. */
  get useDetailedGeom() { return this.useMoreDetailedGeom_UI.value}
  get hideDefaultPopupFields() { return this.hideDefaultPopupFields_UI.value}
   /** Gets the selected feature colour. */
  get ColourSelected() {return this.ColourSelectedUI.value.value};
  /** Gets whether to always show the identifier in popups. */
  get ShowIdentifierInPopup() { return this.ShowIdentifierInPopupUI.value};
}

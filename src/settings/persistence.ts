import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import FormattingSettingsSlice = formattingSettings.Slice;

/**
 * Card for persisting geocode and map settings between sessions.
 * Not shown in the UI.
 */
export class PersistedSettingsHolderCard extends formattingSettings.SimpleCard {
  // This card will not be shown. It is simply a place for the persistProperties API to store a
  // stringified version of the geocode results, to cache them between sessions.
  // If other things need persisting too, they can be added here as additional textareas.
  geocodeResults = new formattingSettings.TextArea({
    name: "geocodeResults",
    displayName: "geocodeResults",
    value: "",
    placeholder: "",
  });
  polygonGeocodeResults = new formattingSettings.TextArea({
    name: "polygonGeocodeResults",
    displayName: "polygonGeocodeResults",
    value:"",
    placeholder:""
  });
  polygonGeocodeBounds = new formattingSettings.TextArea({
    name: "polygonGeocodeBounds",
    displayName: "polygonGeocodeBounds",
    value:"",
    placeholder:""
  });
  layername = new formattingSettings.TextArea({
    name: "layername",
    displayName: "layername",
    value: "",
    placeholder: ""
  });
  mapExtent = new formattingSettings.TextArea({
    name: "mapExtent",
    displayName:"mapExtent",
    value:"",
    placeholder:""
  });
  usingDetailedGeom = new formattingSettings.TextArea({
    name: "usingDetailedGeom",
    value:"",
    placeholder:""
  });
  uploadedGeojson = new formattingSettings.TextArea({
    name: "uploadedGeojson",
    displayName: "uploadedGeojson",
    value: "",
    placeholder: ""
  });
  uploadedGeojson_idfield = new formattingSettings.TextArea({
    name: "uploadedGeojson_idfield",
    displayName: "uploadedGeojson_idfield", 
    value: "",
    placeholder: ""
  });
  lastKeyStatus = new formattingSettings.TextArea({
    name: "lastKeyStatus",
    displayName: "lastKeyStatus",
    value: "not_determined",
    placeholder: ""
  });
  // in Desktop, when reloading a previously configured visual, the data seem to only be 
  // present on the second or later update (this may be a bug) - so we use this flag 
  // to indicate that we are expecting data to be present soon. If this is true, we'll know 
  // that when we first do get an update with data, it's not new data, just the initial load, 
  // and so we shouldn't zoom to it and overwrite any saved extent. 
  // If we don't do this then on desktop it'll zoom to the data every time we tab back to the 
  // visual's page in the report. 
  // This doesn't happen on the web version as the data is present on first load, which is a 
  // very annoying inconsistency that is surely a bug, making it hard to get this first-load behavior 
  // right without hacky solutions like this flag.
  expectingData = new formattingSettings.ToggleSwitch({
    name: "expectingData",
    displayName: "expectingData",
    value: false,
  });
  name: string = "osmapsPersistedSettings";
  /** Card display name. */
  displayName: string = "osmapsPersistedSettings";
  /** Array of formatting setting slices for this card. */
  slices: Array<FormattingSettingsSlice> = [
    this.geocodeResults, this.polygonGeocodeResults, this.polygonGeocodeBounds,
    this.layername, this.mapExtent, this.usingDetailedGeom, this.uploadedGeojson, 
    this.uploadedGeojson_idfield, this.lastKeyStatus, this.expectingData];
  visible: boolean = false;
}
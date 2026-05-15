import { ColourValueTypes } from "../types/carto-types";

/**
 * Tracks which settings or data aspects have changed in the visual.
 * Used to determine which parts of the map or UI need to be rebuilt or updated.
 */
export class SettingsChangeTypes {
  /** Indicates if point cartography settings have changed. */
  PointCartoSettings: boolean = false;
  /** Indicates if feature (polygon) cartography settings have changed, 
   * including unmatched features styling.
   */
  FeatureCartoSettings: boolean = false;
  /** Indicates if reference layer cartography settings have changed. */
  ReferenceCartoSettings: boolean = false;
  /** Indicates if authentication settings have changed. */
  AuthSettings: boolean = false;
  /** Indicates if the API key has changed. */
  APIKey: boolean = false;
  /** Indicates if premium features are being used. */
  UsingPremium: boolean = false;
  /** Indicates if the map projection has changed. */
  MapProjection: boolean = false;
  /** Indicates if the legend display status has changed. */
  LegendShown:boolean = false;
  /** Indicates if point locations have changed. */
  PointLocations: boolean = false;
  /** Indicates if point attributes have changed. */
  PointAttribs: boolean = false;
  /** Indicates if polygon locations have changed. */
  PolygonLocations: boolean = false;
  /** Indicates if polygon attributes have changed. */
  PolygonAttribs: boolean = false;
  /** Indicates if zoom/pan/select status has changed. */
  ZoomPanSelectStatus: boolean = false;
  /** Indicates if the filter state has changed. */
  FilterState: boolean = false;
  /** Indicates if reference features have changed. */
  ReferenceFeatures: boolean = false;
  UploadJoinField: boolean = false;
  UploadedData: boolean = false;
  UnmatchedLocalFeatures: boolean = false;
  UploadToggle: boolean = false;
  ChangeAll: boolean = false;
  /** Internal: Whether autozoom is enabled (not a change flag). */
  private _AutozoomIsEnabled: boolean = false;

  /**
   * Returns true if points should be rebuilt based on current change flags.
   * @returns {boolean}
   */
  get ShouldRebuildPoints(): boolean {
    return (
      this.ChangeAll ||
      this.PointLocations ||
      this.PointAttribs ||
      this.PointCartoSettings ||
      this.MapProjection
    );
  }
  /**
   * Returns true if the map should be re-zoomed based on current change flags and autozoom status.
   * @returns {boolean}
   */
  get ShouldRezoomMap(): boolean {
    if(!this._AutozoomIsEnabled) { return false; }
    return this.ChangeAll || ((this.PointLocations || this.PolygonLocations) && !this.FilterState);
  }
  /**
   * Returns true if polygons should be rebuilt based on current change flags.
   * @returns {boolean}
   */
  get ShouldRebuildFeatures(): boolean {
    return (
      this.ChangeAll ||
      this.PolygonLocations ||
      this.PolygonAttribs ||
      this.FeatureCartoSettings ||
      this.MapProjection ||
      this.UploadJoinField
    );
  }
  get ShouldUpdateReferenceFeatures(): boolean {
    return this.ChangeAll || this.ReferenceFeatures || this.ReferenceCartoSettings;
  }
  /**
   * Returns true if the map should be rebuilt based on current change flags.
   * @returns {boolean}
   */
  get ShouldRebuildMap(): boolean {
    return this.ChangeAll || this.MapProjection;
  }
  /**
   * Returns true if zoom limits should be updated.
   * @returns {boolean}
   */
  get ShouldUpdateZoomLimits(): boolean {
    return this.ChangeAll || this.MapProjection || this.UsingPremium;
  }
  /**
   * Returns true if base layers should be rebuilt.
   * @returns {boolean}
   */
  get ShouldRebuildBaseLayers(): boolean {
    return (
      this.ChangeAll || this.MapProjection || this.APIKey || this.UsingPremium
    );
  }
  /**
   * Returns true if any setting (not data) has changed.
   * @returns {boolean}
   */
  get AnySetting(): boolean {
    const anySetting =
      this.PointCartoSettings ||
      this.FeatureCartoSettings || 
      this.ReferenceCartoSettings ||
      this.AuthSettings ||
      this.APIKey ||
      this.UsingPremium ||
      this.MapProjection || 
      this.LegendShown || 
      this.ZoomPanSelectStatus;
    return this.ChangeAll || anySetting;
  }
  /**
   * Returns true if any data (not just settings) has changed.
   * @returns {boolean}
   */
  //get AnyData(): boolean {
    // update is called as soon as any UI control is tweaked, hence if it has been called
    // by tweaking a formatting setting, it can't have also been a data field changing.
    // TODO need a working check for this
   // return this._changeAll || this.UploadJoinField || this.UploadedData || this.UnmatchedLocalFeatures || !this.AnySetting;
  //}
  /**
   * Sets all change flags to true.
   */
  SetChangeEverything(){
    this.ChangeAll = true;
    //this.ReferenceFeatures = true;
  }
  /**
   * Sets the autozoom enabled status.
   * @param isOn True to enable autozoom, false to disable.
   */
  SetAutozoom(isOn:boolean){
    this._AutozoomIsEnabled = isOn
  }
}

export type ControlDisplayStatus = {
  pointSizingPresent: boolean;
  pointColouringType: ColourValueTypes;
  featureSizingPresent: boolean;
  featureColouringType: ColourValueTypes;
  uploadFilename: string;
  featureJoinFieldname: string;
}

export type VisualStatus = {
  currentUpdateId: string;
  /** Indicates if any data is currently displayed. */
  anyDataShowing: boolean;
  keyStatus: "free" | "premium" | "invalid" | "not_determined";
  apiKey: string;
  previousDataExpected: boolean;
  previousExtentValid: boolean;
}

export enum KeyStatusTypes {
  NotDetermined = "not_determined",
  Free = "free",
  Premium = "premium",
  Invalid = "invalid"
}
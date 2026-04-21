import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import FormattingSettingsSlice = formattingSettings.Slice;

/**
 * Card for a collapsible accordion pane containing the upload manager toggle switch.
 */
class UserDataToggleGroup extends formattingSettings.SimpleCard {
  uploadDataToggle = new formattingSettings.ToggleSwitch({
    name: "uploadDataToggle",
    value: false,
    displayName: "Show upload manager",
    description: "This allows you to upload your own geospatial data, or remove previously uploaded data.",
  });
  name: string = "userDataToggleGrp"
  displayName: string = "Upload Manager";
  slices: Array<FormattingSettingsSlice> = [
    this.uploadDataToggle
  ];
  description: string = "Toggle to show or hide the upload manager.";
}

// global variables for uploaded data settings, to allow dynamic updating of dropdown contents and display name
// by maintaining them outside of the class definition so that when the class is instantiated again the values persist
let uploadedFilename: string = "Configure uploaded data";
let dropdownContents: string[] = ["placeholder"];
/** 
 * Card for configuring how to use the uploaded data.
 * Includes dropdown to select join field from uploaded data,
 * toggle to show unmatched features, and toggle to include native properties in popups.
 */
class UserDataConfigGroup extends formattingSettings.SimpleCard {
  fileName = new formattingSettings.TextInput({
    name: "fileName",
    displayName: "Uploaded filename",
    value: "",
    placeholder: "No file uploaded",
    description: "The name of the most recently uploaded file. This is for display purposes only.",
    visible:false
  });
  
  get FileName() { return this.fileName.value}
  set FileName(value: string) { this.fileName.value = value; } 

  set DropdownContents(items:string[]){ 
    // the visual will update this in our code when the dropdowns need changing, which in turn will store the values in the 
    // global variable so that they persist for next time the class is instantiated. Then it will do a persistProperties 
    // which will in turn update the formatting pane, recreating this class and using the updated dropdownContents variable.
    // This seems very convoluted, not sure if there's a more straightforward way to do this but it works. 
    if (items !== dropdownContents){
      dropdownContents = items;
    };    
  }

  private _defaultDropdownDescription: string = `Choose the column in the uploaded data that matches values from the Power BI data added to the 'Features Layer: Identifiers to match' section.`;
  public positionOptions: powerbi.IEnumMember[] = new positionSelect().setItems(dropdownContents);
    public SelectIdentifierField: formattingSettings.ItemDropdown = new formattingSettings.ItemDropdown({
      name: "identifierField",
      displayName: "Select an identifier field",
      description: this._defaultDropdownDescription,
      items: this.positionOptions,
      value: this.positionOptions[0]
    });
    
  showUnmatchedLocalFeatures_UI = new formattingSettings.ToggleSwitch({
    name: "showUnmatchedLocalFeatures",
    value: false,  
    displayName: "Show unmatched features",
    description: `If selected then any features in the uploaded data that do not match a record in the PowerBI data will still be shown on the map, 
    using a single symbol as defined on the Reference Layer settings pane. If unselected then only features that match records in the PowerBI data will be shown. Note that you need to have at least one field added in the Build Visual pane for this to have any effect.`,
  });
  get showUnmatchedLocalFeatures() { return this.showUnmatchedLocalFeatures_UI.value}

  showNativeProperties_UI = new formattingSettings.ToggleSwitch({
    name: "includeNativeProperties",
    value: false,
    displayName: "Include native properties in popups",
    description: "If selected then all native properties from the uploaded data will be included in popups, for unmatched features and others where there are no fields added to the popups field well."
  });
  get showNativeProperties() { return this.showNativeProperties_UI.value}

  name: string = "userDataSettingsGrp";
  displayName: string = uploadedFilename;
  slices: Array<FormattingSettingsSlice> = [
    this.fileName,
    this.SelectIdentifierField,
    this.showUnmatchedLocalFeatures_UI,
    this.showNativeProperties_UI
  ];
  description: string = "Settings in this card allow you to choose how uploaded data is linked to the PowerBI data.";
  collapsible?: boolean = false;

  set joinFieldname(value: string) {
    this.SelectIdentifierField.description = value ? `Choose the column in the uploaded data that matches values from the '${value}' Power BI field.`
     : this._defaultDropdownDescription;
  }
}

/** Helper class to create position dropdown options.
 */
class positionSelect {
  private po: powerbi.IEnumMember[] = [];

  setItems(items: string[]):powerbi.IEnumMember[]{
    this.po = [];
    for(let i=0; i<items.length; i++){
      let curPositionOptions: powerbi.IEnumMember = {
        value: items[i],
        displayName: items[i].toString()
      }
      this.po.push(curPositionOptions)
    }
    return this.po
  }
}

/** Card for user data upload settings as a compositecard i.e. accordian panes for the toggle card and the config card
 */

export class UserDataSettingsCard extends formattingSettings.CompositeCard {
  uploadDataToggleGroup = new UserDataToggleGroup();
  uploadDataControls = new UserDataConfigGroup();
  get showNativeProperties() { return this.uploadDataControls.showNativeProperties}
  get showUnmatchedLocalFeatures() { return this.uploadDataControls.showUnmatchedLocalFeatures} 
  get FileName() { return this.uploadDataControls.FileName}
  set FileName(value: string) { 
    this.uploadDataControls.FileName = value; 
  } 
  get uploadDataToggle() { return this.uploadDataToggleGroup.uploadDataToggle}
  get SelectIdentifierField() { return this.uploadDataControls.SelectIdentifierField}
  set DropdownContents(items:string[]){ 
    this.uploadDataControls.DropdownContents = items;    
  }
  
  // ***********   FORMATTINGSETTINGSCARD IMPLEMENTATION   *************** //
  name: string = "userDataSettings";
  displayName: string = "Upload geospatial data";
  groups: Array<FormattingSettingsSlice> = [
    this.uploadDataToggleGroup,
    this.uploadDataControls,
  ];
  description: string = "Settings in this card allow you to upload your own geospatial data to display on the map, and to choose how it is linked to the PowerBI data.";
  
}


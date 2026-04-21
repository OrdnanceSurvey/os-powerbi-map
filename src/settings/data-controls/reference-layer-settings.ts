import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import FormattingSettingsSlice = formattingSettings.Slice;

class RefLayerEntryGroup extends formattingSettings.SimpleCard {
  overlayCodes_UI = new formattingSettings.TextArea({
    name: "refOverlayCodes",
    displayName: "GSS codes to add as map overlay / reference layer",
    value:"",
    description: "Enter GSS codes to add as map overlay / reference layer (no connection to PowerBI data)",
    placeholder: "Enter GSS codes as a comma-, semicolon-, or whitespace-separated list"
  });
   name: string = "refLayerEntryGroup";
    displayName: string = "GSS Codes for Reference Layer";
    collapsible?: boolean = false;
    slices: formattingSettings.Slice[] = [this.overlayCodes_UI];
    get OverlayCodes() { return this.overlayCodes_UI.value }
}

/**
 * Card for reference layer settings (GSS overlays).
 */
export class ReferenceLayerSettingsCard extends formattingSettings.CompositeCard {
   
  //displaySettingsGroup = new RefLayerStylingGroup();
  entrySettingsGroup = new RefLayerEntryGroup();
  /** Card name. */
  name: string = "referenceLayerSettings";
  /** Card display name. */
  displayName: string = "Reference Layer";
  /** Array of formatting setting slices for this card. */
  groups: Array<FormattingSettingsSlice> = [
    this.entrySettingsGroup,
    //this.displaySettingsGroup
  ];
  slices: formattingSettings.Slice[] = this.entrySettingsGroup.slices;
  /** Card description. */
  description: string = "You can enter GSS codes to display as a permanent reference layer on the map, regardless of "+
  "the PowerBI data being displayed. This is configured on this card."+
  " For example you may want to enter all GSS codes present in your data or area of "+
  "interest so that when data are filtered or sliced, you can still see the areas that are filtered out.";
  
  /** Gets the overlay GSS codes. */
  get OverlayCodes() { return this.entrySettingsGroup.OverlayCodes}
 
}

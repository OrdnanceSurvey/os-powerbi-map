import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { colours } from "../../resources";
import { SymbolConfiguration, UnscaledSymbolProvider } from "../../types/powerbi-datamodel-types";
import { LineStyles } from "../../types/carto-types";
class RefLayerStylingGroup extends formattingSettings.SimpleCard implements UnscaledSymbolProvider{
  positionOptions : powerbi.IEnumMember[] = [
      // the values here need to match the keys of the LineStyles enum exactly, as they are used directly to get the line style for the reference layer features
      // the unicode characters are used to give a visual approximation of the line style in the dropdown options
      {value : "solid", displayName : "Solid \u{2E3A}"}, 
      {value : "dashed", displayName : "Dashed \u{254D}"},
      {value : "dotted", displayName : "Dotted \u{2B1A}"}, 
      {value : "dotdash", displayName : "Dot-Dash \u{FE4E}"}
    ];
    lineStyle_UI = new formattingSettings.ItemDropdown({
      name: "refLineStyle", 
      displayName: "Border style",
      items: this.positionOptions,
      value: this.positionOptions[0] 
    });
    borderWeight_UI = new formattingSettings.Slider({
      name:"refBorderWeight",
      displayName:"Border thickness",
      value:1,
      description:"Select the border thickness for reference layer features",
      options:{
        minValue: {
          type: powerbi.visuals.ValidatorType.Min,
          value: 0
        },
        maxValue:{
          type: powerbi.visuals.ValidatorType.Max,
          value: 5
        }
      }
    });
    FillColourUI = new formattingSettings.ColorPicker({
      name: "refFillColour",
      value: { value: colours.DARKNEUTRAL },
      displayName: "Fill colour",
      description: "Fill colour for reference layer features",
    });
    OpacityUI = new formattingSettings.Slider({
      name: "refOpacity",
      displayName: "Fill opacity",
      value: 0,
      description: "Fill opacity of reference layer features.",
      options: {
        minValue: {
          type: powerbi.visuals.ValidatorType.Min,
          value: 0,
        },
        maxValue: {
          type: powerbi.visuals.ValidatorType.Max,
          value: 100,
        },
        unitSymbol: "%",
        unitSymbolAfterInput: true,
      },
    });
    name: string = "refLayerSettingsGroup";
    displayName: string = "Reference Layer";
    collapsible?: boolean = true;
    slices?: formattingSettings.Slice[] = [this.FillColourUI, this.OpacityUI, this.borderWeight_UI, this.lineStyle_UI];

    /** Gets the selected border style. */
    get LineStyle() { return this.lineStyle_UI.value.value as keyof typeof LineStyles}
    /** Gets the border thickness. */
    get BorderWeight() { return this.borderWeight_UI.value}
    /** Gets the fill colour. */
    get ColourMaxOrDefault() { return this.FillColourUI.value.value}
    /** Gets the fill opacity as a proportion (0-1). */
    get Opacity() { return this.OpacityUI.value / 100.0}
    
    get DefaultStylingProperties(): SymbolConfiguration {
        return {
          colour: this.ColourMaxOrDefault,
          opacity: this.Opacity,
          pointSize: null,
          borderColour: this.ColourMaxOrDefault,
          lineThickness: this.BorderWeight,
          lineStyle: LineStyles[this.LineStyle],
          symbolName: "Reference Layer"
        };
    }
}
export { RefLayerStylingGroup };
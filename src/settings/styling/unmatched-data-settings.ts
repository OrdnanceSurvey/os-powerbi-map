
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { colours } from "../../resources";
import { UnscaledSymbolProvider, SymbolConfiguration } from "../../types/powerbi-datamodel-types";
import { LineStyles } from "../../types/carto-types";
class UnmatchedDataStylingGroup extends formattingSettings.SimpleCard implements UnscaledSymbolProvider{
  positionOptions : powerbi.IEnumMember[] = [
    // the values here need to match the keys of the LineStyles enum exactly, as they are used directly to get the line style for the reference layer features
    // the unicode characters are used to give a visual approximation of the line style in the dropdown options
      {value : "solid", displayName : "Solid \u{2E3A}"}, 
      {value : "dashed", displayName : "Dashed \u{254D}"},
      {value : "dotted", displayName : "Dotted \u{2B1A}"}, 
      {value : "dotdash", displayName : "Dot-Dash \u{FE4E}"}
    ];
    lineStyle_UI = new formattingSettings.ItemDropdown({
      name: "unmatchedLineStyle", 
      displayName: "Line/ border style",
      items: this.positionOptions,
      value: this.positionOptions[0] 
    });
    borderWeight_UI = new formattingSettings.Slider({
      name:"unmatchedBorderWeight",
      displayName:"Line / border thickness",
      value:1,
      description:"Select the line/border thickness for unmatched features",
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
      name: "unmatchedFillColour",
      value: { value: colours.NULLVALUES },
      displayName: "Feature colour",
      description: "Colour for unmatched features",

    });
    OpacityUI = new formattingSettings.Slider({
      name: "unmatchedOpacity",
      displayName: "Fill opacity",
      value: 0,
      description: "Fill opacity of unmatched features.",
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
    SizeUI = new formattingSettings.Slider({
      name: "unmatchedPointSize",
      displayName: "Point size",
      value: 5,
      description: "Select the size of points for unmatched features",
      options: {
        minValue: {
          type: powerbi.visuals.ValidatorType.Min,
          value: 1
        },
        maxValue: {
          type: powerbi.visuals.ValidatorType.Max,
          value: 10
        }
      }
    });
    name: string = "unmatchedSettingsGroup";
    displayName: string = "Unmatched uploaded features";
    collapsible?: boolean = true;
    slices?: formattingSettings.Slice[] = [this.FillColourUI, this.OpacityUI, this.borderWeight_UI, this.lineStyle_UI, this.SizeUI];
    //visible: boolean;
    get LineStyle() { return this.lineStyle_UI.value.value as keyof typeof LineStyles}
    /** Gets the border thickness. */
    get BorderWeight() { return this.borderWeight_UI.value}
    /** Gets the fill colour. */
    get ColourMaxOrDefault() { return this.FillColourUI.value.value}
    /** Gets the fill opacity as a proportion (0-1). */
    get Opacity() { return this.OpacityUI.value / 100.0}
    /** Gets the point size. */
    get PointSize() { return this.SizeUI.value }

    get DefaultStylingProperties(): SymbolConfiguration {
        return {
          colour: this.ColourMaxOrDefault,
          opacity: this.Opacity,
          pointSize: this.PointSize,
          borderColour: this.ColourMaxOrDefault,
          lineThickness: this.BorderWeight,
          lineStyle: LineStyles[this.LineStyle],
          symbolName: "Unmatched uploaded features"
        };
    }
    isEqual(other: UnmatchedDataStylingGroup): boolean {
      return this.LineStyle === other.LineStyle &&
             this.BorderWeight === other.BorderWeight &&
             this.ColourMaxOrDefault === other.ColourMaxOrDefault &&
             this.Opacity === other.Opacity &&
             this.PointSize === other.PointSize;
    }
}
export { UnmatchedDataStylingGroup };
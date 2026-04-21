import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { ColourValueTypes } from "../../types/carto-types";

class MarkerPointStylingSimpleCard extends formattingSettings.SimpleCard {
  ColourMaxUI = new formattingSettings.ColorPicker({
    name: "markerPointColourMax",
    value: { value: "#453C90" },
    displayName: "Max or default point colour",
    description:
      "If a numeric colour field is provided for points, the point with the largest \
        value of the field will be allocated this colour. Otherwise all points will be this colour, \
        unless an RGB string field is provided in which case those colours will be \
        be used as-is.",
  });
  ColourMinUI = new formattingSettings.ColorPicker({
    name: "markerPointColourMin",
    value: { value: "#E044A7" },
    displayName: "Min point colour",
    description:
      "If a numeric colour field is provided for points, the point with the smallest \
        value of the field will be allocated this colour. Otherwise this has no effect.",
  });
  ColourClipUI = new formattingSettings.Slider({
    name: "markerPointPctClipColour",
    displayName: "Points colour % clip",
    value: 0,
    description: "Percentage of highest/lowest values to clip/disregard before scaling colours between the highest/lowest remaining values" +
    " Leave at 0% to use the entire data range.",
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 45
      },
      unitSymbol: "%",
      unitSymbolAfterInput: true
    }
  });
    OpacityUI = new formattingSettings.Slider({
    name: "pointOpacity",
    displayName: "Point opacity",
    value: 60,
    description: "Opacity of point markers",
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 10,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 100,
      },
      unitSymbol: "%",
      unitSymbolAfterInput: true,
    },
  });
  DefaultCatColoursUI = new formattingSettings.ToggleSwitch({
    name: "defaultPointCategoricalColours",
    value:true,
    displayName:"Use recommended colours for categorical data",
    description:"If selected then, when the points layer is coloured with a categorical field, "+
    "a default colour scheme will be used to improve the distinction between classes. "+
    "If unselected then the configured colour ramp will be used as for numeric data, ranking the "+
    "categorical values in alphabetical order. If there are more "+
    "than 4-5 categories in the data, the colours may be harder to distinguish."
  });
  SizeMaxUI = new formattingSettings.Slider({
    name: "markerPointSizeMax",
    displayName: "Max or default size of points",
    value: 6,
    description:
      "If a size field is provided for points, the point with the largest \
        value of the field will be scaled to this size. Otherwise all points will be \
        this size. This applies to points added to the markers layer via coordinates, postcodes, or UPRNs.",
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 1,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 30,
      }
    }
  });
  SizeMinUI = new formattingSettings.Slider({
    name: "markerPointSizeMin",
    displayName: "Min size of points",
    value: 1,
    description:
      "If a size field is provided for points, the point with the smallest \
        value of the field will be scaled to this size. Otherwise this has no effect.\
        This applies to points added to the markers layer via coordinates, postcodes, or UPRNs.",
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 1,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 10,
      },
    },
  });
  
  SizeClipUI = new formattingSettings.Slider({
    name: "markerPointPctClipSize",
    displayName: "Points size % clip",
    value: 0,
    description: "Percentage of highest/lowest values to clip/disregard before scaling size between the highest/lowest remaining values" +
    " Leave at 0% to use the entire data range.",
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 45
      },
      unitSymbol: "%",
      unitSymbolAfterInput: true
    }
  });
    LineThicknessUI = new formattingSettings.Slider({
    name: "markerLineThickness",
    displayName: "Point outline thickness",
    value: 1,
    description:
      "Select the thickness for point outlines",
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 8,
      },
    },
  });
   // ***********   FORMATTINGSETTINGSCARD IMPLEMENTATION   *************** //
  /** Card name. */
  name: string = "pointCartoSettings";
  /** Card display name. */
  displayName: string = "Markers (points-only) Layer";
  /** Card description. */
  description: string = "Settings in this card affect the appearance of points added via X/Y coordinates (easting/northing or latitude/longitude), or via postcode or UPRN";
  /** Array of formatting setting slices for this card. */
  slices: formattingSettings.Slice[] = [
    this.ColourMaxUI,
    this.ColourMinUI,
    this.ColourClipUI,
    this.DefaultCatColoursUI,
    this.OpacityUI,
    this.SizeMaxUI,
    this.SizeMinUI,
    this.SizeClipUI,
    this.LineThicknessUI
  ];
  // ***********   CUSTOM LOGIC   *************** //
  /** Gets the maximum point colour. */
  get ColourMaxOrDefault(){ return this.ColourMaxUI.value.value }
  /** Gets the minimum point colour. */
  get ColourMin() { return this.ColourMinUI.value.value } 
  /** Gets the colour percent clip as a proportion (0-1). */
  get ColourClip() { return this.ColourClipUI.value / 100.0}
  /** Gets or sets the maximum point size. */
  get PointSizeMax() {return this.SizeMaxUI.value};
  set PointSizeMax(val:number) { this.SizeMaxUI.value = val;}
  /** Gets or sets the minimum point size. */
  get PointSizeMin() {return this.SizeMinUI.value};
  set PointSizeMin(val:number) {this.SizeMinUI.value = val;}
  /** Gets the size percent clip as a proportion (0-1). */
  get PointSizeClip() { return this.SizeClipUI.value / 100.0}
  /** Gets the default opacity as a proportion (0-1). */
  get defaultOpacity() { return this.OpacityUI.value / 100.0 }
  /** Gets whether default categorical colours are used. */
  get DefaultCategoricalColours() { return this.DefaultCatColoursUI.value};
  /** Gets the line/boundary thickness. */
  get LineThickness() { return this.LineThicknessUI.value};
  /** Tells the card which type of colouring is currently applied to the points layer, so it can update
   * the visibility and labelling of the relevant controls.
   */
  set colourDataType(val: ColourValueTypes) {
    if(val === ColourValueTypes.CONTINUOUS || val === ColourValueTypes.CATEGORICAL){
      this.ColourMinUI.visible = true;
      if(val === ColourValueTypes.CONTINUOUS){
        this.ColourMaxUI.displayName = "Max point colour";
        this.ColourMinUI.displayName = "Min point colour";
        this.ColourClipUI.visible = true;
        this.DefaultCatColoursUI.visible = false;
      }
      else {  // ColourValueTypes.CATEGORICAL
        this.ColourMaxUI.displayName = "First point colour";
        this.ColourMinUI.displayName = "Last point colour";
        this.ColourClipUI.visible = false;
        this.DefaultCatColoursUI.visible = true;
      }
    }
    else { // ColourValueTypes.NONE
      this.ColourMinUI.visible = false;
      this.ColourClipUI.visible = false;
      this.DefaultCatColoursUI.visible = false;
      this.ColourMaxUI.displayName = "Point colour";
    }
  }
  /** Tells the card whether size data are currently present in the dataview, the card will then update 
   * whether or not the min/clip controls are shown, and the max size control labelling.
   */
  set hasSizeData(val: boolean) {
    this.SizeMinUI.visible = val;
    this.SizeClipUI.visible = val;  
    this.SizeMaxUI.displayName = val ? "Max size of points" : "Point size";
  }
  isEqual(other: MarkerPointStylingSimpleCard): boolean {
    return this.ColourMin === other.ColourMin &&
           this.ColourMaxOrDefault === other.ColourMaxOrDefault &&
           this.ColourClip === other.ColourClip &&
           this.PointSizeMin === other.PointSizeMin &&
           this.PointSizeMax === other.PointSizeMax &&
           this.PointSizeClip === other.PointSizeClip &&
           this.defaultOpacity === other.defaultOpacity &&
           this.DefaultCategoricalColours === other.DefaultCategoricalColours &&
           this.LineThickness === other.LineThickness;
  }
}
export { MarkerPointStylingSimpleCard };
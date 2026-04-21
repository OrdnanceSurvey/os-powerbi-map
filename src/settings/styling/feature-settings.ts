import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { ColourValueTypes, LineStyles } from "../../types/carto-types";
import { UnscaledSymbolProvider, PBIDataDisplayProperties, SymbolConfiguration } from "../../types/powerbi-datamodel-types";

class FeatureStylingSimpleCard extends formattingSettings.SimpleCard {
    OpacityUI = new formattingSettings.Slider({
    name: "featureOpacity",
    displayName: "Feature opacity",
    value: 40,
    description: "Opacity of features. Affects all features added via the GeoJSON/WKT field, polygons coded from GSS codes, and features from your uploaded data that are matched to the Power BI data model.",
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
  ColourMaxUI = new formattingSettings.ColorPicker({
    name: "featureColourMax",
    value: { value: "#453C90" },
    displayName: "Max or default feature colour",
    description:
      "Affects all features added via the GeoJSON/WKT field, polygons coded from GSS codes, \
      and features from your uploaded data that are matched to the Power BI data model. \
      If a numeric colour field is provided, the feature with the largest \
      value of the field will be allocated this colour. Otherwise all features will be this colour, \
      unless an RGB string field (e.g. '#00FFFF') is provided, in which case those colours will be \
      be used directly.",
  });
  ColourMinUI = new formattingSettings.ColorPicker({
    name: "featureColourMin",
    value: { value: "#E044A7" },
    displayName: "Min feature colour",
    description:
      "Affects all features added via the GeoJSON/WKT field, polygons coded from GSS codes, \
      and features from your uploaded data that are matched to the Power BI data model.\
      If a numeric colour field is provided, the feature with the smallest \
      value of the field will be allocated this colour. Otherwise this has no effect.",
  });
  ColourClipUI = new formattingSettings.Slider({
    name: "featurePctClip",
    displayName: "Feature % clip",
    value: 0,
    description: "Percentage of highest/lowest values to clip/disregard before scaling colours between the highest/lowest remaining values." +
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
  DefaultCatColoursUI = new formattingSettings.ToggleSwitch({
    name: "defaultFeatureCategoricalColours",
    value:true,
    displayName:"Use recommended colours for categorical data",
    description:"If selected then, when the features layer is coloured with a categorical field, "+
    "a default colour scheme will be used to improve the distinction between classes. "+
    "If unselected then the configured colour ramp will be used as for numeric data, ranking the "+
    "categorical values in alphabetical order. If there are more "+
    "than 4-5 categories in the data, the colours may be harder to distinguish."
  });
SizeMaxUI = new formattingSettings.Slider({
    name: "featurePointSizeMax",
    displayName: "Size of points",
    value: 6,
    description:
      "Size for points added to the features layer via GeoJSON/WKT or uploaded data.",
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
    name: "featurePointSizeMin",
    displayName: "Min size of points",
    value: 1,
    description:
      "If a size field is provided for points, the point with the smallest \
        value of the field will be scaled to this size. Otherwise this has no effect.\
        This applies to points added to the features layer via GeoJSON/WKT or uploaded data.",
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
    name: "featurePointSizePctClip",
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
    name: "featureLineThickness",
    displayName: "Line / border thickness",
    value: 1,
    description:
      "For features added via WKT or GeoJSON, or GSS geocoding or user-uploaded data, select the thickness for lines or polygon / point outlines",
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
  name: string = "featureCartoSettings";
  displayName: string = "Features Layer";
  description: string = "Settings in this card affect the appearance of features (polygons, lines, or points) added via GeoJSON/WKT in the data model, by geocoding GSS identifiers, or from uploaded data that is matched to the Power BI data model.";
  slices: formattingSettings.Slice[] = [
    this.ColourMaxUI,
    this.ColourMinUI,
    this.ColourClipUI,
    this.OpacityUI,
    this.DefaultCatColoursUI,
    this.LineThicknessUI,
    this.SizeMaxUI,
    this.SizeMinUI,
    this.SizeClipUI
  ];
  // ***********   CUSTOM LOGIC   *************** //
  // get DefaultStylingProperties(): SymbolConfiguration {
  //   return {
  //     colour:  this.ColourMaxOrDefault ,
  //     opacity: this.defaultOpacity,
  //     pointSize:  this.PointSizeMax,
  //     borderColour: this.ColourMaxOrDefault,
  //     lineThickness: this.LineThickness,
  //     lineStyle: LineStyles.solid
  //   };
  // }
  get ColourMaxOrDefault(){ return this.ColourMaxUI.value.value }
  get ColourMin() { return this.ColourMinUI.value.value } 
  get ColourClip() { return this.ColourClipUI.value / 100.0}
   /** Gets or sets the maximum point size. */
  get PointSizeMax() {return this.SizeMaxUI.value};
  set PointSizeMax(val:number) { this.SizeMaxUI.value = val;}
  /** Gets or sets the minimum point size. */
  get PointSizeMin() {return this.SizeMinUI.value};
  set PointSizeMin(val:number) {this.SizeMinUI.value = val;}
  /** Gets the size percent clip as a proportion (0-1). */
  get PointSizeClip() { return this.SizeClipUI.value / 100.0}
  get defaultOpacity() { return this.OpacityUI.value / 100.0 }
  get DefaultCategoricalColours() { return this.DefaultCatColoursUI.value};
  /** Gets the line/boundary thickness. */
  get LineThickness() { return this.LineThicknessUI.value};
  /** Tells the card which type of colouring is currently applied to the features layer, so it can update
   * the visibility and labelling of the relevant controls.
   */
  set colourDataType(val: ColourValueTypes) {
    if(val === ColourValueTypes.CONTINUOUS || val === ColourValueTypes.CATEGORICAL){
      this.ColourMinUI.visible = true;
      if(val === ColourValueTypes.CONTINUOUS){
        this.ColourMaxUI.displayName = "Max feature fill colour";
        this.ColourMinUI.displayName = "Min feature fill colour";
        this.ColourClipUI.visible = true;
        this.DefaultCatColoursUI.visible = false;
      }
      else {  // ColourValueTypes.CATEGORICAL
        this.ColourMaxUI.displayName = "First feature fill colour";
        this.ColourMinUI.displayName = "Last feature fill colour";
        this.ColourClipUI.visible = false;
        this.DefaultCatColoursUI.visible = true;
      }
    }
    else { // ColourValueTypes.NONE
      this.ColourMinUI.visible = false;
      this.ColourClipUI.visible = false;
      this.DefaultCatColoursUI.visible = false;
      this.ColourMaxUI.displayName = "Feature fill colour";
    }
    }
  
   /** Tells the card whether size data are currently present in the dataview, the card will then update 
   * whether or not the min/clip controls are shown, and the max size control labelling.
   * NB currently this will never be set true because features layer cannot be sized in current version,
   * but included for completeness and future-proofing.
   */
  set hasSizeData(val: boolean) {
    this.SizeMinUI.visible = val;
    this.SizeClipUI.visible = val;  
    this.SizeMaxUI.displayName = val ? "Max size of points" : "Point size";
  }
  isEqual(other: FeatureStylingSimpleCard): boolean {
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

export { FeatureStylingSimpleCard };
import chroma from "chroma-js";
import {ColourScaler, IterativeScaler, LegendGenerator, NumericScaler} from "../types/carto-types";
import {NumericLinearScaler, NumericPercentClipScaler, CategoricalScaler} from "./value-scaling";
import {colours} from "../resources"
import { roundToStr } from "../utils/utils";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import format = valueFormatter.format;
import { LegendSymbolOverrides } from "../types/powerbi-datamodel-types";

/**
 * Provides color scaling utilities for mapping data values to colors.
 * Linearly interpolates a colour between a min and max colour value,
 * in hex #RRGGBB format.
 * TODO allow multi-point ramps etc etc
 * https://stackoverflow.com/a/76126221/4150190
 */
export class ColourLinearScaler implements ColourScaler, IterativeScaler, LegendGenerator {
  /** Red component of the minumum color */
  private r1: number;
  /** Green component of the minimum color. */
  private g1: number;
  /** Blue component of the minimum color. */
  private b1: number;
  /** Red component of the maximum color. */
  private r2: number;
  /** Green component of the maximum color. */
  private g2: number;
  /** Blue component of the maximum color. */
  private b2: number;
  /** Maximum color as a hex string. */
  protected maxColour: string;
  /** Minimum color as a hex string. */
  protected minColour: string;
  /** Numeric scaler for mapping values to proportions. */
  protected numeric_scaler: NumericScaler & IterativeScaler;
  /** Cached legend HTML element. */
  protected legendDiv: HTMLElement;
  /** True if null values have been encountered. */
  public hasNullValues: boolean = false;
  /** True if non-null values have been encountered. */
  public hasNonNullValues: boolean = false;
  /** True if color override values have been encountered. */
  public hasColourOverrideValues: boolean = false;
  /** Color to use for null values. */
  static NullValuesColour = colours.NULLVALUES;

  /**
   * Constructs a ColourLinearScaler with the given min and max colors.
   * @param hexColour1 The minimum color as a hex string.
   * @param hexColour2 The maximum color as a hex string.
   */
  constructor(hexColour1: string, hexColour2: string) {
    this.updateOutputColourRamp([hexColour1, hexColour2]);
    this.numeric_scaler = new NumericLinearScaler(0, 1);
  }

  /**
   * Updates the output color ramp with new min and max colors.
   * @param newRange Array containing the new min and max colors as hex strings.
   */
  updateOutputColourRamp(newRange: [string, string]): void {
    const [hexColour1, hexColour2] = newRange;
    this.legendDiv = null;
    this.r1 = parseInt(hexColour1.substring(1, 3), 16);
    this.g1 = parseInt(hexColour1.substring(3, 5), 16);
    this.b1 = parseInt(hexColour1.substring(5, 7), 16);

    this.r2 = parseInt(hexColour2.substring(1, 3), 16);
    this.g2 = parseInt(hexColour2.substring(3, 5), 16);
    this.b2 = parseInt(hexColour2.substring(5, 7), 16);

    // cache this to save unnecessary sums when not scaling
    this.minColour = hexColour1;
    this.maxColour = hexColour2;
  }

  /**
   * Adds a value to the scaler for range calculation.
   * @param val The value to add.
   */
  public pushValue(val: number): void {
    if (val !== null){
      this.numeric_scaler.pushValue(val);
      this.hasNonNullValues = true;
    }
    else{
      this.hasNullValues = true;
    }
  }

  /**
   * Gets the color for a given value.
   * @param val The value to map to a color.
   * @returns The color as a hex string.
   */
  public getColourForValue(val: number): string {
   /** Get the RGB values for a colour  */
    if(val === null){
      if(this.hasNonNullValues){
        return null;
      }
      else{
        return this.getDefaultColour();
      }
    }
    const prop = this.numeric_scaler.getProportionalValue(val);
    return this.getColourForProportion(prop);
  }

  /**
   * Adds an alpha (opacity) channel to a hex color string.
   * @param color The base color as a hex string.
   * @param opacity The opacity value (0-1).
   * @returns The color with alpha channel as a hex string.
   * @protected
   */
  protected addAlpha(color: string, opacity: number): string {
    // coerce values so ti is between 0 and 1.
    const _opacity = Math.round(Math.min(Math.max(opacity || 1, 0), 1) * 255);
    return color + _opacity.toString(16).toUpperCase();
}

  /**
   * Gets the color for a given proportion between min and max.
   * @param prop The proportion (0-1).
   * @returns The interpolated color as a hex string.
   * @protected
   */
  protected getColourForProportion(prop: number): string { 
    /**
  * Interpolate the RGB values for a colour that is the given proportion
  * of the distance between hexColour1 and hexColour2; i.e. proportion
  * should be a value between 0 and 1
  */
    if (prop < 0 || prop > 1) {
      throw new Error("Proportion must be between 0 and 1");
    }
    if (prop == 1) {
      // save running the sums 10000s of times if no colour field in use
      return this.maxColour;
    }
    const r = Math.round(this.r1 + (this.r2 - this.r1) * prop);
    const g = Math.round(this.g1 + (this.g2 - this.g1) * prop);
    const b = Math.round(this.b1 + (this.b2 - this.b1) * prop);
    // Convert the interpolated RGB values back to a hex color
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /**
   * Gets the default color (max color).
   * @returns The default color as a hex string.
   */
  public getDefaultColour(): string {
    return this.getColourForProportion(1);
  }

  /**
   * Generates a legend HTML element for a color ramp. This is used for both point and feature legends 
   * when they have a colour scaling field added and it's a numeric/continuous field.
   * @param namestring The name to display in the legend.
   * @param opacity The opacity to apply to the colors.
   * @param withBorder Whether to include a border on legend patches.
   * @returns The legend HTML element.
   */
  public getLegendEntriesDiv(options: LegendSymbolOverrides): HTMLElement {
    if (this.legendDiv) { return this.legendDiv; }  
    const layerLegendDiv = document.createElement('div');
    layerLegendDiv.className = 'legend__legend-item';
    
    const layerTitleDiv = document.createElement('div');
    layerTitleDiv.className = 'legend__legend-item__title';
    layerTitleDiv.textContent = options.legendName;
    layerTitleDiv.title = options.legendName;
    layerLegendDiv.appendChild(layerTitleDiv);
    
    const gradientDiv = document.createElement('div');
    gradientDiv.className = "legend__ramp-legend";
    layerLegendDiv.appendChild(gradientDiv);

    const [trueMinVal, trueMaxVal] = this.numeric_scaler.inputMinMax;
    const [minVal, maxVal] = this.numeric_scaler.renderableMinMax;
    if(minVal == maxVal){
      return null;
    }
    const midVal = (minVal + maxVal) / 2.0;
    const rampDiv = document.createElement('div');
    rampDiv.className = "legend__ramp-legend-ramp";
    rampDiv.setAttribute("style", 
      `background: linear-gradient(in lab to bottom, ${this.addAlpha(this.maxColour, options.patchOpacity)},${this.addAlpha(this.minColour, options.patchOpacity)});`)
    
    gradientDiv.appendChild(rampDiv);

    const ticksDiv = document.createElement('div');
    ticksDiv.className = 'legend__ramp-legend__ticks';
    gradientDiv.appendChild(ticksDiv);
    const topDiv = document.createElement('div');
    topDiv.className = 'ticks-top';
    ticksDiv.appendChild(topDiv);
    const midDiv = document.createElement('div');
    midDiv.className = 'ticks-mid';
    ticksDiv.appendChild(midDiv);
    const btmDiv = document.createElement('div');
    btmDiv.className = 'ticks-btm';
    ticksDiv.appendChild(btmDiv);
    
    const labelsDiv = document.createElement('div');
    labelsDiv.className = 'legend__ramp-legend__labels';
    gradientDiv.appendChild(labelsDiv);
    
    const minDiv = document.createElement("div");
    let valLbl = options.numberFormatString ? format(minVal, options.numberFormatString) : roundToStr(minVal, 8);
    minDiv.textContent = minVal == trueMinVal 
      ?  valLbl
      : `<= ${valLbl}`
    minDiv.title = minVal == trueMinVal
      ? `The colour of symbol used where ${options.legendName} = ${valLbl}`
      : `All values of ${options.legendName} <= ${valLbl} will be shown in this colour`
    
    const medDiv = document.createElement("div");
    valLbl = options.numberFormatString ? format(midVal, options.numberFormatString) : roundToStr(midVal, 8);
    medDiv.textContent = valLbl;
    medDiv.title = `The colour of symbol used where ${options.legendName} = ${valLbl}`;

    const maxDiv = document.createElement("div");
    valLbl = options.numberFormatString ? format(maxVal, options.numberFormatString) : roundToStr(maxVal, 8);
    maxDiv.textContent = maxVal == trueMaxVal 
      ? valLbl
      : `>= ${valLbl}`
    maxDiv.title = maxVal == trueMaxVal
      ? `The colour of symbol used where ${options.legendName} = ${valLbl}`
      : `All values of ${options.legendName} >= ${valLbl} will be shown in this colour`
    
    labelsDiv.appendChild(maxDiv);
    labelsDiv.appendChild(medDiv)
    labelsDiv.appendChild(minDiv)
    this.legendDiv = layerLegendDiv;
    return layerLegendDiv;
  }
}

/**
 * Extends ColourLinearScaler to support percent clipping.
 */
export class ColourPercentClipScaler extends ColourLinearScaler {
  /**
   * Constructs a ColourPercentClipScaler with the given min and max colors and clip percentage.
   * @param hexColour1 The minimum color as a hex string.
   * @param hexColour2 The maximum color as a hex string.
   * @param clipPercentage The percentage of values to clip from the scale.
   */
  constructor(hexColour1: string, hexColour2: string, clipPercentage: number){
    super(hexColour1, hexColour2);
    this.numeric_scaler = new NumericPercentClipScaler(0, 1, clipPercentage) 
  }
  /**
   * Updates the clip percentage for the numeric scaler.
   * @param newPercentage The new clip percentage.
   */
  updateClipPercentage(newPercentage: number){
    if(!(this.numeric_scaler instanceof NumericPercentClipScaler)){
      // TODO not this as it will lose values already added
      // need to make it always a percentclip scaler and allow zero as a value for that
      this.numeric_scaler = new NumericPercentClipScaler(0, 1, newPercentage);
    }
    else{
      this.numeric_scaler.updateClipPercentage(newPercentage);
    }
  }
}

/**
 * Extends ColourPercentClipScaler to use chroma.js for color interpolation.
 */
export class ColourChromaScaler extends ColourPercentClipScaler {
  /** Chroma.js scale instance for color interpolation. */
  protected chromaScaler: chroma.Scale;

  /**
   * Constructs a ColourChromaScaler with the given min and max colors and clip percentage.
   * @param hexColor1 The minimum color as a hex string.
   * @param hexColour2 The maximum color as a hex string.
   * @param clipPercentage The percentage of values to clip from the scale.
   */
  constructor(hexColor1: string, hexColour2: string, clipPercentage: number){
    super(hexColor1,hexColour2,clipPercentage);
    // interpolates colours using the lab algorithm
    // alternative options are rgb, hsl, lab, lch, lrgb
    // rgb is equivalent to the basic interpolation that is performed manually in 
    // ColourLinearScaler but does not give nice results, e.g. red->green via mud
    this.createColourScaler([hexColor1,hexColour2])
  }
  /**
   * Creates the chroma.js color scaler for the given color range.
   * @param colorRange Array containing the min and max colors as hex strings.
   * @protected
   */
  protected createColourScaler(colorRange: [string, string]){
    this.chromaScaler = chroma.scale(colorRange).mode('lab');
  }
  /**
   * Gets the color for a given proportion using chroma.js interpolation.
   * @param prop The proportion (0-1).
   * @returns The interpolated color as a hex string.
   * @override
   */
  override getColourForProportion(prop: number): string {
    if (prop===1){
      return this.maxColour
    }
    return this.chromaScaler(prop).hex();
  }
  /**
   * Updates the output color ramp and chroma.js scaler with new min and max colors.
   * @param newRange Array containing the new min and max colors as hex strings.
   * @override
   */
  override updateOutputColourRamp(newRange: [string, string]): void {
      super.updateOutputColourRamp(newRange);
      this.createColourScaler(newRange);
  }
}

/**
 * Enum for preset color palettes.
 */
export enum PresetColourPalettes {
  PAIRED,     /**< ColorBrewer Paired palette */
  SET3,       /**< ColorBrewer Set3 palette */
  CUBEHELIX,  /**< Cubehelix palette */
  NOTUSED     /**< Not used */
}

/**
 * Categorical color scaler using chroma.js.
 */
export class ColourCategoricalScaler extends ColourChromaScaler {
  /** Numeric scaler for categorical values. */
  protected numeric_scaler: CategoricalScaler = null;
  /** Whether the color classes have been initialized. */
  private classesInitialised: boolean = false;
  /** The preset color palette type in use. */
  private presetColourType: PresetColourPalettes = PresetColourPalettes.PAIRED;
  /** Color to use for "other" values beyond the max class count. */
  static OtherValuesColour = colours.GREYSTONE_NEUTRAL;
  /** Maximum number of color classes. */
  private MAX_CLASSES = 12;

  /**
   * Constructs a ColourCategoricalScaler with the given min and max colors.
   * @param hexColor1 The minimum color as a hex string.
   * @param hexColour2 The maximum color as a hex string.
   */
  constructor(hexColor1: string, hexColour2: string){
    super(hexColor1,hexColour2,0);
    // TODO max n classes is hardcoded here, could remove or make configurable
    this.numeric_scaler = new CategoricalScaler(0, 1, this.MAX_CLASSES);
  }

  /**
   * Updates the output color ramp and chroma.js scaler for the current preset palette.
   * @param newRange Array containing the new min and max colors as hex strings.
   * @override
   */
  override updateOutputColourRamp(newRange: [string, string]): void {
    super.updateOutputColourRamp(newRange);
    if(!this.numeric_scaler?.n_classes){ return; }
    switch(this.presetColourType){
      case PresetColourPalettes.CUBEHELIX:
        // use a cubehelix ramp which goes round the hue wheel, maximising the difference 
        // between classes
        this.chromaScaler = chroma.cubehelix().lightness([0.3,0.7]).scale().classes(this.numeric_scaler.n_classes);
        break;
      case PresetColourPalettes.PAIRED:
        // or, use one of the two 12-class colorbrewer sets, Paired or Set3
        this.chromaScaler = chroma.scale("Paired").classes(this.numeric_scaler.n_classes);
        break;
      case PresetColourPalettes.SET3:
        this.chromaScaler = chroma.scale("Set3").classes(this.numeric_scaler.n_classes);
        break;
      default:
        // or scale along an algorithmic ramp
        this.chromaScaler = chroma.scale(newRange).mode('lab').classes(this.numeric_scaler.n_classes);
        break;
    }
    this.classesInitialised = true;
  }

  /**
   * Sets the preset color palette to use for categorical values.
   * @param presetType The preset palette type.
   */
  public setUsePresetColours(presetType: PresetColourPalettes): void {
    if(presetType != this.presetColourType){
      this.presetColourType = presetType;
      this.updateOutputColourRamp([this.minColour, this.maxColour])
    }
  }

  /**
   * Gets the color for a given category value.
   * @param val The category value.
   * @returns The color as a hex string, or null for null/blank values.
   */
  public getColourForCategory(val: string): string {
    /** Get the RGB values for a category value, returning null if the value is null and 
     * should have no fill (this depends on whether all the data are null, in which case they 
     * will be shown using a default colour, or only some in which case they will be shown with 
     * no colour)
      */
    if(!this.classesInitialised){
    this.updateOutputColourRamp([this.minColour, this.maxColour])
    }
    if (val === null || val === ""){
      if (this.hasNonNullValues || this.hasColourOverrideValues){
        return null;
      }
      else{
        return this.getDefaultColour()
      }
    }
    const prop = this.numeric_scaler.getValueForString(val);
    if(prop>=0){ 
      return this.getColourForProportion(prop); 
    }
    // else: the numeric category scaler has returned -1 indicating a value beyond those showable
    return ColourCategoricalScaler.OtherValuesColour;
  }

  /**
   * Gets the color for a given proportion using chroma.js interpolation.
   * @param prop The proportion (0-1).
   * @returns The interpolated color as a hex string.
   * @override
   */
  override getColourForProportion(prop: number): string {
    return this.chromaScaler(prop).hex();
  }

  /**
   * Adds a category value to the scaler for class assignment.
   * @param category The category value to add.
   */
  public pushCategory(category: string | number): void {
    if(category !== null &&  category !== ""){
      this.numeric_scaler.pushCategory(category);
      this.hasNonNullValues = true;
    }
    else{
      this.hasNullValues = true;
    }
    this.classesInitialised = false;
  }

  /**
   * Generates a legend HTML element for the categorical color scale. This is used for both point and feature legends 
   * when they have a colour scaling field added and it's a categorical field.
   * @param namestring The name to display in the legend.
   * @param opacity The opacity to apply to the colors.
   * @param withBorder Whether to include a border on legend patches.
   * @returns The legend HTML element.
   * @override
   */
  override getLegendEntriesDiv(options: LegendSymbolOverrides): HTMLElement {
    if(!this.hasNonNullValues) { return null; }
    if (this.legendDiv) { return this.legendDiv; }
    
    const layerLegendDiv = document.createElement('div');
    layerLegendDiv.className = 'legend__legend-item';
    
    const layerTitleDiv = document.createElement('div');
    layerTitleDiv.className = 'legend__legend-item__title';
    layerTitleDiv.textContent = options.legendName;
    layerTitleDiv.title = options.legendName;
    layerLegendDiv.appendChild(layerTitleDiv);
    
    const stepsDiv = document.createElement('div');
    stepsDiv.className = "legend__category-legend";
    layerLegendDiv.appendChild(stepsDiv);

    this.numeric_scaler.all_categories.reverse().forEach(cat => {
      const colour = this.getColourForCategory(cat);
      const fadedColour = this.addAlpha(this.getColourForCategory(cat), options.patchOpacity);
      const patchDiv = document.createElement('div');
      patchDiv.style.backgroundColor = fadedColour;
      if(options.showBorder) { patchDiv.style.border = `2px solid ${colour}` }
      patchDiv.className = "legend__category-legend__patches"
      stepsDiv.appendChild(patchDiv)
      const labelDiv = document.createElement('div');
      labelDiv.textContent = options.numberFormatString ? format(cat, options.numberFormatString) : cat;
      labelDiv.title = cat;
      labelDiv.className = "legend__category-legend__text"
      stepsDiv.appendChild(labelDiv)
    });
    if(this.hasNullValues){
      const patchDiv = document.createElement('div');
      const borderColour  = ColourCategoricalScaler.NullValuesColour
      patchDiv.style.border = `2px solid ${borderColour}`
      // no fill for null values! 
      patchDiv.className = "legend__category-legend__patches"
      stepsDiv.appendChild(patchDiv);
      const labelDiv = document.createElement('div');
      labelDiv.textContent = "Null / blank";
      stepsDiv.appendChild(labelDiv);
    }
    if(this.numeric_scaler.has_AllOtherValues){
      const textContent = `A maximum of ${this.MAX_CLASSES} unique values will be shown as separate colours. `+
        "All other values will be shown in this colour."
      const patchDiv = document.createElement('div');
      const colour  = ColourCategoricalScaler.OtherValuesColour
      const fadedColour = this.addAlpha(colour, options.patchOpacity);
      patchDiv.style.backgroundColor = fadedColour;
      if(options.showBorder) { patchDiv.style.border = `2px solid ${colour}`}
      patchDiv.className = "legend__category-legend__patches"
      stepsDiv.appendChild(patchDiv);
      const labelDiv = document.createElement('div');
      labelDiv.textContent = "<All Other Values>";
      labelDiv.title = textContent;
      stepsDiv.appendChild(labelDiv);
    }
    

    this.legendDiv = layerLegendDiv;
    return layerLegendDiv;
  }
}


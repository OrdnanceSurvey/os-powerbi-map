import { ColourValueTypes } from "../types/carto-types";
import { OSMapsGeoJson } from "./osmaps-features";
import { ScalableLayerCartoSettings } from "../settings/PowerBISettings";
import { IterativeScaler, NumericScaler, ColourScaler, LegendGenerator } from "../types/carto-types";
import { NumericLinearScaler, NumericPercentClipScaler } from "../carto/value-scaling";
import { ColourCategoricalScaler, ColourChromaScaler, PresetColourPalettes } from "../carto/colour-scaling";
import { ScaledSizePointSymbolSimulator, ConfiguredSymbolSimulator } from "../carto/legend-symbol-generation"

import { LatLngBounds } from "leaflet";
import { LegendSymbolOverrides, SymbolConfiguration } from "../types/powerbi-datamodel-types";

/**
 * An implementation of GeoJSON FeatureCollection to which features can be added via a pushFeature method,
 * and which, when iterated (or the features property is accessed) returns _modified_ copies of the 
 * features that were input, where the colour, size and opacity properties of the returned features are 
 * scaled to the range of the inputs and the limits configured from the Power BI UI.
 */
export class OSMapsCartographicFeatureCollection implements GeoJSON.FeatureCollection {
  public geojsons: OSMapsGeoJson[] = [];
  public length: number = 0;
  public length_unlinked: number = 0;
  public suppressDuplicateGeoms: boolean = true;
  public hasONSGeocodes: boolean = false;
  private colour_scaler: ColourScaler & IterativeScaler & LegendGenerator;
  private opacity_scaler: NumericScaler & IterativeScaler;
  private size_scaler?: NumericScaler & IterativeScaler;
  private size_symbol_simulator: LegendGenerator;
  private unmatched_symbol_simulator: ConfiguredSymbolSimulator;
  private defaultSymbol: SymbolConfiguration;
  /** Indicates whether duplicate geometries have been added to this FeatureCollection */
  public hasDuplicateGeometries:boolean = false;
  public knownBounds?:LatLngBounds;
  public useSafePointColouring: boolean = false;
  public useSafePointSelectionColouring: boolean = false;
  public colourScalingType: ColourValueTypes = ColourValueTypes.NONE;
  public hasSizeScaling: boolean = false;
  
  private geometryHashes:Set<string|number> = new Set<string|number>;
  private allGeometryHashes:(string|number)[] = [];
  public hashToFeaturesDict: { [key: string|number]: any[] } = {};
  
  private currentCartoSettings:ScalableLayerCartoSettings;

  /**  required property of GeoJSON FeatureCollection */
  public type: "FeatureCollection"
  
  /** Required property (not method!) of GeoJSON FeatureCollection.
   * Represents an array of GeoJSON Features which have colour and opacity values scaled according 
   * to the range of values present across this Collection */ 
  public get features() : GeoJSON.Feature[]{
    // get accessor to allow a method call to work like a property 
    // because this class is itself an iterable, we can call array.from on it.
    // Furthermore because the OSMapsGeoJSON implements GeoJSON.Feature we can return 
    // them directly.
    // The important point is that the iterable returns not the original features 
    // but the modified / scaled ones (colour, size etc)
    return Array.from(this);
  }

  public get length_unique_geoms() { return this.geometryHashes.size; }
  public get isCategorical() { return this.colour_scaler instanceof ColourCategoricalScaler }
  
  constructor(cartoSettings: ScalableLayerCartoSettings, defaultSymbolConfig?: SymbolConfiguration) {
    this.updateCartoSettings(cartoSettings);
    if (defaultSymbolConfig){
      this.unmatched_symbol_simulator = new ConfiguredSymbolSimulator(defaultSymbolConfig);
    }
  }

  /**
   * Returns a legend HTML element for the colour scale.
   * @param withBorder Whether to include a border on the legend patches, in the case that it's a categorical 
   * legend with patches. We'll be using this for points but not polygons.
   * @returns The legend HTML element, or null if not applicable.
   */
  public getColourLegendItemDiv(withBorder:boolean=false): HTMLElement {
    const firstFeatureWithAColour = this.geojsons[this.geojsons.findIndex(g=>g.colourSource != null)]
    const colourFieldName = firstFeatureWithAColour?.colourSource || null;
    const colourFieldFormatter = firstFeatureWithAColour?.colourFieldFormatter || null;
    if (colourFieldName && this.colour_scaler) {
      const legendOpts: LegendSymbolOverrides = {
        legendName: colourFieldName,
        showBorder: withBorder,
        patchOpacity: this.opacity_scaler.getDefaultValue(),
        numberFormatString: colourFieldFormatter
      };
      return this.colour_scaler.getLegendEntriesDiv(legendOpts)};
    return null;
  }

  /**
   * Returns a legend HTML element for the size scale. 
   * @returns The legend HTML element, or null if not applicable.
   */
  public getPointSizeLegendItemDiv(): HTMLElement{
    const firstFeatureWithASize = this.geojsons[this.geojsons.findIndex(g=>g.sizeSource != null)]
    const sizeFieldName = firstFeatureWithASize?.sizeSource || null;
    const sizeFieldFormatter = firstFeatureWithASize?.sizeFieldFormatter || null;
    if (sizeFieldName) {
      const firstFeatureWithAColour = this.geojsons[this.geojsons.findIndex(g=>g.colourSource != null)]
      const colourFieldName = firstFeatureWithAColour?.colourSource || null;
      if(colourFieldName){
        if(this.size_symbol_simulator instanceof ScaledSizePointSymbolSimulator){
          this.size_symbol_simulator.setColour(null);
        }
      }
      else {
        if(this.size_symbol_simulator instanceof ScaledSizePointSymbolSimulator){
          this.size_symbol_simulator.setColour(this.currentCartoSettings.ColourMax);
        }
      }
      const legendOpts: LegendSymbolOverrides = {
        legendName: sizeFieldName,
        patchOpacity: this.opacity_scaler.getDefaultValue(),
        numberFormatString: sizeFieldFormatter
      };
      return this.size_symbol_simulator.getLegendEntriesDiv(legendOpts)
    };
    return null;
  }

  public getUnmatchedLegendItemDiv(): HTMLElement{
    const legendOpts: LegendSymbolOverrides = {
      legendName: "Unmatched Features",
      //legendName:null // uncomment this to use filename as legend title
    }
    return this.unmatched_symbol_simulator.getLegendEntriesDiv(legendOpts);
  }

  /**
   * Updates the cartography settings and reconfigures scalers.
   * @param cartoSettings The new cartography settings.
   */
  public updateCartoSettings(cartoSettings: ScalableLayerCartoSettings): void {
    if (this.colour_scaler) { 
      this.colour_scaler.updateOutputColourRamp([
        cartoSettings.ColourMin,
        cartoSettings.ColourMax,
      ]);
      if (this.colour_scaler instanceof ColourChromaScaler){
        this.colour_scaler.updateClipPercentage(cartoSettings.ColourClip);
      }
      if (this.colour_scaler instanceof ColourCategoricalScaler){
        const colType:PresetColourPalettes = cartoSettings.DefaultCategoricalColours ? 
          this.useSafePointColouring ? 
            PresetColourPalettes.SET3
            : PresetColourPalettes.PAIRED
          : PresetColourPalettes.NOTUSED
        this.colour_scaler.setUsePresetColours(colType);
      }
    } 
    const min_opacity = cartoSettings.defaultOpacity;
    const max_or_default_opacity = cartoSettings.defaultOpacity; // todo set second slider
    if (this.opacity_scaler) {
      this.opacity_scaler.updateOutputRange([
        min_opacity,
        max_or_default_opacity,
      ]);
    } else {
      this.opacity_scaler = new NumericLinearScaler(
        min_opacity,
        max_or_default_opacity
      );
    }
    if (cartoSettings instanceof ScalableLayerCartoSettings){
      if (this.size_scaler) {
        this.size_scaler.updateOutputRange([
          cartoSettings.PointSizeMin, cartoSettings.PointSizeMax]);
          if (this.size_scaler instanceof NumericPercentClipScaler) {
            this.size_scaler.updateClipPercentage(cartoSettings.PointSizeClip)
          }
      } else {
        this.size_scaler = new NumericPercentClipScaler(cartoSettings.PointSizeMin, cartoSettings.PointSizeMax, cartoSettings.PointSizeClip);
      }
      if(!this.size_symbol_simulator){
        // passed by reference so when we update this.size_scaler later it will affect the 
        // point simulator too
        this.size_symbol_simulator = new ScaledSizePointSymbolSimulator(this.size_scaler);
      }
      if(this.size_symbol_simulator && this.size_symbol_simulator instanceof ScaledSizePointSymbolSimulator){
        //this.symbol_simulator.updateCartoSettings(cartoSettings);
        // not needed here, because only the colour changes and that is set when generating the legend
        // based on whether there is a colour field or not
      }
    }
    this.currentCartoSettings = cartoSettings;
  }

  public updateDefaultSymbolConfig(defaultSymbolConfig: SymbolConfiguration){
    if(!this.unmatched_symbol_simulator){
      this.unmatched_symbol_simulator = new ConfiguredSymbolSimulator(defaultSymbolConfig);
    }
    else{
      this.unmatched_symbol_simulator.updateSymbolConfig(defaultSymbolConfig);
    }
    this.defaultSymbol = defaultSymbolConfig
  }

  private initialiseColourScaler(colourScaleType: ColourValueTypes){
    if (colourScaleType === ColourValueTypes.CATEGORICAL){
      if(!(this.colour_scaler instanceof ColourCategoricalScaler)){
        const newScaler = new ColourCategoricalScaler(
          this.currentCartoSettings.ColourMin, this.currentCartoSettings.ColourMax
        );
        const colType:PresetColourPalettes = this.currentCartoSettings.DefaultCategoricalColours ? 
          this.useSafePointColouring ? 
            PresetColourPalettes.SET3
            : PresetColourPalettes.PAIRED
          : PresetColourPalettes.NOTUSED
        newScaler.setUsePresetColours(colType);
        this.colour_scaler = newScaler;
      }
      // todo handle if colour scaler exists but is numeric, and now we have received 
      // categorical: we should change it to being a categorical one with a mix of 
      // string and number values by adding the values already in the numeric scaler to the 
      // new replacement categorical scaler. This might not be necessary, depends on how PowerBI
      // handles fields with a mix of numbers and text in them. Will the numbers be presented as 
      // strings anyway? perhaps they will in which case we are ok here.
    }
    else{// (colourScaleType === ColourValueTypes.CONTINUOUS){
      // if it's continuous/numeric, or null, make a continuous scaler. 
      // this will also be hit if it's a preset hex code but that makes no difference
      if(!this.colour_scaler){
        this.colour_scaler = new ColourChromaScaler(
          this.currentCartoSettings.ColourMin, 
          this.currentCartoSettings.ColourMax, 
          this.currentCartoSettings.ColourClip);
      }
    }
  }

  /**
   * Adds a feature to the collection and updates scalers.
   * @param newFeature The feature to add.
   */
  public pushFeature(newFeature: OSMapsGeoJson): void {
    if (newFeature.isPoint){
      if (!this.size_scaler){
        throw new Error("Cannot add points if point size scaler has not been configured");
      }
      if (typeof newFeature.size === "number") {
        this.size_scaler.pushValue(newFeature.size);
        this.hasSizeScaling = true;
      }
    }
    
    if(!newFeature.lockSymbology){ // only add to scalers if the feature is not locked, i.e. if it should take part in scaling calculations
      
      // if colourscaler doesn't exist then create it as either a categorical or numeric scaler 
      // depending on what this value is. If it does already exist, then change it to being a categorical
      // scaler if it's currently a numerical one and the new value is categorical.
      this.initialiseColourScaler(newFeature.colourValueType);
    
      if (newFeature.colourValueType !== ColourValueTypes.PRESET){
        // if the colour value is anything other than a preset hexcode then add it to the scaler 
        // using the appropriate method. Even if it is null.
        if (this.colour_scaler instanceof ColourCategoricalScaler) {
          this.colour_scaler.pushCategory(newFeature.fillColour);
          this.colourScalingType = ColourValueTypes.CATEGORICAL;
        }
        else if (newFeature.colourValueType == ColourValueTypes.CONTINUOUS
            || newFeature.colourValueType == ColourValueTypes.NONE){
          // nulls are added to the scaler so that it knows to show them in the legend
          this.colour_scaler.pushValue(newFeature.fillColour as number);
          if (newFeature.colourValueType === ColourValueTypes.CONTINUOUS){
            this.colourScalingType = ColourValueTypes.CONTINUOUS;
          }
        }  
      }
      else{
        // for preset colours, tell the colour scaler they exist so it knows how to symbolise null values,
        // even though it doesn't do any scaling based off these preset ones
        this.colour_scaler.hasColourOverrideValues = true;
      }
      this.opacity_scaler.pushValue(newFeature.opacity);
    }
    else {
      this.length_unlinked++;
      if (newFeature.isPoint){ this.unmatched_symbol_simulator.HasPoints = true;}
      else if (newFeature.isPolygon){ this.unmatched_symbol_simulator.HasPolygons = true;}
      else if (newFeature.isLine){ this.unmatched_symbol_simulator.HasLines = true;}
    }
    // TODO should handle geometrycollection somehow, ignore it or reject it or whatever
    const hash = newFeature.geometryIdentifier;
    if(this.geometryHashes.has(hash)){
      this.hasDuplicateGeometries = true; 
      }
    else {
      this.hashToFeaturesDict[hash] = [];
      this.geometryHashes.add(hash);
    } 
    this.hashToFeaturesDict[hash].push(newFeature)
    this.allGeometryHashes.push(hash);
    this.geojsons.push(newFeature);
    this.length++;
  }

  /**
   * Compares the geometry hashes of this collection to another.
   * @param other The other feature collection.
   * @returns True if the geometry hashes are equal.
   */
  public GeometriesEqual(other: OSMapsCartographicFeatureCollection): boolean {
    // We compare the hashes now, although not the sets in case of duplicates
    const a = this.allGeometryHashes;
    const b = other.allGeometryHashes;
    return a.every(item => b.includes(item)) && b.every(item => a.includes(item));
  }

  // This syntax makes this object iterable:
  *[Symbol.iterator](): Iterator<OSMapsGeoJson> {
    // The iterator returns not the objects that were put in, but clones of them where the 
    // colour / size / opacity are scaled according to their value compared to the values 
    // present across the whole collection. That is, the objects that are put in have the raw 
    // values that were received from PowerBI in their opacity, size and colour fields, but the 
    // objects returned by the iterator will have the actual values (point sizes, opacity percent, 
    // hex colour strings) that should be used to render the feature on the map.
    let seenGeoms = new Set<string|number>;
    for (const inFeat of this.geojsons) {
      if(this.suppressDuplicateGeoms){
        // This is currently always set true, if we wanted to use a clustering map libary we might want to turn it off
        if (seenGeoms.has(inFeat.geometryIdentifier)){
            continue;
         }
         seenGeoms.add(inFeat.geometryIdentifier);
      }
      
      const outFeat = inFeat.clone();
      outFeat.updateSelectedColour(this.currentCartoSettings.ColourSelected);
      //outFeat.useSafeBorderColour = this.useSafePointColouring;
      outFeat.useSafeSelectionColour = this.useSafePointSelectionColouring;
      
      if(outFeat.lockSymbology){
        // if the feature has been locked, do not change its colour symbology
        if(this.defaultSymbol){
          outFeat.updateSymbol(this.defaultSymbol);
        }
        yield outFeat;
        continue;
      }

      // if this input feature has a value for size / opacity, scale the value on
      // the output feature for display. If it doesn't, set the value on the output 
      // feature to the default from the settings
      if (outFeat.opacity != null) {
        outFeat.updateOpacity(
          this.opacity_scaler.getScaledValue(outFeat.opacity)
        );
      } else {
        outFeat.updateOpacity(this.opacity_scaler.getDefaultValue());
      }
      if (outFeat.isPoint){
        if (outFeat.size != null && !outFeat.lockSymbology) {
          outFeat.updateSize(this.size_scaler.getScaledValue(outFeat.size));
        }
        else{
          outFeat.updateSize(this.size_scaler.getDefaultValue());
        }
      }
      
      // For colour, do not apply the colourscaler if it is a preset hex code colour value.
      // Otherwise, getColourForValue or getColourForCategory depending on what type of data we have
      let newColour:string;
      if (outFeat.colourValueType !== ColourValueTypes.PRESET){
        if(this.colour_scaler instanceof ColourCategoricalScaler){
          newColour = this.colour_scaler.getColourForCategory(outFeat.fillColour as string);
        }
        else {
          newColour = this.colour_scaler.getColourForValue(outFeat.fillColour);
        }    
        outFeat.updateColour(newColour);
      }
      outFeat.updateWeight(this.currentCartoSettings.lineThickness);
      yield outFeat;
    }
  }
}

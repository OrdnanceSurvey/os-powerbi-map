import { LegendSymbolOverrides } from "./powerbi-datamodel-types";

export enum ColourValueTypes {
  CONTINUOUS,
  CATEGORICAL,
  PRESET,
  NONE
}  

/**
 * Defines a type which for a given range of input values and a desired range of output values,
 * provides a method getScaledValue which, for an input value (that must fall into the range 
 * of the input values) will return an output value that falls into the desired range of 
 * output values. How the range of input values is established is not determined.
 * Different implementations might provide different ways of scaling numerically between a 
 * min and max value, e.g. linear, percent clip, log-linear, square root, etc
 */
export interface NumericScaler {
    /**
     * For a given input value (which should be in the range of inputMinMax) return a 
     * value scaled into the range 0:1
     * @param val The input value.
     */
    getProportionalValue(val: number): number;
    /**
     * For a given input value (which should be in the range of inputMinMax) return a 
     * value scaled into the configured output range. If output range is 0:1 then this 
     * does the same as getProportionalValue
     * @param val The input value.
     */
    getScaledValue(val: number): number;
    /**
     * Returns a default value for the scaler.
     */
    getDefaultValue(): number;
    /**
     * Set the minimum and maximum output values, normally 0 and 1.
     * @param newRange The new output range.
     */
    updateOutputRange(newRange: [number, number]): void;
    /**
     * Read the configured minimum and maximum input values, i.e. the range of values 
     * within which it is valid to call getScaledValue.
     */
    inputMinMax: [number,number];
    /**
     * Read the configured minimum and maximum output values, i.e. the range of values 
     * that will define the smallest and largest numbers on the map.
     */
    outputMinMax: [number,number];
    /**
     * Read the configured minimum and maximum input values that define the smallest range 
     * that will span the whole range of the output values. May be the same as inputMinMax, 
     * or some of the input range may be discarded (e.g. outliers) in which case this will 
     * return the range of input values outside of which getScaledValue will return the 
     * smallest or largest value from the output range.
     */
    renderableMinMax: [number, number];
}
  
/**
 * Defines a type which allows the NumericScaler to have the input value range determined 
 * by adding input values one at a time via a pushValue method, rather than by explcitly
 * setting the input range. This is useful for cases where the input range is not known.
 */
export interface IterativeScaler {
    /**
     * Add a value to the scaler to help determine the input range.
     * @param val The value to add.
     */
    pushValue(val: number): void;
}

/**
 * Defines a type providing a method getColourForValue which for a given input data 
 * value will return a hex colour value that is interpolated between a given start 
 * and end colour. 
 */
export interface ColourScaler {
    /**
     * Get hex colour for a given input value.
     * @param val The value to map to a colour.
     */
    getColourForValue(val: number|string): string;
    /**
     * Get a default hex colour (e.g. for data points with no valid value).
     */
    getDefaultColour(): string;
    /**
     * Set the two hex colours between which other colours should be interpolated.
     * @param newRange The new colour ramp.
     */
    updateOutputColourRamp(newRange: [string, string]): void;
    /** True if there are null values in the data. */
    hasNullValues: boolean;
    /** True if there are non-null values in the data. */
    hasNonNullValues: boolean;
    /** True if there are colour override values in the data. */
    hasColourOverrideValues: boolean;
}
  
/**
 * Defines a type providing a method getLegendDiv which can return a div HTMLElement representing 
 * a legend graphic for a given object (such as a ColourScaler)
 */
export interface LegendGenerator {
    /**
     * Returns a legend HTML element for the object.
     * @param namestring The name to display in the legend.
     * @param opacity Optional opacity for the legend.
     * @param withBorder Optional flag to show a border.
     * @param formatString Optional format string for numeric values e.g. to display numbers as currency.
     */
    getLegendEntriesDiv(options: LegendSymbolOverrides): HTMLElement;
    //getLegendEntriesDiv(baseSymbolConfig:PBIDataDisplayProperties): HTMLElement;
}

export enum LineStyles{
    dashed="5,5",
    dotted="2,3",
    dotdash="5,4,1,4",
    solid="0"   
}

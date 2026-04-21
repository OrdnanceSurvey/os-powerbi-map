import {NumericScaler, IterativeScaler} from "../types/carto-types"

/**
 * Implements a linear numeric scaler for mapping input values to an output range.
 * Supports iterative value addition and proportional scaling.
 */
export class NumericLinearScaler implements NumericScaler, IterativeScaler {
    /** The minimum input value seen. */
    protected min_input: number = 9e99;
    /** The maximum input value seen. */
    protected max_input: number = -9e99;
    /** The range of input values. */
    protected range: number = 0;
    /** The minimum scaled output value. */
    private minScaledValue: number;
    /** The maximum scaled output value. */
    private maxScaledValue: number;
    /** The range of output values. */
    private outputRange: number;
    /** Whether the input values are locked (no more can be added). */
    protected valuesLocked: boolean;

    /**
     * Constructs a NumericLinearScaler.
     * @param minScaledValue The minimum output value.
     * @param maxScaledValue The maximum output value.
     */
    constructor(minScaledValue: number, maxScaledValue: number) {
      this.updateOutputRange([minScaledValue, maxScaledValue]);
      this.valuesLocked = false;
    }
  
    /** @inheritdoc */
    get inputMinMax (): [number,number] {
      return [this.min_input, this.max_input]
    }

    /** @inheritdoc */
    get outputMinMax(): [number, number] {
      return [this.minScaledValue, this.maxScaledValue]
    }

    /** @inheritdoc */
    get renderableMinMax(): [number, number] {
      return this.inputMinMax;
    }

    /** @inheritdoc */
    updateOutputRange(newRange: [number, number]): void {
      this.minScaledValue = newRange[0];
      this.maxScaledValue = newRange[1];
      this.outputRange = newRange[1] - newRange[0];
    }

    /** @inheritdoc */
    pushValue(val: number) {
      if (this.valuesLocked) {
        throw new Error(
          "Values can only be added before any have been retrieved"
        );
      }
      this.min_input = Math.min(this.min_input, val);
      this.max_input = Math.max(this.max_input, val);
      this.range = this.max_input - this.min_input;
    }

    /** @inheritdoc */
    getProportionalValue(val: number): number {
      this.valuesLocked = true;
      if (val > this.max_input || val < this.min_input) {
        // this shouldn't happen
        //console.log("Scaling issue");
        return val > this.max_input ? 1 : 0;
      }
      if (!this.range) {
        // all points are the same size (or there aren't any!)
        return 1; //this.maxScaledValue;
      }
      const prop = (val - this.min_input) / this.range;
      return prop;
    }

    /** @inheritdoc */
    getScaledValue(val: number) {
      const prop = this.getProportionalValue(val);
      const scaled_size = this.outputRange * prop + this.minScaledValue;
      return scaled_size;
    }

    /** @inheritdoc */
    getDefaultValue(): number {
      return this.maxScaledValue;
    }
}

/**
 * Extends NumericLinearScaler to support percent clipping of input values.
 * Clips outliers based on a specified percentage.
 */
export class NumericPercentClipScaler extends NumericLinearScaler implements NumericScaler, IterativeScaler {
    /** Array of input values for clipping. */
    private inputs: number[] = [];
    /** The minimum input value after clipping. */
    private min_input_value_clipped: number;
    /** The maximum input value after clipping. */
    private max_input_value_clipped: number;
    /** Whether the output has been initialised. */
    protected outputInitialised: boolean = false;
    /** The percentage of values to clip from each end. */
    private percentClip: number;

    /**
     * Constructs a NumericPercentClipScaler.
     * @param minScaledValue The minimum output value.
     * @param maxScaledValue The maximum output value.
     * @param percentClip The percentage to clip (0 <= percentClip < 0.5).
     */
    constructor(minScaledValue: number, maxScaledValue: number, percentClip: number) {
      super(minScaledValue, maxScaledValue);
      this.percentClip = this.sanitisePercentage(percentClip);  
    }

    /**
     * Sanitises the percentage value for clipping.
     * @param percentageOrProp The percentage or proportion to sanitise.
     * @returns The sanitised proportion.
     * @throws Error if the value is out of range.
     */
    private sanitisePercentage(percentageOrProp: number) {
      if (0 <= percentageOrProp && percentageOrProp < 0.5){
        return percentageOrProp;
      }
      else if (Number.isInteger(percentageOrProp) && 1 <= percentageOrProp && percentageOrProp < 50){
        return percentageOrProp / 100.0;
      }
      else {
        throw new Error("Value must be a float 0 <= val < 0.5")
      }
    }

    /** @inheritdoc */
    override pushValue(val: number) {
      super.pushValue(val);
      this.inputs.push(val);
    }

    /** @inheritdoc */
    override get renderableMinMax(): [number,number] {
      return [this.min_input_value_clipped, this.max_input_value_clipped];
    }

    /** @inheritdoc */
    override getProportionalValue(val: number): number {
      if(!this.outputInitialised) { this.initialiseOutput(); }
      if (val > this.max_input || val < this.min_input) {
        // this shouldn't happen
        //console.log("Scaling issue");
        return val > this.max_input ? 1 : 0;
      }
      if (!this.range) {
        // all points are the same size (or there aren't any!)
        return 1; //this.maxScaledValue;
      }
      if(val < this.min_input_value_clipped) { return 0; }
      if(val > this.max_input_value_clipped) { return 1; }

      const prop = (val - this.min_input_value_clipped) / this.range;
      return prop;
    }

    /**
     * Updates the clip percentage and re-initialises output.
     * @param percentage The new clip percentage.
     */
    public updateClipPercentage(percentage: number) {
      this.percentClip = this.sanitisePercentage(percentage);
      this.initialiseOutput() 
    }

    /**
     * Initialises the output range after clipping.
     */
    protected initialiseOutput() {
      this.valuesLocked = true;
      let sliceFrom:number, sliceTo:number;
      this.inputs.sort((a, b) => a - b);
      const n_inputs = this.inputs.length;
      if (this.percentClip === 0){
        sliceFrom = 0;
        sliceTo = n_inputs;
      }
      else{
        sliceFrom = Math.round(n_inputs * this.percentClip);
        sliceTo = Math.max(n_inputs - sliceFrom, sliceFrom+1);
      }
      this.min_input_value_clipped = this.inputs[sliceFrom];
      this.max_input_value_clipped = this.inputs[sliceTo-1];
      this.range = this.max_input_value_clipped - this.min_input_value_clipped;
    }
}

/**
 * Scaler for categorical values, mapping categories to numeric positions.
 * Extends NumericPercentClipScaler.
 */
export class CategoricalScaler extends NumericPercentClipScaler {
    /** Set of input categories. */
    private inputCategories: Set<string> = new Set<string>;
    /** Map from category to its numeric position. */
    private categoryPositionMap: Record<string, number>;
    /** Numeric scaler for category positions. */
    private numericScaler: NumericLinearScaler;
    /** Maximum number of allowed classes. */
    private maxClasses: number;
    /** Whether the scaler has exceeded the maximum number of classes. */
    private isOverFilled: boolean = false;

    /**
     * Constructs a CategoricalScaler.
     * @param minScaledValue The minimum output value.
     * @param maxScaledValue The maximum output value.
     * @param maxClasses The maximum number of categories.
     */
    constructor(minScaledValue: number, maxScaledValue: number, maxClasses: number) {
      super(minScaledValue, maxScaledValue, 0);
      this.maxClasses = maxClasses;
    }

    /**
     * Adds a category value to the scaler.
     * @param val The category value.
     * @returns True if the category was added, false if overfilled.
     * @throws Error if values are locked.
     */
    pushCategory(val: string|number): boolean {
      if (this.valuesLocked) {
        throw new Error(
          "Values can only be added before any have been retrieved"
        );
      }
      if (this.n_classes < this.maxClasses){
        this.inputCategories.add(val.toString());
        return true
      }
      else {
        this.isOverFilled = true;
        return false
      } 
    }

    /** The number of classes (categories). */
    get n_classes() { return this.inputCategories.size; }
    /** True if the scaler has more categories than allowed. */
    get has_AllOtherValues() { return this.isOverFilled; }
    /** Returns all categories, sorted. */
    get all_categories() { return Array.from(this.inputCategories).sort((a, b)=> b.localeCompare(a)) }

    /**
     * Initialises the output mapping for categories.
     * @protected
     */
    protected override initialiseOutput() {
      this.valuesLocked = true;
      const sortedInputs = Array.from(this.inputCategories).sort((a, b)=> b.localeCompare(a));
      const valuePositions = sortedInputs.keys();
      let categoryPositionMap = {};
      this.numericScaler = new NumericLinearScaler(0, 1);
      for (let idx of valuePositions){
        categoryPositionMap[sortedInputs[idx]] = idx;
        this.numericScaler.pushValue(idx);
      }
      this.categoryPositionMap = categoryPositionMap;
      this.outputInitialised=true;
    }

    /**
     * Gets the scaled value for a given category string.
     * @param stringValue The category string.
     * @returns The proportional value for the category, or -1 if not found.
     */
    getValueForString(stringValue: string) {
      if(!this.outputInitialised) { this.initialiseOutput(); }
      
      if(stringValue in this.categoryPositionMap) { 
        const valuePosition = this.categoryPositionMap[stringValue];
        return this.numericScaler.getProportionalValue(valuePosition);
      }
      return -1;
    }
  
  }


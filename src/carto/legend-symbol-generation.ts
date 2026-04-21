import {LegendGenerator, NumericScaler} from "../types/carto-types";
import {colours} from "../resources"
import { roundToStr } from "../utils/utils";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import format = valueFormatter.format;
import { LegendSymbolOverrides, SymbolConfiguration } from "../types/powerbi-datamodel-types";

/**
 * Simulates point symbols for legends and provides legend HTML for point size scaling.
 * Implements the LegendGenerator interface.
 */
export class ScaledSizePointSymbolSimulator implements LegendGenerator {
    /** The numeric scaler used to determine symbol sizes. */
    private numeric_scaler: NumericScaler;
    /** The colour to use for the point symbols. */
    private colour: string;

    /**
     * Constructs a PointSymbolSimulator.
     * @param numeric_scaler The numeric scaler for point sizes.
     */
    constructor(numeric_scaler: NumericScaler) {
        this.numeric_scaler = numeric_scaler
    }

    /**
     * Sets the colour for the point symbols.
     * @param colour The colour to use.
     */
    setColour(colour: string) {
        this.colour = colour;
    }

    /**
     * Generates a legend HTML element for point size scaling.
     * @param namestring The name to display in the legend.
     * @returns The legend HTML element, or null if not applicable.
     */
    getLegendEntriesDiv(options:LegendSymbolOverrides): HTMLElement {
        const layerLegendDiv = document.createElement('div');
        layerLegendDiv.className = 'legend__legend-item';
        
        const layerTitleDiv = document.createElement('div');
        layerTitleDiv.className = 'legend__legend-item__title';
        layerTitleDiv.textContent = options.legendName;
        layerTitleDiv.title = options.legendName;
        layerLegendDiv.appendChild(layerTitleDiv);
        
        const stepsDiv = document.createElement('div');
        stepsDiv.className = "legend__point-size-legend";
        layerLegendDiv.appendChild(stepsDiv);
        const [trueMinVal, trueMaxVal] = this.numeric_scaler.inputMinMax;
        const [minVal, maxVal] = this.numeric_scaler.renderableMinMax;
        let [minSize, maxSize] = this.numeric_scaler.outputMinMax;
        if(minVal == maxVal){
            //@ts-ignore
            return null;
        }
        const midVal = (minVal + maxVal) / 2.0;
        minSize *= 2; // as the point size on map is a radius, not a diameter
        maxSize *= 2;
        const midSize = (minSize + maxSize) / 2.0;
        const sizes = [maxSize,midSize,minSize];
        const vals = [maxVal,midVal,minVal];
        const trueVals = [trueMaxVal,midVal,trueMinVal];
        for (let i=0; i<3; i++){
            const patchDiv = document.createElement('div');
            // if no colour set, this is because we are also scaling by colour, so use a neutral grey 
            // for the size legend. If a colour is set, it will be the default point colour i.e. the same 
            // as used on the map.
            // We are not simulating the opacity here as the legend is just to show relative sizes.
            // We are not simulating point borders here either.
            patchDiv.style.background = this.colour || colours.GREYSTONE_NEUTRAL;
            patchDiv.style.width=sizes[i]+"px";
            patchDiv.style.height=sizes[i]+"px";
            patchDiv.className = "legend__point-size-legend__points";
            stepsDiv.appendChild(patchDiv);
            const labelDiv = document.createElement('div');
            const valLbl = options.numberFormatString ? format(vals[i], options.numberFormatString) : roundToStr(vals[i], 8);
            labelDiv.textContent = trueVals[i] === vals[i] 
                ? valLbl
                : trueVals[i] > vals[i]
                  ? `>= ${valLbl}`
                  : `<= ${valLbl}`;
            labelDiv.title = trueVals[i] === vals[i]
                ? `The size of symbol used where ${options.legendName} = ${valLbl}`
                : trueVals[i] > vals[i]
                    ? `All values of ${options.legendName} >= ${valLbl} will be shown in this size`
                    : `All values of ${options.legendName} <= ${valLbl} will be shown in this size`
            labelDiv.className = "legend__category-legend__text"
            stepsDiv.appendChild(labelDiv)
        }
        return layerLegendDiv;
    }
}

export class ConfiguredSymbolSimulator implements LegendGenerator {
    /**
     * Generates a legend HTML element for unmatched uploaded symbols.
     * @param namestring The name to display in the legend.
     * @returns The legend HTML element.
     */

    private symbolConfig: SymbolConfiguration;
    HasPolygons: boolean = false;
    HasLines: boolean = false;
    HasPoints: boolean = false;
    private legendDiv: HTMLElement | null = null;

    constructor(symbolConfig: SymbolConfiguration) {
        this.symbolConfig = symbolConfig;
    }

    updateSymbolConfig(symbolConfig: SymbolConfiguration) {
        this.symbolConfig = symbolConfig;
        this.legendDiv = null; // reset legend so it will be regenerated
    }

        /**
     * Adds alpha transparency to a color string.
     * @param color The base color.
     * @param opacity The opacity value (0-1).
     * @returns The color with alpha applied.
     */
    protected addAlpha(color: string, opacity: number): string {
        // coerce values so ti is between 0 and 1.
        const _opacity = Math.round(Math.min(Math.max(opacity || 0, 0), 1) * 255);
        return color + _opacity.toString(16).toUpperCase();
    }
    
    private addPolygonPatch(stepsDiv: HTMLElement) {
        const patchDiv = document.createElement('div');
        patchDiv.style.border = `${this.symbolConfig.lineThickness}px solid ${this.symbolConfig.borderColour}`;
        const fadedColour = this.addAlpha(this.symbolConfig.colour as string, this.symbolConfig.opacity);
        patchDiv.style.backgroundColor = fadedColour;
        patchDiv.className = "legend__category-legend__patches";
        stepsDiv.appendChild(patchDiv);
        const labelDiv = document.createElement('div');
        labelDiv.textContent = "Polygons";
        //labelDiv.className = "legend__category-legend__text"
        stepsDiv.appendChild(labelDiv);
        return stepsDiv
    }

    private addPointPatch(stepsDiv: HTMLElement) {
        const patchDiv = document.createElement('div');
        const fadedColour = this.addAlpha(this.symbolConfig.colour as string, this.symbolConfig.opacity);
        // create a circle using css with background colour, border thickness and colour, and width/height
        // determined from the this.symbolConfig properties.
        patchDiv.style.backgroundColor = fadedColour;
        patchDiv.style.width = (this.symbolConfig.pointSize || 5) * 2 + "px";
        patchDiv.style.height = (this.symbolConfig.pointSize || 5) * 2 + "px";
        patchDiv.style.border = `1px solid ${this.symbolConfig.borderColour}`;
        patchDiv.style.borderRadius = "50%"; // make it a circle
        patchDiv.style.alignSelf = "center";
        patchDiv.className = "legend__category-legend__patches";
        const labelDiv = document.createElement('div');
        labelDiv.textContent = "Points";
        stepsDiv.appendChild(patchDiv);
        stepsDiv.appendChild(labelDiv);
        return stepsDiv;
    }

    private addLinePatch(stepsDiv: HTMLElement) {
        const patchDiv = document.createElement('div');
        patchDiv.className = "legend__category-legend__lines";
        //patchDiv.style.border = `${this.symbolConfig.lineThickness}px solid ${this.symbolConfig.borderColour}`;
        patchDiv.style.borderTopWidth = this.symbolConfig.lineThickness + "px";
        patchDiv.style.borderTopStyle = "solid";
        patchDiv.style.borderTopColor = this.symbolConfig.borderColour as string;
        patchDiv.style.marginTop = "7px";
        stepsDiv.appendChild(patchDiv);
        const labelDiv = document.createElement('div');
        labelDiv.textContent = "Lines";
        stepsDiv.appendChild(labelDiv);
        return stepsDiv;
    }

    getLegendEntriesDiv(options:LegendSymbolOverrides): HTMLElement {
        if (!this.HasPoints && !this.HasLines && !this.HasPolygons) {
            return null;
        }
        if(this.legendDiv){ return this.legendDiv; }
        const layerLegendDiv = document.createElement('div');
        layerLegendDiv.className = 'legend__legend-item';   

        const layerTitleDiv = document.createElement('div');
        layerTitleDiv.className = 'legend__legend-item__title';
        layerTitleDiv.textContent = options.legendName||this.symbolConfig.symbolName;
        layerTitleDiv.title = options.legendName||this.symbolConfig.symbolName;
        layerLegendDiv.appendChild(layerTitleDiv);
        
        const stepsDiv = document.createElement('div');
        stepsDiv.className = "legend__category-legend";
        layerLegendDiv.appendChild(stepsDiv);

        if (this.HasPoints) {
            this.addPointPatch(stepsDiv);
        }
        if (this.HasLines) {
            this.addLinePatch(stepsDiv);
        }
        if (this.HasPolygons) {
            this.addPolygonPatch(stepsDiv);
        }
        
        this.legendDiv = layerLegendDiv;

        return layerLegendDiv;
    }
}
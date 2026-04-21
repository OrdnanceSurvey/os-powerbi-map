import L from "leaflet";
import {OSMapsCartographicFeatureCollection} from "../datamodels/osmaps-feature-collection"
import { LegendGenerator } from "../types/carto-types";
import { LegendSymbolOverrides } from "../types/powerbi-datamodel-types";
/**
 * Manages the creation and updating of legend elements for the visual.
 */
export class LegendManager{
    legendDiv:HTMLElement;
    legendCollapseButton: HTMLElement;
    legendCollapseContainer: HTMLElement;
    pointsDiv:HTMLElement;
    featuresDiv:HTMLElement;
    sizeDiv:HTMLElement;
    refDiv:HTMLElement;
    unmatchedDiv:HTMLElement;
    isCollapsed: boolean;
    numLegendsVisible: number;
    // see https://codepen.io/haakseth/pen/KQbjdO for an alternative approach using L.control
    constructor(div:HTMLElement){
        /**
         * Creates a legend with the following div class structure
         * 1* legend =>
         *   1* legend__legend-collapse button
         *   1* legend__legend-collapse-container 
         *     1..3* legend__legend-item-container =>
         *        1* legend__legend-item =>
         *          1* legend__legend-item__title
         *          1* either of:
         *            (legend__ramp-legend (3 col css grid) =>
         *               1* legend__ramp-legend-ramp (left col)
         *               1* legend__ramp-legend__ticks (centre col) =>
         *                   3* tick mark divs
         *               1* legend__ramp-legend__labels (right col) =>
         *                   3* tick mark labels  
         *            ) 
         *            OR
         *            (legend__category-legend (2 col css grid) =>
         *               1* legend__category-legend__patches (left col)
         *               1* legend__category-legend__text (right col)
         *            )
         *            OR
         *            (legend__point-size-legend (2 col css grid) =>
         *               1* legend__point-size-legend__points (left col)
         *               1* legend__category-legend__text (right col)
         *            )
         * This LegendManager itself creates the levels down to legend__legend-item-container.
         * It calls GetLegendDiv on the OSMapsCartographicFeatureCollection to get the 
         * legend__legend-item which contains the data and symbology information. In turn this calls
         * GetLegendDiv on the colour scaler, as this is where the colouring information is 
         * actually held.
         * When one of the three individual layer legends is added, the corresponding 
         * legend__legend-item is (re)generated, and added as a child to the legend__legend-item-container; the 
         * container is then set to display:flex. 
         * When one of the three individual layer legends is removed, the corresponding 
         * legend__legend-item is deleted (all children of the legend__legend-item-container are removed), and the 
         * legend__legend-item-container is set to display:none (but NOT removed).
         * When the legend is collapsed the legend__legend-collapse-container is set to display:none and when the legend 
         * is expanded the legend__legend-collapse-container is set to display:flex.
         * When the legend is removed (using the toggle switch) the legend (the top level div) is set to display:none
         * and when it is added it is set to display:flex.
         * Therefore only divs of legenditem and below are ever removed or recreated, upper levels are just shown or 
         * hidden.
        */     
       this.legendDiv = L.DomUtil.create("div", "legend", div);
       this.legendCollapseContainer = L.DomUtil.create("div", "legend__legend-collapse-container");
        this.legendCollapseButton = L.DomUtil.create("button", "legend__legend-collapse");
        this.legendCollapseButton.innerHTML = `<span class="material-symbols-rounded">chevron_right</span><p>Legend</p>`
        this.sizeDiv = L.DomUtil.create("div", "legend__legend-item-container");
        this.pointsDiv = L.DomUtil.create("div", "legend__legend-item-container");
        this.pointsDiv.classList.add("legend__points-legend");
        this.featuresDiv = L.DomUtil.create("div", "legend__legend-item-container");
        this.refDiv = L.DomUtil.create("div", "legend__legend-item-container");
        this.unmatchedDiv = L.DomUtil.create("div", "legend__legend-item-container");
        this.legendCollapseContainer.appendChild(this.sizeDiv);
        this.legendCollapseContainer.appendChild(this.pointsDiv);
        this.legendCollapseContainer.appendChild(this.featuresDiv);
        this.legendCollapseContainer.appendChild(this.refDiv);
        this.legendCollapseContainer.appendChild(this.unmatchedDiv);
        this.legendDiv.append(this.legendCollapseButton)
        this.legendDiv.append(this.legendCollapseContainer)
        // this.legendContainer.append(this.legendDiv)
        this.updateFeaturesLegend(null);
        this.updatePointsLegend(null);
        this.updateSizeLegend(null);
        this.updateRefLegend(null);
        this.updateUnmatchedLegend(null);
        this.isCollapsed = false;
        this.legendCollapseButton.addEventListener("click", () => {
            this.toggleLegend();
          });
    }

    /**
     * Updates the legend for point features.
     * @param points The feature collection representing points.
     */
    public updatePointsLegend(fColl: OSMapsCartographicFeatureCollection){
        const newLegendDiv = fColl?.getColourLegendItemDiv(true)
        this.updateLegendItem(this.pointsDiv, newLegendDiv)
    }
    /**
     * Updates the legend for polygon or feature layers.
     * @param features The feature collection representing polygons/features.
     */
    public updateFeaturesLegend(fColl: OSMapsCartographicFeatureCollection){
        const newLegendDiv = fColl?.getColourLegendItemDiv(false);
        this.updateLegendItem(this.featuresDiv, newLegendDiv);
    }
    /**
     * Updates the legend for point size scaling.
     * @param points The feature collection representing points.
     */
    public updateSizeLegend(fColl: OSMapsCartographicFeatureCollection){
        const newLegendDiv = fColl?.getPointSizeLegendItemDiv();
        this.updateLegendItem(this.sizeDiv, newLegendDiv);
    }
    /**
     * Updates the legend for reference/contextual layers.
     * @param refLayerManager The reference layer manager instance.
     */
    public updateRefLegend(legendMaker: LegendGenerator){
        const opts: LegendSymbolOverrides = {
            legendName: "Reference features",
        }
        const newLegendDiv = legendMaker?.getLegendEntriesDiv(opts);
        this.updateLegendItem(this.refDiv, newLegendDiv);
    }

    public updateUnmatchedLegend(fColl: OSMapsCartographicFeatureCollection){
        const newLegendDiv = fColl?.getUnmatchedLegendItemDiv();
        this.updateLegendItem(this.unmatchedDiv, newLegendDiv);
    }

    private updateLegendItem(targetDiv:HTMLElement, newDiv:HTMLElement){
        if(newDiv){
            targetDiv.replaceChildren(newDiv);
            targetDiv.setAttribute("style", "display:flex")
            this.legendCollapseButton.setAttribute("style", "display:flex")
        }
        else {
            targetDiv.replaceChildren();
            targetDiv.setAttribute("style", "display:none")
        }
        let numVisibleLegends = document.getElementsByClassName("legend__legend-item").length
        if (numVisibleLegends == 0) {
            this.legendCollapseButton.setAttribute("style", "display:none") 
        }
    }

    /**
     * Sets the visibility of the legend.
     * @param show True to show the legend, false to hide.
     */
    public setLegendVisibility(visible:boolean){
        if(visible){
            this.legendDiv.setAttribute("style", "display:flex");
        }
        else{
            this.legendDiv.setAttribute("style", "display:none");
        }
    }

    /**
     * Clears all legend content.
     */
    public clearLegend(): void {
        this.pointsDiv.replaceChildren();
        this.featuresDiv.replaceChildren();
        this.sizeDiv.replaceChildren();
        this.refDiv.replaceChildren();
        this.unmatchedDiv.replaceChildren();
        this.legendCollapseButton.setAttribute("style", "display:none")
    }

    toggleLegend(){
        this.isCollapsed = !this.isCollapsed;
        if (this.isCollapsed) {
            this.legendCollapseContainer.setAttribute("style", "display:none")
            this.legendCollapseButton.classList.add("legend--legend-closed")
        } else {
            this.legendCollapseButton.classList.remove("legend--legend-closed")
            this.legendCollapseContainer.setAttribute("style", "display:flex")}
    }
}
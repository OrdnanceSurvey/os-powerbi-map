import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { MarkerPointStylingSimpleCard } from "./marker-point-settings";
import { FeatureStylingSimpleCard } from "./feature-settings";
import { RefLayerStylingGroup } from "./ref-layer-settings";
import { UnmatchedDataStylingGroup } from "./unmatched-data-settings";

export class StylingSettingsDropdownsCard extends formattingSettings.SimpleCard {
  // This card is just a placeholder to show the other styling cards in the formatting pane
  // with a dropdown to select which layer they apply to. The actual settings are in the other cards, 
  // and this card doesn't have any settings itself.
  name: string = "stylingSettings";
  displayName: string = "Symbology Settings";
  description: string = "Settings in this card allow you to configure how different types of features are styled on the map.";
  public markerStylingCard: MarkerPointStylingSimpleCard = new MarkerPointStylingSimpleCard();
  public featureStylingCard: FeatureStylingSimpleCard = new FeatureStylingSimpleCard();
  constructor() {
    super();
    this.featureStylingCard.hasSizeData = false;
  }
  public refStylingCard: RefLayerStylingGroup = new RefLayerStylingGroup();
  public unmatchedStylingCard: UnmatchedDataStylingGroup = new UnmatchedDataStylingGroup();
  public container: formattingSettings.Container = {
    displayName: "Apply symbology to layer:",
    containerItems: [
      this.markerStylingCard,
      this.featureStylingCard,
      this.refStylingCard,
      this.unmatchedStylingCard
    ]
  }
}
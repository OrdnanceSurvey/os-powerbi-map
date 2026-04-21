import L, { LeafletEvent } from "leaflet";
import ISelectionId = powerbi.extensibility.ISelectionId;

export async  function zoomPanSelectHandler(e:LeafletEvent) {
    const visibleFeatures = [];
    const mapBounds = this.map.getBounds();
    this.map.eachLayer(
      function (layer) {
        if (layer instanceof L.CircleMarker) {
          if (mapBounds.contains(layer.getLatLng())) {
            visibleFeatures.push(layer);
          }
        }
        // approximate check only
        else if (layer.getBounds && mapBounds.contains(layer.getBounds())) {
          visibleFeatures.push(layer);
        }
      }.bind(this)
    );
    const selectionHandles: ISelectionId[] = [];
    let i: number = 0;
    for (const layer of visibleFeatures) {
      if (i >= this.maxSelections) {
        this.popupContentController.addMessage({
          notification: `Too many features in view! Max is ${this.maxSelections}, but ${visibleFeatures.length} are in view`,
          type: "error",
        });
        return; // do not apply partial selection
      }
      if (layer.feature.selectionHandle) {
        selectionHandles.push(layer.feature.selectionHandle);
        i++;
      }
    }
    await this.selectionManager.select(selectionHandles);
  }


import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import DataViewTableRow = powerbi.DataViewTableRow;
import { OSMapsDataviewRow } from "../types/data-types";
import { OSMapsParsedTable } from "../datamodels/osmaps-parsed-table";
import { dataViewMappings } from "../../capabilities.json";
import { OSPowerBIUIManager } from "../ui/uimanager";

/**
 * Converts the Power BI DataView to an intermediate object called OSMapsParsedTable 
   which is a simple flat data structure giving us a table-like view of the data, 
   including selection handles to link back to the powerbi model
 */
export class OSMapsDataviewConverter {
    
  private UIManager: OSPowerBIUIManager;

  /**
   * Constructs a new OSMapsDataviewConverter.
   * @param UIManager The UI manager instance.
   */
  constructor(UIManager: OSPowerBIUIManager) {
    this.UIManager = UIManager;
  }

  /**
   * Parses a VisualUpdateOptions object into an OSMapsParsedTable.
   * @param options The visual update options.
   * @returns The parsed table, or null if parsing fails.
   */
  private parse_dataview(options: VisualUpdateOptions): OSMapsParsedTable {
    const dataViews = options.dataViews;

    const viewModel: OSMapsParsedTable = new OSMapsParsedTable();
      
    if (
      !dataViews ||
      !dataViews[0] ||
      !dataViews[0].table ||
      !dataViews[0].table.columns ||
      !dataViews[0].table.columns[0].expr ||
      !dataViews[0].table.columns[0].roles ||
      !dataViews[0].table.rows
    ) {
      return viewModel;
    }

    const cols = dataViews[0].table.columns;
    const rows = dataViews[0].table.rows;
    const _this = this;
    // create a record of the order (given by rolesIndex) that columns appear in the polygon_popup_text role
    const polygonPopupOrder = {};
    const pointPopupOrder = {};
    cols.forEach(col => {
      let rolesIndex = col['rolesIndex'];
      if (rolesIndex) {
        if (rolesIndex['polygon_popup_text']) {
            polygonPopupOrder[col.displayName] = rolesIndex['polygon_popup_text'][0];
          }
          if (rolesIndex['point_popup_text']){
            pointPopupOrder[col.displayName] = rolesIndex['point_popup_text'][0];
          }
        }
    })
    const datas = rows.map(function (
      row: DataViewTableRow,
      rowIndex
    ): OSMapsDataviewRow {
      // need to produce the selection handle against the actual row of the dataview
      // from powerbi, so we do it now and it will get carried up until eventually it
      // is attached to the leaflet map features
      const selectionHandle = _this.UIManager.visual.host
        .createSelectionIdBuilder()
        .withTable(dataViews[0].table, rowIndex)
        .createSelectionId();
      
      
      const data: OSMapsDataviewRow = row.reduce(function (d, v, i): OSMapsDataviewRow {
        const r = cols[i].roles as object;
        const f = cols[i].format || null;
        const roles = Object.keys(r);
        const colName = cols[i].displayName;
        roles.forEach((r) => {
          if (d[r]) {
            // second time we have seen a value for this role in this row.
            // Must be a popup_text role, enforced by powerbi conditions
            if (!r.endsWith("_popup_text")) {
              console.error(
                "error parsing data, please check data model conditions!"
              );
              this.UIManager.addError("Internal error parsing data, please check data model conditions!");
            }
            else{
              d[r].push({ fieldname: colName, fieldvalue: v as any, formatstring: f  });
            }
            
          } else {
            // ok to hardcode this as it's enforced by powerbi which fields can have
            // multiple entries (in capabilities.json):
            // return the popup text content as an array of multiple fields which
            // may have been added, but the other contents only as the value of the
            // single field which may be added
            r.endsWith("_popup_text")
              ? (d[r] = [{ fieldname: colName, fieldvalue: v as any, formatstring: f}])
              : (d[r] = { fieldname: colName, fieldvalue: v as any, formatstring: f});
          }
        });
        // if d['polygon_popup_text'] exists, sort it according to the order given in polygonPopupOrder
        if (d['polygon_popup_text']) {
          d['polygon_popup_text'].sort((a, b) => {
            return (polygonPopupOrder[a.fieldname] || 0) - (polygonPopupOrder[b.fieldname] || 0);
          });
        }
        if (d['point_popup_text']) {
          d['point_popup_text'].sort((a, b) => {
            return (pointPopupOrder[a.fieldname] || 0) - (pointPopupOrder[b.fieldname] || 0);
          });
        }
        return d;
      },
        {});
      data.selectionHandle = selectionHandle;
      return data;
    });

    datas.forEach((parsedrow) => {
      // just split into multiple arrays of same generic type for now.
      if (parsedrow.easting && parsedrow.northing) {
        viewModel.preLocatedPointRows.push(parsedrow);
      } else if (parsedrow.point_geocodes) {
        viewModel.pointGeocodeRows.push(parsedrow);
      }
      if (parsedrow.feature_geometry) {
        viewModel.featureGeometryRows.push(parsedrow);
      }
      else if (parsedrow.gss_code) {
        viewModel.gssRows.push(parsedrow);
      }
      else if (parsedrow.geojson_reference){
        viewModel.geojsonRefRows.push(parsedrow);
      }
    });

    // Check length of features specified in capabilities.json and error if max is reached
    const maxFeatures = dataViewMappings[0].table.rows.dataReductionAlgorithm.top.count
    // total of length table.rows or datas instead of each viewModel separately
    // limit is on what is passed into powerbi in total (might have different 
    // datasets which make it up)
    const reachedMaxLength = (datas.length === maxFeatures)
    if (reachedMaxLength) {
      this.UIManager.addWarning("The maximum number of features allowed is 30,000. Your dataset may be larger than this. "+
       "Only the first 30,000 will be mapped and you might want to consider pre-filtering your data.");
    }
    return viewModel;
  }

  /**
   * Converts a VisualUpdateOptions object to an OSMapsParsedTable.
   * @param options The visual update options.
   * @returns The parsed table.
   */
  public convert(options: VisualUpdateOptions) {
    const parsedTable = this.parse_dataview(options)
    return parsedTable;
  }
}



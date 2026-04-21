import { Feature } from "geojson";
import { OSPowerBIUIManager } from "../ui/uimanager";
import { GeocodeMetrics, GeocodeTypes, GeojsonFeatureDictionary, LocalUploadGeocodingResult } from "../types/geocoding-types";
import { getUniqueColumns } from "./Geocode_Utils";
export class UploadedDataGeocoder{
    cache: GeojsonFeatureDictionary;
    UIManager: OSPowerBIUIManager;
    uniqueProps: string[];
    _currentIdentifierField: string | null = null;
    get currentIdentifierField(): string | null {
        return this._currentIdentifierField;
    } 
    set currentIdentifierField(newField: string) {
        if (this.uniqueProps.includes(newField) && newField !== this._currentIdentifierField){
            if(this._currentIdentifierField !== null){
                this.reIndexCache(newField);
            }
            // if it's the first time setting, don't re-index, just set, because it's been indexed 
            // on load already
            this._currentIdentifierField = newField;
        }
    }

    constructor(UIManager: OSPowerBIUIManager){
        this.UIManager = UIManager;
        this.rehydrateCache();
        //this.UIManager.uploadedDataSettingsCard.SelectIdentifierField.value = this.currentIdentifierField;
        //this.UIManager.uploadedDataSettingsCard.SelectIdentifierField.options = this.uniqueProps;
    }

    private rehydrateCache(){
        try{
            this.cache = JSON.parse(
                this.UIManager.visual.getPersistedSettings("uploadedGeojson")
            ) || {};
        }
        catch (e:any){
            this.cache = {};
        }
        this.uniqueProps = getUniqueColumns(Object.values(this.cache));
        this._currentIdentifierField = this.UIManager.visual.getPersistedSettings("uploadedGeojson_idfield") || null;
        this.UIManager.visual.updateJoinFieldsDropdown(this.uniqueProps);
    }

    public stored_geocode(identifiers:string[], inverse=false):LocalUploadGeocodingResult{
        let startTime = performance.now();
        const nNonNull = identifiers.filter(id => id !== null && id !== undefined && id !== "").length;
        const nCached = identifiers.filter(id => this.cache[id]).length;
        const geocodeMetrics:GeocodeMetrics = {
            nTotal: identifiers.length,
            nUnique: Array.from(new Set(identifiers)).length,
            nNonNull: nNonNull,
            nCached: nCached,
            nInvalid: identifiers.filter(id => id === null || id === undefined || id === "").length,
            nToFetch: inverse ? 0 : nNonNull,
            nFetched: inverse ? 0 : nCached,
            elapsed: 0,
            geocodeType: inverse ? GeocodeTypes.UPLOADED_DATA_INVERSE  : GeocodeTypes.UPLOADED_DATA
        }
        if(Object.keys(this.cache).length === 0  && !inverse){
            this.UIManager.addError("No uploaded data is currently loaded. To enable local geocoding, please upload data and choose the correct join column.", "localGeocodingError");
            return { geocodes: {}, geocodeMetrics: undefined };
        }
        let results: GeojsonFeatureDictionary = {};
        const notfound: string[] = [];
        if (!inverse){
            identifiers.forEach((id) => {
                if(this.cache[id]){
                    const item = this.cache[id];
                    results[id] = item;
                }
                else{
                    notfound.push(id)
                }
            });
            const nRetrieved = Object.keys(results).length;
            
            // if none matched, show a message suggesting to check the join field
            if (notfound.length === identifiers.length){
                this.UIManager.addError(`None of the data values from PowerBI were matched in the "${this.currentIdentifierField}" column of the uploaded data. 
                    Ensure you have chosen the correct field to join on in the dropdown, and added the correct field from your PowerBI data model into the 
                    field well.`, "localGeocodingError");
            }
            else if (notfound.length > 100) {
                let first100 = notfound.slice(0, 100);
                let remaining = notfound.length - first100.length;
                this.UIManager.addError(
                `The following data values from PowerBI were not matched in the uploaded data, so can't be mapped. Ensure you have chosen the correct field to join on in the dropdown: ${
                    first100.join(", ") + ` + ${remaining} more.`
                }`, "localGeocodingError"
                );
            } else if (notfound.length > 0){
                this.UIManager.addError(
                `The following data values from PowerBI were not matched in the uploaded data, so can't be mapped. Ensure you have chosen the correct field to join on in the dropdown: ${notfound.join(
                    ", "
                )}`, "localGeocodingError"
                );
            }
        }
        else{
            // inverse lookup - find all features in the uploaded data which do NOT match any of the given identifiers
            const identStrings = identifiers.map(String);
            const unmatchedIds = Object.keys(this.cache).filter(id => !identStrings.includes(id));
            unmatchedIds.forEach((id) => {
                const item = this.cache[id];
                results[id] = item;
            });
            const nRetrieved = Object.keys(results).length;
            geocodeMetrics.nFetched = nRetrieved;
        }
        geocodeMetrics.elapsed = performance.now() - startTime;
        return { geocodes: results, geocodeMetrics: geocodeMetrics };
    }

    public populate(loadedData:Feature[]){
        let nFailed = 0;
        let nLoaded = 0;
        if(loadedData.length === 0){
            this.depopulate();
            this.UIManager.addWarning("No data were uploaded.");
            return;
        }
        let uniqueProps: string[] = getUniqueColumns(loadedData);
        if (uniqueProps.length === 0) {
            this.UIManager.addError("No unique properties were found in the uploaded data. Please ensure that at least one property contains unique values for each feature, and re-upload the data.");
            return;
        }
        this.clearCache(); // TODO make this optional? so we can append to existing cache?
        //  would need to not overwrite uniqueProps then and logic would need some thought
        let identifierField = uniqueProps[0];
        this.uniqueProps = uniqueProps;
        
        loadedData.forEach((feat) => {
            if(feat.properties?.[identifierField]){
                this.cache[feat.properties[identifierField]] = feat;
                nLoaded++;
            }
            else{
                nFailed++;
            }
        });
        this.uniqueProps = uniqueProps;
        this.currentIdentifierField = identifierField;
        //this.UIManager.visual.formattingSettings.uploadedDataSettingsCard.DropdownContents = Array.from(allProps);
        if (nLoaded) { this.saveCache(); }
        if (nFailed) { this.UIManager.addError(`${nLoaded ? "Some" : "All"} of the features loaded did not contain the specified `+
        `property named ${identifierField}. Please check the given property name then try reloading.`)}
        
    }

    private depopulate(){
        this.cache = {};
        this.uniqueProps = [];  
        this._currentIdentifierField = null;
        this.saveCache();
        this.saveIdentifierField();
        //this.UIManager.visual.formattingSettings.uploadedDataSettingsCard.DropdownContents = [];  
    }

    public reIndexCache(newIdentifierField:string){
        let newCache: GeojsonFeatureDictionary = {};
        let nFailed = 0;
        Object.values(this.cache).forEach((feat) => {
            if(feat.properties){
                const newId = feat.properties[newIdentifierField];
                if(newId){
                    newCache[newId] = feat;
                }
                else{
                    nFailed++;
                }
            }
        });
        this.cache = newCache;
        if (nFailed) {
            this.UIManager.addError(`${nFailed} features failed to re-index using the new identifier field ${newIdentifierField}.`);
        }
        this.saveCache();
        this._currentIdentifierField = newIdentifierField;
        this.saveIdentifierField();
    }

    private clearCache(){
        this.cache = {};
        this.saveCache();
    }

    private saveCache(){
        this.UIManager.visual.persistDataToCard("uploadedGeojson", this.cache);
    }
    private saveIdentifierField(){
        this.UIManager.visual.persistDataToCard("uploadedGeojson_idfield", this.currentIdentifierField);
    }
}
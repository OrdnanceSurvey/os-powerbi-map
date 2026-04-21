import { Feature, FeatureCollection } from "geojson";
import shp from 'shpjs';
import { feature } from 'topojson-client';
import { FileTypeResult, UploadResult, FeatureWithCrs, FeatureCollectionWithCrs, GeojsonNamedCrs  } from "../types/geocoding-types";
import { getUniqueColumns, getAllColumns } from "./Geocode_Utils";
import proj4 from "proj4";
import { LogRecord, LogRecordTypes } from "../logging/LoggingTypes";

/**
 * Class to handle conversion of uploaded geospatial data files into GeoJSON features and loading 
 * into an UploadedDataGeocoder.
 * Takes users uploaded data (shp, geojson, topojson) and converts it to 
 * geojson (GeoJsonFeatureDictionary) like this:
 *      {identifierField: geojson} 
 * then calls UploadedDataGeocoder.populateCache so that the visual can then match PowerBI features to 
 * the uploaded features. It will need to understand different 
 * projections and also simplify things if they are too big.
 */
export class UploadedDataConverter {
    private sendLogRecord: (logRecord: LogRecord) => void;

    constructor (onSendLog: (logRecord:LogRecord) => void){ 
        this.handleFileUpload = this.handleFileUpload.bind(this);
        this.sendLogRecord = onSendLog;
    }
  
    private getNumFeatures(features: Feature[]) {
        return features.length
    }

    private async loadEpsgCrsDefinition(crsDef:string|number):Promise<boolean>
    {
        // proj4leaflet doesn't support link type definitions so we have to fetch and define ourselves
        // also we are only going to support EPSG codes for now, not ogc urns because there's basically 
        // no documentation on them
        try{
            if(typeof crsDef === "string" && !crsDef.match(/^\d+$/)){
                console.error(`'${crsDef}' is not a valid EPSG code.`);
                return false
            }
            const url = `https://epsg.io/${crsDef}.proj4`; // remember to add to capabilities.json
            const response = await fetch(url);
            const wkt = await response.text();
            // load into proj4 defs
            proj4.defs(`EPSG:${crsDef}`, wkt);
            return true;
        } catch (error) {
            console.error(`Failed to load CRS definition for EPSG:${crsDef}`, error);
            return false;
        }
    }

    private parseEpsgCode(crs: GeojsonNamedCrs): string | null {
        const epsgMatch = crs.properties.name.match(/EPSG:(\d+)/);
        return epsgMatch ? epsgMatch[1] : null;
    }

    // GEOJSON
    // Method to convert geojson featurecollection or single feature to an array of features, ensuring that proj4 
    // defs are loaded for any crs specified
    private async geojsonToFeatureArray(geojson: FeatureCollectionWithCrs | FeatureWithCrs): Promise<FeatureWithCrs[]> {
        const features: FeatureWithCrs[] = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
        let collectionCrs: GeojsonNamedCrs | undefined = undefined;
        if(geojson.type=== 'FeatureCollection' && geojson.crs){
            collectionCrs = geojson.crs;
            let success = false;
            let epsgId = this.parseEpsgCode(collectionCrs);
            if(epsgId){
                if(proj4.defs(`EPSG:${epsgId}`)){
                    // if we already have the definition, use that
                    success = true
                }
                else{
                    success = await this.loadEpsgCrsDefinition(epsgId)
                    // todo: log success or failure
                    let logRecord = new LogRecord();
                    logRecord.metric = success ? LogRecordTypes.CRS_LOAD_SUCCESS : LogRecordTypes.CRS_LOAD_FAILURE;
                    logRecord.logTime = new Date();
                    logRecord.logEntry = {
                        crs: collectionCrs,
                        crsSource: 'collection'
                    }
                    //console.log(logRecord);
                    this.sendLogRecord(logRecord);
                }
            }
            if(!success){
                    console.warn(`CRS definition not found for: ${collectionCrs.properties.name}.
                        Only EPSG:nnnn type CRS references are supported in GeoJSON files. Feature CRS will be ignored and assumed to be lon-lat or BNG.`);
                    collectionCrs = undefined
            }
        }
        let lastFailedCrs: string | null = null;
        // now ensure all features have a crs defined, either their own or the collection one, and that the proj4 def is loaded
        for(const f of features){
            if(!f.crs && collectionCrs){
                f['crs'] = collectionCrs
            }
            else if (f.crs){
                let thisfeatureEpsgId = this.parseEpsgCode(f.crs);
                if(thisfeatureEpsgId){
                    if(!proj4.defs(`EPSG:${thisfeatureEpsgId}`)){
                        let success = thisfeatureEpsgId === lastFailedCrs ? false : await this.loadEpsgCrsDefinition(thisfeatureEpsgId)
                        if(!success){
                            if(collectionCrs){
                                console.warn(`CRS definition not found for: ${f.crs.properties.name}. Using collection CRS instead.`)
                                f['crs'] = collectionCrs
                            }
                            else{
                                console.warn(`CRS definition not found for: ${f.crs.properties.name}. 
                                    Only EPSG:nnnn type CRS references are supported in GeoJSON files. Feature CRS will be ignored and assumed to be lon-lat or BNG.`)
                                // delete f['crs']
                                f.crs = undefined
                            }
                            lastFailedCrs = thisfeatureEpsgId;
                        }
                        else{
                            // we have successfully loaded the definition so leave it be
                            //console.log(`Loaded CRS definition for feature: ${f.crs.properties.name}.`)
                        }
                        let logRecord = new LogRecord();
                        logRecord.metric = success ? LogRecordTypes.CRS_LOAD_SUCCESS : LogRecordTypes.CRS_LOAD_FAILURE;
                        logRecord.logTime = new Date();
                        logRecord.logEntry = {
                            crs: f.crs,
                            crsSource: 'feature'
                        }
                        this.sendLogRecord(logRecord);
                    }
                    // else we already have the definition so leave it be
                }
                else{
                    console.warn(`Could not parse EPSG code from feature CRS: ${f.crs.properties.name}.`)
                    if(collectionCrs){
                        console.warn(`Using collection CRS instead.`)
                        f['crs'] = collectionCrs
                    }
                    else{
                        console.warn(`Feature will be assumed to be EPSG:4326.`)
                        f['crs'] = undefined
                    }
                }
            }
            // else no crs on feature or collection so assume 4326
        }
        return features
    }

    // TOPOJSON
    private topojsonToFeatureArray(topojson): Feature[] {
        // do not support crs in topojson, it has been added to the osgeo/gdal implementation but not topojson-client
        const keys = Object.keys(topojson.objects)
        const geojson = feature(topojson, topojson.objects[keys[0]])
        // ternary to make array of features whether FeatureCollection or single Feature
        const features: Feature[] = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
        return features
    }

    // SHAPEFILE
    // helper function to package up shp component files into an arraybuffer object
    private async readShapefileComponents(files: File[]): Promise<{ [key: string]: ArrayBuffer }> {
        const fileMap: { [key: string]: ArrayBuffer } = {};

        for (const file of files) {
            const ext = file.name.toLowerCase().split('.').pop();
            if (ext) {
                fileMap[ext] = await file.arrayBuffer();
            }
        }
        return fileMap;
    }

    // helper function to read a zipped shapefile
    public readZipFile(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
    }

    // Method to convert shapefiles to an array of geojson features -
    // might want to do this slightly different if we use the File API to
    // upload a file - check out shpjs docs for that syntax
    private async shapefileToFeatureArray(
        shapefile: ArrayBuffer | { [filename: string]: ArrayBuffer }
    ): Promise<Feature[]> {
        const geojson: FeatureCollection = await shp(shapefile) as FeatureCollection;
        return geojson.features
    }
 
    // method to find file type, warnings, and missing files
    public async getFileType(files: FileList | File[]): Promise<FileTypeResult> {
        const fileArray = Array.from(files);
        const fileNames = fileArray.map(file => file.name.toLowerCase());
        const foundExts = fileNames.map(name => name.split('.').pop());

        const requiredShapefileExts = ['shp', 'shx', 'dbf', 'prj'];
        const missingComponents = requiredShapefileExts.filter(ext => !foundExts.includes(ext));

        // individual shp components
        if (requiredShapefileExts.some(ext => foundExts.includes(ext))) {
            if (missingComponents.length === 0) {
                return { type: 'shapefile' };
            } else {
                return {
                    type: 'shapefile',
                    warnings: ['Shapefile is incomplete. Missing required components.'],
                    missingComponents
                };
            }
        }

        // Case 2: Zipped shapefile - ASSUMED - improve logic somehow
        if (
            fileArray.length === 1 &&
            fileArray[0].name.toLowerCase().endsWith('.zip')
        ) {
            return { type: 'shapefile' };
        }

        for (const file of fileArray) {
            const ext = file.name.toLowerCase().split('.').pop();
            const text = await file.text();

            if ((ext === 'topojson' || ext === 'json') && text.includes('"Topology"')) {
                return { type: 'topojson' };
            }

            if ((ext === 'geojson' || ext === 'json') && text.includes('"FeatureCollection"')) {
                return { type: 'geojson' };
            }
        }

        return { type: 'unknown' };
    }


    public async handleFileUpload(event: Event):Promise<UploadResult> {
        const files = (event.target as HTMLInputElement).files;
        if (!files || files.length === 0) return;

        const fileArray = Array.from(files);
        const fileTypeResult = await this.getFileType(fileArray);
        const fileName = fileArray[0].name.split('.').shift()!;
        const totalFileSize = fileArray.reduce((sum, file) => sum + file.size, 0);
        const totalMB = totalFileSize / (1024 * 1024);
        //console.log(`Total file size: ${totalMB.toFixed(2)} MB`);
        if(totalMB > 50){ // 50MB limit
            return({
                success: false,
                errorMessages: ['File size exceeds 50MB limit. Please upload a smaller file. Consider simplifying your data using a GIS program, or reducing the number of features.'],
                fileSizeMb: totalMB.toFixed(2),
                fileName: fileName,
                sourceType: fileTypeResult.type
            });
        }
        // enforce single file rule
        if (fileTypeResult.type !== 'shapefile' && fileArray.length > 1) {
            return({
                success: false,
                errorMessages: ['Only one file is allowed unless uploading a shapefile.'],
                sourceType: fileTypeResult.type
            });
        }

        try {
            let parseResult: UploadResult
            switch (fileTypeResult.type) {
            case 'shapefile':
                if (fileTypeResult.missingComponents?.length) {
                    parseResult = {
                        success: false,
                        errorMessages: [`Shapefile is incomplete. Missing: ${fileTypeResult.missingComponents.join(', ')}`],
                        sourceType: 'shapefile',
                        fileName: fileName
                    };
                    break;
                }

                let shapefileInput: ArrayBuffer | { [filename: string]: ArrayBuffer };

                // Zipped shapefile
                if (fileArray.length === 1 && fileArray[0].name.toLowerCase().endsWith('.zip')) {
                shapefileInput = await this.readZipFile(fileArray[0]);
                } else {
                    // Individual shapefile components
                    shapefileInput = await this.readShapefileComponents(fileArray);
                }

                const result = await this.shapefileToFeatureArray(shapefileInput);
                const numFeatures = this.getNumFeatures(result);
                
                parseResult = {
                    success: true,
                    colNames: getAllColumns(result),
                    uniqueColNames: getUniqueColumns(result),
                    fileName,
                    numFeatures,
                    features: result,
                    fileSizeMb: totalMB.toFixed(2),
                    errorMessages: [],
                    sourceType: 'shapefile'
                };
                break;

            case 'geojson':
                const geojsonText = await fileArray[0].text();
                const geojson = JSON.parse(geojsonText);
                const geojsonResult = await this.geojsonToFeatureArray(geojson);
                parseResult = {
                    success: true,
                    colNames: getAllColumns(geojsonResult),
                    uniqueColNames: getUniqueColumns(geojsonResult),
                    fileName,
                    numFeatures: this.getNumFeatures(geojsonResult),
                    features: geojsonResult,
                    fileSizeMb: totalMB.toFixed(2),
                    errorMessages: [],
                    sourceType: 'geojson'
                };
                break;

            case 'topojson':
                const topojsonText = await fileArray[0].text();
                const topojson = JSON.parse(topojsonText);
                const topojsonResult = this.topojsonToFeatureArray(topojson);
                parseResult = {
                    success: true,
                    colNames: getAllColumns(topojsonResult),
                    uniqueColNames: getUniqueColumns(topojsonResult),
                    fileName,
                    numFeatures: this.getNumFeatures(topojsonResult),
                    features: topojsonResult,
                    fileSizeMb: totalMB.toFixed(2),
                    errorMessages: [],
                    sourceType: 'topojson'
                };
                break;

            case 'unknown':
            default:
                parseResult = {
                    success: false,
                    errorMessages: ['Unsupported or unrecognized file type.'],
                    sourceType: 'unknown'
                };
                break;
            }
            if(parseResult.uniqueColNames?.length === 0){
                parseResult.success = false
                parseResult.errorMessages.push("No unique columns found in uploaded data. Please ensure your data contains at least one column with unique values.")
            }
            return parseResult
        } catch (error) {
            const parseResult:UploadResult = {
                success: false,
                errorMessages: [`Error processing file: ${error.message}`],
                sourceType: fileTypeResult.type
            }
            return parseResult;
        }
    }
}

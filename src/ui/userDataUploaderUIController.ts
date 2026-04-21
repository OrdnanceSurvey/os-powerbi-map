import { LogRecord, LogRecordTypes } from "../logging/LoggingTypes";
import { UploadResult } from "../types/geocoding-types";
import { UploadedDataConverter } from "../utils/UploadedDataConverter";
import { GeojsonOptimizer } from "../utils/UploadedDataReceiver";
export class UserDataUploaderUIController {
    public uploadedDataConverter: UploadedDataConverter;
    private fileInputId: string = 'file_upload';
    private listenerAttached: boolean = false;
    private continueButtonCallback: ((uploadResult: UploadResult) => void) | null = null;
    private sendLogRecord: (logRecord: LogRecord) => void;
    constructor(
        onContinue: (uploadResult: UploadResult) => void,
        onSendLog: (logRecord:LogRecord) => void
    ) {
        this.uploadedDataConverter = new UploadedDataConverter(onSendLog);
        this.continueButtonCallback = onContinue;
        this.sendLogRecord = onSendLog;
    }

    public showUploaderUI(hasData: boolean): void {
        const uploaderElement = document.querySelector('.user-data-uploader') as HTMLElement;
        if (uploaderElement) {
            uploaderElement.style.display = 'flex';
        }
        this.toggleNoDataStatus(hasData);
        this.attachFileInputListener();
        this.attachDeleteButtonListener();
    }

    public toggleNoDataStatus(hasData: boolean): void {
        const noDataWarning = document.querySelector('.user-data-uploader__no-data-warning') as HTMLElement;
        if (noDataWarning) {
            noDataWarning.style.display = hasData ? 'none' : 'block';
        }
        const uploader__instructions = document.querySelector('.user-data-uploader__instructions') as HTMLElement;
        if (uploader__instructions) {
            uploader__instructions.style.display = hasData ? 'block' : 'none';
        }
        // enable or disable the file input based on hasData
        const fileInput = document.getElementById(this.fileInputId) as HTMLInputElement;
        if (fileInput) {
            fileInput.disabled = !hasData;
        }
        const input_button = document.querySelector('.user-data-uploader__button') as HTMLElement;
        if (input_button) {
            input_button.style.display = hasData ? 'flex' : 'none';
        }
    }

    public hideUploaderUI(): void {
        const uploaderElement = document.querySelector('.user-data-uploader') as HTMLElement;
        if (uploaderElement) {
            uploaderElement.style.display = 'none';
        }
    }

    private attachFileInputListener(): void {
        const fileInput = document.getElementById(this.fileInputId) as HTMLInputElement;
        if (fileInput && !this.listenerAttached) {
            fileInput.addEventListener('change', (async (event) => {
                //console.log("File input changed");
                const uploadResult = await this.uploadedDataConverter.handleFileUpload(event);
                this.processUploadResult(uploadResult);                
            }).bind(this));
            this.listenerAttached = true;
        }
    }

    processUploadResult(uploadResult: UploadResult) {
        if (!uploadResult.success) {
            // Handle upload error
            console.error("Upload failed:", uploadResult.errorMessages);
            this.DisplayUserDataError(uploadResult.errorMessages.join(", ") || 'An unknown error occurred during upload.');
            let logRecord:LogRecord = new LogRecord
            logRecord.metric = LogRecordTypes.DATA_UPLOAD_FAILURE;
            logRecord.logTime = new Date();
            // set the log entry to be a string representation of uploadResult except for the features array
            let { features, ...rest } = uploadResult;
            logRecord.logEntry = rest;
            this.sendLogRecord(logRecord);
            return;
        }
        // TODO: display generalization settings UI (consisting of a checkbox to enable generalization and a slider to choose toleranc), 
        //console.log("Uploaded file size: "+uploadResult.fileSizeMb+" MB");
        // log the total bytes of the features
        const totalBytes = uploadResult.features.reduce((sum, feature) => sum + JSON.stringify(feature).length, 0);
        //console.log("Total bytes of features: " + totalBytes + " bytes");
        uploadResult = this.applyGeneralizationSettings(uploadResult);
        if(!uploadResult.success){
            this.DisplayUserDataError(uploadResult.errorMessages.join(", ") || 'An unknown error occurred whilst processing the uploaded data.');
            let logRecord:LogRecord = new LogRecord
            logRecord.metric = LogRecordTypes.DATA_UPLOAD_FAILURE;
            logRecord.logTime = new Date();
            // set the log entry to be a string representation of uploadResult except for the features array
            let { features, ...rest } = uploadResult;
            logRecord.logEntry = rest;
            this.sendLogRecord(logRecord);
            return;
        }
        //console.log("Total bytes after generalization: " + uploadResult.features.reduce((sum, feature) => sum + JSON.stringify(feature).length, 0) + " bytes");
        // Handle successful upload
        this.DisplayUserDataInfo(uploadResult);
        // TODO we perhaps should give option to strip out non-unique columns here too, to save memory / storage size   
        const checkbox = (document.getElementById('includeNonUniqueColumns') as HTMLInputElement);
        checkbox.disabled = false; // enable the checkbox after pressing continue
        this.attachContinueButtonListener(uploadResult);
        let logRecord:LogRecord = new LogRecord
        logRecord.metric = LogRecordTypes.DATA_UPLOAD_SUCCESS;
        logRecord.logTime = new Date();
        // set the log entry to be the uploadResult object except for the features array
        let { features, ...rest } = uploadResult;
        logRecord.logEntry = rest;
        this.sendLogRecord(logRecord);
    }

    private applyGeneralizationSettings(uploadResult: UploadResult): UploadResult {
        let newFeatures = [];
        let simplifier = new GeojsonOptimizer();
        for (const feature of uploadResult.features || []) {
            try{
                const processedFeatureResult = simplifier.optimizeFeature(feature);
                if(processedFeatureResult.simplificationStatus === "Failed"){
                    uploadResult.errorMessages = ["Geometry issues were detected that could not be automatically fixed. Please check your data using a GIS application."];
                    uploadResult.success = false;
                    break;
                }
                else if (processedFeatureResult.simplificationStatus === "Fixed"){
                    //console.warn("Geometry issues were detected and fixed during simplification.");
                    // this won't be shown:
                    uploadResult.errorMessages.push("Geometry issues were detected and fixed during import.");
                }
                newFeatures.push(processedFeatureResult.optimizedFeature);
            }
            catch(e){
                uploadResult.errorMessages.push("Error simplifying feature: " + e.message);
                uploadResult.success = false;
                break
            }
        }
        uploadResult.features = newFeatures;
        return uploadResult;
        // TODO this ideally wants to :
        // get the uploaded data from the converter
        // estimate the spatial extent of the data and suggest a simplification tolerance, with a method for user adjustment
        // simplify the data using the tolerance and update the displayed estimate of data size
    }

    private attachDeleteButtonListener(): void {
        const deleteButton = document.querySelector('.user-data-uploader__delete');
        const fileInput = document.getElementById(this.fileInputId) as HTMLInputElement;

        if (deleteButton) {
            deleteButton.addEventListener('click', (() => {
            const card = document.querySelector('.user-data-uploader__card');
            const errorParagraph = document.querySelector('.user-data-uploader__upload-error');
            const continueButton = document.querySelector('.user-data-uploader__continue');

            if (card) (card as HTMLElement).style.display = 'none';
            if (errorParagraph) {
                errorParagraph.textContent = '';
                (errorParagraph as HTMLElement).style.display = 'none';
            }
            if (continueButton) {
                this.removeContinueButtonListener();
                this.attachContinueButtonListener({} as UploadResult); // will cause unloading of data from geocoder
                continueButton.classList.add('disabled');
            }
            if (fileInput) {
                fileInput.value = '';
            }
            // Reset accordion headers and bodies
            document.querySelectorAll('.accordion-header').forEach(header => {
                header.classList.remove('open');
            });

            document.querySelectorAll('.accordion-body').forEach(body => {
                body.classList.remove('open');
                body.innerHTML = ''; // Optional: clear content
            });
            }).bind(this));
                
        }
    }

    private attachContinueButtonListener(uploadResult: UploadResult): void {
        const continueButton = document.querySelector('.user-data-uploader__continue');
        if (continueButton) {
            continueButton.textContent = uploadResult.features?.length ? 'Load data' : 'Unload data';
            continueButton.classList.remove('disabled');
            continueButton.addEventListener('click', () => {
                const checkbox = (document.getElementById('includeNonUniqueColumns') as HTMLInputElement);
                checkbox.disabled = true; // disable the checkbox after pressing continue
                uploadResult = this.maybeStripNonUniqueColumns(uploadResult);
                // call the provided callback function with the current upload result
                this.continueButtonCallback && this.continueButtonCallback(uploadResult);
                this.removeContinueButtonListener();
                this.hideUploaderUI();
            });
        }
    }
    
    private maybeStripNonUniqueColumns(uploadResult: UploadResult): UploadResult {
        const includeNonUnique = (document.getElementById('includeNonUniqueColumns') as HTMLInputElement).checked;
        if (!includeNonUnique) {
            // Strip non-unique columns from the upload result
            uploadResult = {
                ...uploadResult,
                features: uploadResult.features?.map(feature => {
                    const uniqueColumns = Object.keys(feature.properties).filter(key => uploadResult.uniqueColNames?.includes(key));
                    return {
                        ...feature,
                        properties: Object.fromEntries(Object.entries(feature.properties).filter(([key]) => uniqueColumns.includes(key)))
                    };
                })
            };
        }
        return uploadResult;
    }

    private removeContinueButtonListener(): void {
        const continueButton = document.querySelector('.user-data-uploader__continue');
        if (continueButton) {
            // remove the listener from the continue button
            const newButton = continueButton.cloneNode(true);
            continueButton.parentNode?.replaceChild(newButton, continueButton);
            const newButtonEl = newButton as HTMLElement;
            newButtonEl.classList.add('disabled');
        }
    }

    private DisplayUserDataInfo(uploadResult: UploadResult) {
        const card = document.querySelector('.user-data-uploader__card');
        const filenameSpan = card?.querySelector('.filename') as HTMLSpanElement;
        const featuresSpan = card?.querySelector('.numFeatures');

        const errorParagraph = document.querySelector('.user-data-uploader__upload-error');
        const continueButton = document.querySelector('.user-data-uploader__continue');
        // define otherColNames as all columns except those in uniqueColNames
        const otherColNames = uploadResult.colNames?.filter(col => !uploadResult.uniqueColNames?.includes(col)) || [];
        if (uploadResult.fileName && uploadResult.numFeatures && card && filenameSpan && featuresSpan) {
            filenameSpan.textContent = uploadResult.fileName;
            filenameSpan.title = uploadResult.fileName;
            featuresSpan.textContent = `${uploadResult.numFeatures}`;
            
            (card as HTMLElement).style.display = 'flex';

            // Hide error if previously shown

            if (errorParagraph) {
            errorParagraph.textContent = '';
            (errorParagraph as HTMLElement).style.display = 'none';
            }

            // Enable continue button
            if (continueButton) {
            continueButton.classList.remove('disabled');
            }

            // Inject accordion UI for column names
            this.injectAccordionUI(uploadResult);

        } else if (card) {
            (card as HTMLElement).style.display = 'none';
        }
    }

    private DisplayUserDataError(errorMessage: string) {
        const errorParagraph = document.querySelector('.user-data-uploader__upload-error');
        const card = document.querySelector('.user-data-uploader__card');
        const continueButton = document.querySelector('.user-data-uploader__continue');

        if (errorParagraph) {
            errorParagraph.textContent = errorMessage;
            (errorParagraph as HTMLElement).style.display = 'flex';
        }

        // Hide the card if it's currently visible
        if (card) {
            (card as HTMLElement).style.display = 'none';
        }
        
        // Disable continue button
        if (continueButton) {
            continueButton.classList.add('disabled');
        }
    }


    private attachAccordionToggleListeners(): void {
        const accordionContainer = document.querySelector('.column-accordion');
        if (!accordionContainer) return;

        // Remove any existing listener first
        accordionContainer.replaceWith(accordionContainer.cloneNode(true));
        const freshContainer = document.querySelector('.column-accordion');

        freshContainer?.addEventListener('click', (event) => {
            const button = (event.target as HTMLElement).closest('.accordion-header');
            if (!button) return;

            const targetId = button.getAttribute('data-target');
            document.querySelectorAll('.accordion-body').forEach(content => {
                const parentHeader = content.previousElementSibling as HTMLElement;
                if (content.id === targetId) {
                    content.classList.toggle('open');
                    parentHeader?.classList.toggle('open');
                } else {
                    content.classList.remove('open');
                    parentHeader?.classList.remove('open');
                }
            });
        });
    }


    private injectAccordionUI(uploadResult: UploadResult): void {
        const uniqueBody = document.getElementById('unique');
        const otherBody = document.getElementById('other');

        const uniqueCols = uploadResult.uniqueColNames || [];
        const otherCols = uploadResult.colNames?.filter(col => !uniqueCols.includes(col)) || [];

        // Reset accordion state
        document.querySelectorAll('.accordion-body').forEach(body => {
            body.classList.remove('open');
            body.innerHTML = ''; // Clear previous content
        });

        document.querySelectorAll('.accordion-header').forEach(header => {
            header.classList.remove('open');
        });

        // Inject new content
        if (uniqueBody) {
            uniqueBody.innerHTML = uniqueCols.length
                ? `<p>${uniqueCols.join(`, `)}</p>`: `<p>None</p>`;
        }

        if (otherBody) {
            otherBody.innerHTML = otherCols.length
                ? `<p>${otherCols.join(`, `)}</p>`: `<p>None</p>`;
        }

        // Reattach listeners to fresh headers
        this.attachAccordionToggleListeners();
    }
}

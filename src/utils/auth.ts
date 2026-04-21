import { authUrl, VISUAL_ID, EXPIRY_DATE } from "../resources";

/**
 * Represents the result of an API authorisation check.
 */
export interface ApiAuthResult{
    visual_id: string,
    authorised: boolean,
    org_name: string,
    expiry: Date
}

/**
 * Handles authorisation logic for the Power BI visual, including API calls and expiry checks.
 * If VISUAL_ID indicates an open source build, it bypasses API calls and sets authorisation to true.
 */
export class VisualAuth{
    private buildExpiryDate: Date;
    private apiAuthResult: ApiAuthResult | null = null;
    private applicationID: string
    
    /**
     * Constructs a VisualAuth instance and sets up internal state.
     */
    constructor(){
        this.applicationID = VISUAL_ID;
        this.buildExpiryDate = new Date(Date.parse(EXPIRY_DATE));
        if (this.applicationID === 'OPEN_SOURCE'){
            this.apiAuthResult = {
                visual_id: this.applicationID,
                authorised: true,
                org_name:  'Open source user',
                expiry: this.buildExpiryDate
            }
        }
    }

    /**
     * Calls the authorisation API to check if the visual is authorised.
     * Requires a remote API to be available, with an endpoint matching the authUrl constant and accepting a visual_id query parameter, 
     * returning a JSON object with the shape of ApiAuthResult. Implementation of this API is outside the scope of this visual, but an 
     * implementation can be provided by the user or organization.
     * @returns A promise resolving to the API authorisation result.
     * @private
     */
    private async callAuthApi(): Promise<ApiAuthResult>{
        const url = `${authUrl}/?visual_id=${this.applicationID}`
        try{
            const opts:RequestInit = {
                method: "GET",
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                },
                cache: "force-cache"
            };
            const response = await fetch(url, opts);
            if(!response.ok){
                console.log("Auth override due to http error");
                return {
                    visual_id: this.applicationID,
                    authorised: true,
                    org_name: null,
                    expiry: this.buildExpiryDate
                };
            }
            const result = await response.json();
            if(result.expiry){
                result.expiry = new Date(Date.parse(result.expiry))
            }
            else{
                result.expiry = this.buildExpiryDate;
            }
            return result;
        }
        catch(error){
            console.log("Auth override due to api service not found");
            return {
                visual_id: this.applicationID,
                authorised: true,
                org_name: null,
                expiry: this.buildExpiryDate
            };
        }
    }

    /**
     * Gets the current authorisation details, fetching them if necessary.
     * @returns A promise resolving to the API authorisation result.
     */
    public async AuthDetails(): Promise<ApiAuthResult>{
        const isAuth =  await this.IsAuthorised();
        return this.apiAuthResult;
    }

    /**
     * Checks if the current authorisation is expired.
     * @returns True if expired, false otherwise.
     */
    public IsExpired(): boolean{
        const currentDate = new Date();
        const isExpired = currentDate >= this.apiAuthResult.expiry;
        return isExpired;
    }

    /**
     * Checks if the visual is authorised, calling the API if needed.
     * @returns A promise resolving to true if authorised, false otherwise.
     */
    public async IsAuthorised(): Promise<boolean>{
        if (this.apiAuthResult === null){
            this.apiAuthResult = await this.callAuthApi();
        }
        if (this.IsExpired()){
            return false;
        }
        return this.apiAuthResult.authorised
    }
}
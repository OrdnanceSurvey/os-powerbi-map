"use strict";
import { OSPowerBIVisual } from "../visual";
import { OSPowerBIMapManager } from "../maps/mapmanager";
import createLandingPageContent from "./landing";
import { PopupContent } from "./notifications";
import { UserDataUploaderUIController } from "../ui/userDataUploaderUIController";
import Templates from "./templates";
import { checkAPIKey } from "../utils/checkApiKey";
import { LegendManager } from "../maps/legend";
import DialogAction = powerbi.DialogAction;
import {NotAuthorisedDialog} from "./authdialog";
import {ApiAuthResult} from "../utils/auth"
import {EXPIRY_DATE, ONS_ESRI_ATTRIB, GET_OS_ATTRIB} from "../resources"
import { visualVersion } from "../resources";
import { LogRecord, LogRecordTypes } from "../logging/LoggingTypes";
import { UploadResult } from "../types/geocoding-types";

/**
 * Manages the UI for the OS Power BI visual, including the map container, landing page, notifications, and attribution.
 */
export class OSPowerBIUIManager {
  public visual: OSPowerBIVisual;
  public mapManager: OSPowerBIMapManager;
  private target: HTMLElement;
  private mapDiv: HTMLElement;
  private landingDiv: HTMLElement;
  private landingContent: HTMLElement;
  private landingPageButton: HTMLElement;
  private notificationButton: HTMLElement;
  private notificationPopup: HTMLElement;
  private closeNotificationsButton: HTMLElement;
  private mapAttributionButton: HTMLElement;
  private mapAttributionPopup: HTMLElement;
  private mapAttributionOverlay: HTMLElement;
  private closeMapAttribution: HTMLElement;
  private userDataUploaderUI: HTMLElement;
  private UserDataUploaderUIController: UserDataUploaderUIController;
  private isLandingPageOn: boolean = false;
  private authDialogSeen: boolean = false;
  private popupContentController: PopupContent;
  private closeDataUploaderButton: HTMLElement;
  private filterWarningSeen: boolean = false;
  public legendManager: LegendManager;
  public isEditMode: boolean;
  
  constructor(visual: OSPowerBIVisual, target: HTMLElement) {
    this.visual = visual;
    this.target = target;
    // TODO move all of this to a DOM manager
    this.target.style.width = "100%";
    this.target.style.height = "100%";

    this.mapDiv = document.createElement("div");
    this.target.appendChild(this.mapDiv);
    this.mapDiv.className = "map-container";
    this.mapManager = new OSPowerBIMapManager(this, this.mapDiv);

    this.landingDiv = document.createElement("div");
    this.landingDiv.className = "landing-page";
    this.landingDiv.setAttribute("style", "display:none");
    this.buildLandingPageContent();
    this.target.appendChild(this.landingDiv);
    this.landingDiv.replaceChildren(this.landingContent);
    // this is currently set to display: None and has purely been kept in the
    // code to show how you might show an expiry for the visual in the landing
    // page banner
    document.getElementById('expiryDate').textContent = new Date(Date.parse(EXPIRY_DATE)).toDateString();

    // add version number to landing page banner
    document.getElementById("version").textContent = visualVersion;

    this.landingPageButton = document.createElement("div");
    this.landingPageButton.innerHTML = Templates.InfoButton;
    this.landingPageButton.addEventListener("click", () => {
      this.ToggleLandingPage(true);
      this.mapManager.toggleVisibility(false);
    });
    this.target.appendChild(this.landingPageButton);

    // user data uploader
    this.userDataUploaderUI = document.createElement("div");
    this.userDataUploaderUI.setAttribute("class", "user-data-uploader");
    this.userDataUploaderUI.innerHTML = Templates.UserDataUploader;
    this.target.appendChild(this.userDataUploaderUI);
    // todo move to userDataUploaderUIController 
    this.closeDataUploaderButton = document.querySelector('.user-data-uploader__cancel');
    this.closeDataUploaderButton.addEventListener("click", () => {
      this.ToggleUserDataUploader(false)
    });
    this.UserDataUploaderUIController = new UserDataUploaderUIController(
      this.delegateUploadedDataToGeocoder.bind(this),
      this.sendLogRecord.bind(this),
    );

    // Error popup
    this.popupContentController = new PopupContent(
      () => {this.toggleNotificationDot(true)},
      false, false
      );
    this.notificationPopup = document.createElement("div");
    this.notificationPopup.className = "notification-popup";
    this.notificationPopup.innerHTML = Templates.NotificationPopup;
    this.target.appendChild(this.notificationPopup);

    // error button
    this.notificationButton = document.createElement("button");
    this.notificationButton.setAttribute("class", "toggle notification-button");
    this.notificationButton.innerHTML = Templates.NotificationButton;
    this.notificationButton.addEventListener("click", () => {
      this.ToggleNotificationsPopup(true);
    });
    this.target.appendChild(this.notificationButton);

    // if close button is clicked trigger function to close popup
    this.closeNotificationsButton = document.getElementById("closePopup");
    this.closeNotificationsButton.addEventListener("click", () => {
      this.ToggleNotificationsPopup(false);
    });

    this.legendManager = new LegendManager(this.target)

    // map attribution
    this.mapAttributionButton = document.createElement("span");
    this.mapAttributionButton.setAttribute("class", "material-symbols-rounded map-attribution--small")
    this.mapAttributionButton.innerHTML = `info`
    this.target.appendChild(this.mapAttributionButton)
    this.mapAttributionButton.addEventListener("click", () => {
      this.ToggleMapAttribution(true)
    })
    // overlayto blank out screen behind map attribution
    this.mapAttributionOverlay = document.createElement("div");
    this.mapAttributionOverlay.classList.add("map-attribution-popup__overlay")
    // Close popup when clicking on the overlay
    this.mapAttributionOverlay.onclick = () => {
      this.ToggleMapAttribution(false)
    };
    // if window is made bigger close map attribution popup
    window.addEventListener("resize", () => {
      if (window.innerWidth > 675) {
          this.ToggleMapAttribution(false)
      }
    });
  }

  private delegateUploadedDataToGeocoder(uploadResult: UploadResult){
    // Relay / delegate the uploaded data to the geocoder from the upload controller to the 
    // geocoder that will use it to interact with the rest of the visual
    this.visual.receiveUploadedData(uploadResult);
  }

  /**
   * Toggles the notification dot on or off.
   * @param notificationDotOn Whether to show the notification dot.
   */
  public toggleNotificationDot(notificationDotOn: boolean) {
    if (!notificationDotOn) {
      this.notificationButton.setAttribute("class", "toggle notification-button");
    }
    if (notificationDotOn) {
      this.notificationButton.setAttribute("class", "toggle notification-button notification-button--has-notification");
    }
  }

  /**
   * Enables or disables debug mode.
   * @param showDebugMessages Show debug messages.
   * @param showDevMessages Show developer messages.
   */
  public ToggleDebugMode(showDebugMessages: boolean, showDevMessages: boolean){
    this.popupContentController.setShowDebug(showDebugMessages);
    this.popupContentController.setShowDevDebug(showDevMessages);
  }

  public ToggleUserDataUploader(show:boolean, hasData:boolean=false){
    if (show) {
      this.ToggleNotificationsPopup(false);
      this.UserDataUploaderUIController.showUploaderUI(hasData);
    } else {
      this.UserDataUploaderUIController.hideUploaderUI();
    } 
  }

  /**
   * Builds the landing page content.
   */
  private buildLandingPageContent():void{
    this.landingContent = createLandingPageContent(
      true,
      () => {
        this.ToggleLandingPage(false);
        this.mapManager.toggleVisibility(true);
      },
      (url) => {
        this.visual.host.launchUrl(url);
      },
      (button) => {this.copyToClipboard(button)}
    )
  }

  /**
   * Copies content to the clipboard.
   * @param button The button element triggering the copy.
   */
  public copyToClipboard(button) {
    const content = button.closest('.landing-page__copyable-box').querySelector('.landing-page__copyable-content').textContent;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(content).then(() => {
        this.showCopySuccess(button);
      }).catch((err) => {
        console.error('Clipboard API failed, falling back to execCommand:', err);
        this.fallbackCopyTextToClipboard(content, button);
      });
    } else {
      this.fallbackCopyTextToClipboard(content, button);
    }
  }

  /**
   * Fallback for copying text to clipboard using execCommand.
   * @param content The text to copy.
   * @param button The button element.
   */
  public fallbackCopyTextToClipboard(content, button) {
    const textArea = document.createElement('textarea');
    textArea.value = content;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      this.showCopySuccess(button);
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
    document.body.removeChild(textArea);
  }

  /**
   * Shows a copy success message.
   * @param button The button element.
   */
  public showCopySuccess(button) {
    button.style.backgroundColor = '#ff5e0069';
    button.style.color = 'white';
    
    // After 1 sec apply the transition and revert styles
    setTimeout(() => {
      button.style.transition = 'background-color 1s ease-out, color 1s ease-out';
      button.style.backgroundColor = '';
      button.style.color = '';

      // After the transition completes, reset the transition property
      setTimeout(() => {
        button.style.transition = '';
      }, 1000); // Match this duration with the transition duration
    }, 1000); // Initial delay before starting the fade-out
  }

  /**
   * Builds the map attribution popup.
   */
  public BuildMapAttributionPopup() {
    this.mapAttributionPopup = document.createElement("div");
    this.mapAttributionPopup.classList.add("map-attribution-popup");
    this.mapAttributionPopup.innerHTML = `<h3>Attribution</h3>` + GET_OS_ATTRIB() + `<br>` + (this.mapManager.ONSAttributionShown ? ONS_ESRI_ATTRIB : "");
    this.target.appendChild(this.mapAttributionPopup)
    this.target.appendChild(this.mapAttributionOverlay)

    // close button
    this.closeMapAttribution = document.createElement("button");
    this.closeMapAttribution.classList.add("close-button");
    this.closeMapAttribution.innerHTML = `<span class="material-symbols-rounded"> close </span>`;
    this.mapAttributionPopup.appendChild(this.closeMapAttribution);
    this.closeMapAttribution.onclick = () => {
      this.ToggleMapAttribution(false)
    };
  }

  /**
   * Shows or hides the map attribution popup.
   * @param showPopup Whether to show the popup.
   */
  public ToggleMapAttribution(showPopup: boolean) {
    if (showPopup) {
      if (!this.mapAttributionPopup) {
        this.BuildMapAttributionPopup()
      }
      this.mapAttributionPopup.style.display = "block";
      this.mapAttributionOverlay.style.display = "block";
    } 
    else {
        if (this.mapAttributionPopup) {
          this.mapAttributionPopup.style.display = "none";
          this.mapAttributionOverlay.style.display = "none";
          // remove this so it rebuilds with correct content when ONS attribution is removed
          this.mapAttributionPopup.remove();
          this.mapAttributionPopup = null;
        }
    }
  }

  /**
   * Shows or hides the landing page.
   * @param turnOn Whether to show the landing page.
   */
  public ToggleLandingPage(turnOn: boolean) {
    if (turnOn && !this.isLandingPageOn) {
      this.isLandingPageOn = true;
      const allowClose = this.canRenderMap();
      this.landingDiv.replaceChildren(this.landingContent);
      const closeBtn = document.getElementById('landing-close-button');
      if(!allowClose){
        closeBtn.style.display='none'
      }
      else{
        closeBtn.style.display='flex'
      }
      this.landingDiv.style.display = "flex";
    } else {
      if (this.isLandingPageOn && !turnOn) {
        this.landingDiv.replaceChildren();
        this.landingDiv.style.display = "none";
        this.isLandingPageOn = false;
      }
    }
  }
  
  /**
   * Handles API key updates. Saves the new status and triggers relevant UI updates.
   * @param updateId The update identifier.
   */
  public async apiKeyUpdated(updateId: string):Promise<boolean> {
    let newStatus: "free" | "premium" | "invalid";
    let statusChanged: boolean = false;
    if (this.visual.formattingSettings.apiKey.length === 0) {
      newStatus = "invalid";
    }
    else {
      newStatus = await checkAPIKey(this.visual.formattingSettings.apiKey);
    }
    if (newStatus !== this.visual.keyStatus) {
      statusChanged = true;
    }
    if (statusChanged) {
      this.visual.updateKeyStatus(newStatus);
      switch (newStatus) {
        case "invalid":
          this.addError(
              "The API key you entered is invalid! Make sure you have the Maps API added to your OS Data Hub Project."
            );
            this.ToggleNotificationsPopup(true);
            break;
          case "free":
            this.ToggleNotificationsPopup(false);
            this.addWarning(
              "You can access open data with this free API key.", "apikey"
            );
            break;
          case "premium":
            this.ToggleNotificationsPopup(false);
            this.addWarning(
              "You can access premium data with this API key.", "apikey"
            );
            break;
        }
        if (updateId) { this.logApiKey(updateId, newStatus) }
    }
    return statusChanged;
  }

  /**
   * Logs API key usage.
   * @param updateId The update identifier.
   */
  private logApiKey(updateId:string, newStatus: "free" | "premium" | "invalid"){
    let logData = {
      keyStatus: newStatus
    };
    let logRecord: LogRecord = new LogRecord();
    logRecord.updateId = updateId;
    logRecord.metric = LogRecordTypes.API_KEY_CHANGE;
    logRecord.apiKey = this.visual.formattingSettings.apiKey;
    logRecord.logTime = new Date();
    logRecord.isEditMode = this.isEditMode;
    logRecord.logEntry = logData;
    this.sendLogRecord(logRecord);
  }

  public sendLogRecord(logRecord: LogRecord){
    this.visual.sendLogRecord(logRecord);
  }

  /**
   * Determines if the map can be rendered.
   */
  private canRenderMap() {
    // maybe implement additional logic here if needed
    const result: boolean = this.visual.isAuthorised  && 
      (this.visual.formattingSettings.apiKey.length>0) && 
      (this.visual.keyStatus === "free" || this.visual.keyStatus === "premium");
    this.addDevMessage(`canRenderMap check: keylength=${this.visual.formattingSettings.apiKey.length}, status=${this.visual.keyStatus}, 
      isAuthorised='${this.visual.isAuthorised}', result=${result}`);
    return result;
  }

  public setUnauthorisedAlert(){
    if(!this.authDialogSeen){
      const dialogOptions = {
        actionButtons:[DialogAction.OK],
        title:"Visual not authorised"
      }
      this.visual.host.openModalDialog(NotAuthorisedDialog.id, dialogOptions);
      this.authDialogSeen = true;
    }
  }

  // this is used to display details about authorised users of the visual
  // on the landing page from when the product was in beta stage
  // it is all hooked up but the div that displays it is set to display: none
  // as we nolonger use it - we are just leaving it in for educational purposes
  public displayAuthInfo(authDetails:ApiAuthResult){
    let orgName = document.getElementById('orgName');
    if (orgName) { orgName.textContent = authDetails.org_name; }
    let expiryDate = document.getElementById('expiryDate');
    if (expiryDate) { expiryDate.textContent = authDetails.expiry.toDateString(); }
  }

   /**
   * Displays the latest available version number to user - used in visual
   * constructor by checkForNewerVersionAndNotifyUser method if a newer 
   * version is available on Github
   */
  public displayNewerVersionNotice(latestVersion: string) {
    const updateNoticeEl = document.getElementById('versionUpdateNotice')
    if (!updateNoticeEl) return;
    
    updateNoticeEl.textContent = `, a newer version: v${latestVersion} is available on GitHub`;
  }


  /**
   * Determines whether the map can render and updates the UI accordingly to show map or landing page.
   * Based on the current API key status and visual authorisation.
   * @returns 
   */
  public updateMapCanRender():boolean{
    if (!this.canRenderMap()) {
      this.ToggleLandingPage(true);
      this.mapManager.toggleVisibility(false);
      return false;
    } else {
      this.ToggleLandingPage(false);
      // turn on the map's div, but a map may not exist in it
      this.mapManager.toggleVisibility(true);
      return true
    }
  }

  public setSelectability(isDataviewFiltered:boolean, zoomPanSelectChanged:boolean){
    if(isDataviewFiltered){
      this.displayFilterWarning()
      this.mapManager.toggleLasso(false);
      this.mapManager.toggleZoomPanSelect(false);
      this.visual.switchOffZPSSwitch();
    }
    else if (zoomPanSelectChanged) {
      if (this.visual.formattingSettings.zoomPanSelectStatus) {
        // disable lasso
        // note that the map's lasso event handler still remains as it isn't tied to a specific
        // instance of the lasso controller
        this.mapManager.toggleLasso(false);
        this.mapManager.toggleZoomPanSelect(true);
        this.mapManager.clearMapSelection(true);
        // could call an initial select here, rather than have to wait until next zoom/pan
      } else {
        this.mapManager.toggleLasso(true);
        this.mapManager.toggleZoomPanSelect(false);
        this.mapManager.clearMapSelection(true);
      }
    }
    else{
      this.mapManager.toggleLasso(true);
      this.mapManager.clearMapSelection(true);
    }
  }

  SetViewOrEditMode(viewMode: powerbi.ViewMode) {
    if(viewMode == powerbi.ViewMode.View){
      this.notificationButton.setAttribute("style", "display:none");
      this.landingPageButton.setAttribute("style", "display:none");
      this.isEditMode = false;
    }
    else{
      this.notificationButton.setAttribute("style", "display:flex");
      this.landingPageButton.setAttribute("style", "display:flex");
      this.isEditMode = true;
    }
  }
 
  /**
   * Toggles the notifications popup.
   * @param turnOn Whether to show the popup.
   */
  public ToggleNotificationsPopup(turnOn: boolean) {
    let popupContainer = document.querySelector(".notification-popup__container") as HTMLElement;
    const content = this.popupContentController.getContent();
    popupContainer.appendChild(content);

    const notificationPopup = document.querySelector(".notification-popup") as HTMLElement;

    if (turnOn) {
    notificationPopup.style.display = "flex";
    this.toggleNotificationDot(false);
    } else {
      notificationPopup.style.display = "none"
      this.popupContentController.setNotificationsSeen();
    }
  }

  public displayFilterWarning() {
    if (!this.filterWarningSeen){
      // selection on our side doesn't play nicely with cross-filtering as the data is already filtered by the time we get it
      // so we disable it and show a warning if the data is filtered by something other than the visual's own zoom/pan/select controls.
      // This is a result of the Table dataview model we have chosen, which does not have highlight data like the categorical model does
      this.DisplayToastNotification("Selection disabled", 'Lasso selection is disabled when cross-filtering is active');
      this.filterWarningSeen = true;
    }
  }

  private addPopupMessage(notificationParam: string,  typeParam: "debug" | "warning" | "error" | "dev-debug", idParam?: string) {
    this.popupContentController.addMessage({notification: notificationParam, type: typeParam, id: idParam})
  }

  public addDebugMessage(notification: string, id?: string) {
    this.addPopupMessage(notification, "debug", id)
  }

  public addDevMessage(notification: string, id?: string){
    this.addPopupMessage(notification, "dev-debug", id)
    // OR 
    //console.debug(notification);
  }

  public addWarning(notification: string, id?: string) {
    this.addPopupMessage(notification, "warning", id)
  }

  public addError(notification: string, id?: string) {
    this.addPopupMessage(notification, "error", id)
  }

  public removeUnseenNotifsById(id) {
    this.popupContentController.removeUnseenNotifsById(id)
    const hasUnseenNotifs = this.popupContentController.checkIfUnseenNotifs()
    if (!hasUnseenNotifs) {
      this.toggleNotificationDot(false)
    }
  }

  // TODO move to DOMManager, maybe
  public DisplayToastNotification(messageHeader?:string, messageText?:string, level='warning'){
    if(!messageHeader){this.mapManager.notificationControl.clear(); return}
    const fn = level === 'warning' ? this.mapManager.notificationControl.warning :
      level === 'alert' ? this.mapManager.notificationControl.alert :
      level === 'success' ? this.mapManager.notificationControl.success :
      level === 'info' ? this.mapManager.notificationControl.info :
      this.mapManager.notificationControl.custom;
     fn.bind(this.mapManager.notificationControl)(messageHeader, messageText);
  }

}

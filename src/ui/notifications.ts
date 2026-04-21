export interface Notification {
  id: string;
  notification: string | ``;
  type: "debug" | "warning" | "error" | "dev-debug";
  seen?: boolean;
}

export class PopupContent {
  private messages: Notification[];
  private maxLength: number = 60;
  private maxMessageLength: number = 2048;
  private alertCallback: Function;
  private showDebugMessages:boolean;
  private showDevMessages:boolean;
  constructor(alertCallback: Function, showDebug:boolean, showDevDebug:boolean) {
    this.messages = [];
    this.alertCallback = alertCallback;
    this.setShowDebug(showDebug);
    this.setShowDevDebug(showDevDebug);
  }

  public setShowDebug(showDebug:boolean):void{
    this.showDebugMessages = showDebug;
  }
  public setShowDevDebug(showDevDebug:boolean):void{
    this.showDevMessages = showDevDebug;
  }
  // checks if message pushed to method is in the messages array, if not it
  // checks the length and shifts to top of messages to be shown to user first.
  //  If message too long it crops it.

  addMessage(notification: Notification) {
    // only show debug notifs if the toggle is on
    if (notification.type === "debug" && !this.showDebugMessages){
      return;
    }
    if(notification.type === "dev-debug" && !this.showDevMessages){
      return;
    }
    if(this.showDebugMessages){console.debug(notification.notification)}
    // remove bit that says "Notifications displayed here!"
    const intro = document.querySelector(".notification-popup__intro")
    if (intro) {
      intro.remove();
    }
    
    // set notification text as message
    let { notification: message } = notification;

    // Remove all old unseen notifications with the same ID or message
    // allowing for multiple
    this.messages = this.messages.filter(
      (notif) => !(notif.id && notification.id && notif.id === notification.id || notif.notification === message) || notif.seen
    );

    // Ensure number of notifs doesn't exceed max
    if (this.messages.length == this.maxLength) {
      this.messages.shift();
    }

    // Make sure notifications don't exceed a certain length too
    if (message.length > this.maxMessageLength) {
      message = message.slice(0, this.maxMessageLength) + "...";
    }
    
    this.messages.push(notification);
    this.alertCallback();
  }

  removeUnseenNotifsById(notificationId: string) {
    // Filter out all unseen notifications with the same ID
    this.messages = this.messages.filter(
        (notif) => notif.id !== notificationId || notif.seen
    );
}

  checkIfUnseenNotifs() {
    return this.messages.some(message => !message.seen);
  }

  setNotificationsSeen() {
    for (const notification of this.messages) {
      notification.seen = true;
    }
  }

  private addMessagesToSection(messages: Notification[], sectionTitle: string, popupMessage: HTMLElement, isSeen: boolean) {
    const section = document.createElement("div");
    section.className = "notification-popup__section";
    const sectionText = document.createElement("span");
    sectionText.textContent = sectionTitle;
    const sectionLine = document.createElement("hr");
    section.appendChild(sectionText);
    section.appendChild(sectionLine);
    popupMessage.appendChild(section);
  
    messages.reverse().forEach(message => {
      const notificationDiv = document.createElement("div");
      notificationDiv.setAttribute("class", "notification-popup__notification");
      const messageParagraph = document.createElement("p");
      const icon = document.createElement("span");
      icon.className = "material-symbols-rounded";
      if (message.type == "error") {
        icon.textContent = "warning";
      } else {
        icon.textContent = "notifications";
      }
  
      messageParagraph.textContent = message.notification;
  
      notificationDiv.appendChild(icon);
      notificationDiv.appendChild(messageParagraph);
      if (isSeen) {
        notificationDiv.style.color = "grey";
        icon.style.color = "grey";
      }
      popupMessage.appendChild(notificationDiv);
    });
  }

  getContent() {
    let popupMessage = document.querySelector(".notification-popup__content") as HTMLElement;
    popupMessage.innerHTML = ""; // Clear previous content
  
    // Separate unseen and seen messages
    const unseenMessages = this.messages.filter(message => !message.seen);
    const seenMessages = this.messages.filter(message => message.seen);
  
    // Add "Now" section or "No new notifications" message
    if (unseenMessages.length > 0) {
      this.addMessagesToSection(unseenMessages, "Now", popupMessage, false);
    } else if (seenMessages.length > 0) {
      const noNewNotifications = document.createElement("div");
      noNewNotifications.textContent = "No new notifications";
      noNewNotifications.className = "notification-popup__no-new";
      popupMessage.appendChild(noNewNotifications);
    }
  
    // Add "Earlier" section
    if (seenMessages.length > 0) {
      this.addMessagesToSection(seenMessages, "Earlier", popupMessage, true);
    }
  
    return popupMessage;
  }
}

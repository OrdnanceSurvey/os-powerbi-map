import powerbi from "powerbi-visuals-api";
import DialogConstructorOptions = powerbi.extensibility.visual.DialogConstructorOptions;
import DialogAction = powerbi.DialogAction;

export class NotAuthorisedDialog{
    static id = "NotAuthorisedDialog"
    constructor(options:DialogConstructorOptions, initialState:object){
        const div = document.createElement("div");
        div.textContent = "This copy of the OS PowerBI Visual is not authorised and cannot be used"
        div.className = "not-authorised"
        options.element.appendChild(div);
    }
}

globalThis.dialogRegistry = globalThis.dialogRegistry || {};
globalThis.dialogRegistry[NotAuthorisedDialog.id] = NotAuthorisedDialog;
import { App, Modal, Setting } from "obsidian";
const {dialog} = require('electron').remote;
export class FileModal extends Modal {
  result: { [key: string]: string }= {"location": "", "consolidate": "", "notepath": ""};
  inputString: string;
  onSubmit: (result: { [key: string]: string }) => void;

  constructor(app: App, inputString: string, onSubmit: (result: { [key: string]: string }) => void) {
    super(app);
    this.inputString = inputString
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h2", {text: "Import Hunchly Notes and Captioned Images"});

    new Setting(contentEl)
      .setName("Notes location relative to the vault (if empty, notes get added to vault root).")
      .addText((text) =>
        text.onChange((value) => {
          this.result.location = value
        }));

    new Setting(contentEl)
    .setName("Do you want to consolidate notes by url?")
    .addToggle((toggle) =>
        toggle.onChange((value) => {
            if (value){
                this.result.consolidate = "true"
            }else {
                this.result.consolidate = "false"
            }
        }));
    new Setting(contentEl)
      .setName(this.inputString)
      .addButton((btn) =>
        btn
          .setButtonText("Select")
          .setCta()
          .onClick(() => {
            dialog.showOpenDialog({properties: ["openDirectory","openFile"]}, function (fileNames: any) {
                return fileNames
            }).then((fileNames: any) => {
                this.result.notepath = fileNames.filePaths[0]
                this.close();
                this.onSubmit(this.result);
            });
          }
        )
    );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
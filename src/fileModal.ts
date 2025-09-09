import { App, Modal, Setting } from "obsidian";
const {dialog} = require('electron').remote;
export class FileModal extends Modal {
  result: { [key: string]: string }= {"location": "", "consolidate": "", "zipPath": ""};
  inputString: string;
  onSubmit: (result: { [key: string]: string }) => void;

  constructor(app: App, inputString: string, onSubmit: (result: { [key: string]: string }) => void) {
    super(app);
    this.inputString = inputString
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h3", {text: "Hunchly  -> Obsidian"});

    new Setting(contentEl)
      .setName("Enter the Obsidian notes location relative to the vault (if empty, notes get added to vault root).")
      .addText((text) =>
        text.onChange((value) => {
          this.result.location = value
        }));

    // new Setting(contentEl)
    // .setName("Do you want to consolidate Hunchly notes by url?")
    // .addToggle((toggle) =>
    //     toggle.onChange((value) => {
    //         if (value){
    //             this.result.consolidate = "true"
    //         }else {
    //             this.result.consolidate = "false"
    //         }
    //     }));
    new Setting(contentEl)
      .setName(this.inputString)
      .addButton((btn) =>
        btn
          .setButtonText("Select")
          .setCta()
          .onClick(async () => {
            const filenames = await dialog.showOpenDialog({properties: ["openFile"]}, function (fileNames: any) {
                return fileNames
            })
            this.result.zipPath = filenames.filePaths[0]
            this.close();
            this.onSubmit(this.result);
          }
        )
    );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
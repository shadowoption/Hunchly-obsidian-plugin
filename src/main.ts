import { Notice, Plugin, addIcon } from 'obsidian';
import { FileModal } from './fileModal';
import { Hunchly } from './hunchly';

export default class HunchlyObsidianPlugin extends Plugin {
	async onload() {
		//https://en.wikipedia.org/wiki/File:Eo_circle_blue_white_letter-h.svg creative common license 
		addIcon("hunchly", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" enable-background="new 0 0 64 64"><circle cx="32" cy="32" r="30" fill="#fff"/><path d="M32,2C15.432,2,2,15.432,2,32s13.432,30,30,30s30-13.432,30-30S48.568,2,32,2z M43.664,46.508h-6.023V33.555H26.361v12.953
		h-6.025V17.492h6.025v11.063h11.279V17.492h6.023V46.508z" fill="#1e88e5"/></svg>`);
		// This creates an icon in the left ribbon.
		this.addRibbonIcon('hunchly', 'Hunchly', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new FileModal(this.app, "Select the exported hunchly case file (zip format).", (result) => {
				if (result.zipPath){
					new Notice('Processing the hunchly notes and images in path ' + result.zipPath, 3000);
					const hunchly = new Hunchly(result.zipPath, result.location, result.consolidate, this)
					hunchly.process()
				}
			}).open();
			
		});
	}
	onunload() { }
}

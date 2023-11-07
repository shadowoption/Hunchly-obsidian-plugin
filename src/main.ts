import { Notice, Plugin, PluginSettingTab, App, Setting, addIcon } from 'obsidian';
import { FileModal } from './fileModal';
import { Hunchly } from './processHunchly';

// Remember to rename these classes and interfaces!

interface HunchlyObsidianPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: HunchlyObsidianPluginSettings = {
	mySetting: 'default'
}

export default class HunchlyObsidianPlugin extends Plugin {
	settings: HunchlyObsidianPluginSettings;

	async onload() {
		await this.loadSettings();
		//https://en.wikipedia.org/wiki/File:Eo_circle_blue_white_letter-h.svg creative common license 
		addIcon("hunchly", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" enable-background="new 0 0 64 64"><circle cx="32" cy="32" r="30" fill="#fff"/><path d="M32,2C15.432,2,2,15.432,2,32s13.432,30,30,30s30-13.432,30-30S48.568,2,32,2z M43.664,46.508h-6.023V33.555H26.361v12.953
		h-6.025V17.492h6.025v11.063h11.279V17.492h6.023V46.508z" fill="#1e88e5"/></svg>`);
		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('hunchly', 'Hunchly Obsidian Plugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new FileModal(this.app, "Select the exported hunchly case file (zip format)", (result) => {
				new Notice('Processing the hunchly notes and images in path ' + result.notepath, 5000);
				const hunchly = new Hunchly(result.notepath, result.location, result.consolidate, this)
				hunchly.process()
			}).open();
			
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));

		// //link hotes
		// this.addCommand({
		// 	id: "link-notes",
		// 	name: "link-notes",
		// 	callback: () => {
		// 	  console.log("Hey, you!");
		// 	},
		// });
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: HunchlyObsidianPlugin;

	constructor(app: App, plugin: HunchlyObsidianPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}

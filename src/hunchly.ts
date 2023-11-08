import * as fs_promise from 'fs/promises';
import * as fs from 'fs';
import { FileSystemAdapter, Plugin, TFile, Vault } from 'obsidian';
import * as path from 'path'
import * as unzipper from 'unzipper';
import * as tmp from 'tmp';

interface IPage {
    title: string;
    url: string;
    date: string;
    hash: string;
}

interface INote {
    note: string;
    date: string;
    pageid: number;
}

interface IPhoto {
    caption: string;
    date: string;
    pageid: number;
    photourl: string;
    photohash:string;
    photopath:string;
}

export class Hunchly{
    hunchlyExportPath: string;
    vaultPath: string;
    plugin: Plugin
    vault: Vault
    hunchlyLocation: string
    consolidate: boolean

    pages: Map<string, IPage>
    notes: Map<string, INote>
    selector: Map<number, string>
    selectorHits: Map<number, number[]>
    taggedPhotos: Map<string, IPhoto>

    constructor(hunchlyExportPath: string, vaultlocation: string, consolidate: string, plugin: Plugin) {
        this.hunchlyExportPath = hunchlyExportPath;
        this.vaultPath = path.join((plugin.app.vault.adapter as FileSystemAdapter).getBasePath(), vaultlocation)
        this.plugin = plugin;
        this.vault = plugin.app.vault
        this.hunchlyLocation= vaultlocation

        if (consolidate == "true"){
            this.consolidate = true
        } else{
            this.consolidate = false
        }
    }

    async process() {
        const zipFilePath = this.hunchlyExportPath
        try {
            // Create a temporary directory for extraction.
            const tempDir = tmp.dirSync({ unsafeCleanup: true });
            const extractionPath = tempDir.name;
    
            // Create a read stream for the zip file.
            const readStream = fs.createReadStream(zipFilePath);
    
            // Pipe the read stream through unzipper to extract the contents.
            await readStream.pipe(unzipper.Extract({ path: extractionPath })).promise();
            
            const pages = await extractPages(extractionPath)
            const notes = await extractNotes(extractionPath)
            const photos = await extractPhotos(extractionPath)
            const selectors = await extractSelectors(extractionPath)
            const selectorHits = await extractSelectorsHits(extractionPath)
            
            await this.processNotes(notes, pages, selectors, selectorHits, extractionPath)
            await this.processImages(photos, pages, selectors, selectorHits, extractionPath)

            setTimeout(()=>{tempDir.removeCallback();}, 3000);
            
        } catch (error) {
            this.updateStatus("Error processing hunchly zip file");
            console.error(`Error processing hunchly zip file": ${error}`);
        }
    }

    private async checkFileOrFolderExistence(folder: string, filename: string): Promise<boolean> {
        const filePath = path.join(folder, filename)
        try {
                await fs_promise.access(filePath);
                return true;
            } catch (err) {
                // This adds a status bar saying invalid note path
                this.updateStatus(filePath + " does not exist");
                return false;
            }
    }

    private async updateStatus(status: string) {
        const statusBarItemEl = this.plugin.addStatusBarItem();
        statusBarItemEl.setText(status);
    }

    private async processNotes(notes: Map<number, INote>, pages: Map<number, IPage>, selectors: Map<number, string>, selectorHits: Map<number, number[]>, extractionPath : string){
        await this.createDirectoryIfNotExists(path.join("hunchly_notes", "screenshots"))
        const urlMap = new Map<string, string>()
        for (const [key, value] of notes) {
            const page = pages.get(value.pageid)
            const selectorhits = selectorHits.get(value.pageid)
            if (page) {
                let title = page.title
                let fileContent = ""
                title = title.substring(0, 65).replace(/[&/\\#,+()$~%.'":*?<>{} ]/g,'_')
                title = `${title}-notes-${key}`
                
                if (!(urlMap.has(page.url) && this.consolidate)) {
                    fileContent = "---\n"
                    fileContent = fileContent + `Date: ${value.date}\n`
                    fileContent = fileContent + `URL: ${page.url}\n`
                    fileContent = fileContent + "---\n"
                    if(selectorhits){
                        fileContent = await addSelectors(selectorhits, selectors, fileContent)
                    }
                }

                fileContent = fileContent + `${await this.processNoteContent(value.note)}\n\n`
                fileContent = await this.addImages(path.join(extractionPath, "note_screenshots"), path.join(this.vaultPath, "hunchly_notes", "screenshots"), `${key}.jpeg`, fileContent)
                fileContent = fileContent + "\n---\n"

                if (urlMap.has(page.url) &&  this.consolidate) {
                    const notePath = urlMap.get(page.url)
                    if (notePath){
                        await this.updateNoteFile(notePath, fileContent)
                    }
                } else {
                    await this.createNoteFile(`${title}.md`, fileContent)
                    urlMap.set(page.url, `${title}.md`)
                }                
            }
        }
    }

    private async processImages(photos: Map<number, IPhoto>, pages: Map<number, IPage>, selectors: Map<number, string>, selectorHits: Map<number, number[]>, extractionPath : string){
        await this.createDirectoryIfNotExists(path.join("hunchly_notes", "screenshots"))
        const urlMap = new Map<string, string>()
        for (const [key, value] of photos) {
            const page = pages.get(value.pageid)
            const selectorhits = selectorHits.get(value.pageid)
            if (page) {
                let title = page.title
                title = title.substring(0, 50).replace(/[&/\\#,+()$~%.'":*?<>{} ]/g,'_')
                title = `${title}-captioned-image-${key}`
                let fileContent = ""

                if (!(urlMap.has(page.url) && this.consolidate)) {
                    fileContent = "---\n"
                    fileContent = fileContent + `Date: ${value.date}\n`
                    fileContent = fileContent + `URL: ${value.photourl}\n`
                    fileContent = fileContent + `HASH: ${value.photohash}\n`
                    fileContent = fileContent + "---\n"
                    if(selectorhits){
                        fileContent = await addSelectors(selectorhits, selectors, fileContent)
                    }
                }   
                    
                fileContent = fileContent + `${await this.processNoteContent(value.caption)}\n\n`
                fileContent = await this.addImages(path.join(extractionPath, "tagged_photos"), path.join(this.vaultPath, "hunchly_notes", "screenshots"), value.photopath, fileContent)
                fileContent = fileContent + "\n---\n"

                if (urlMap.has(page.url) &&  this.consolidate) {
                    const notePath = urlMap.get(page.url)
                    if (notePath){
                        await this.updateNoteFile(notePath, fileContent)
                    }
                } else {
                    await this.createNoteFile(`${title}.md`, fileContent)
                    urlMap.set(page.url, `${title}.md`)
                }                
            }
        }
    }

    private async  createDirectoryIfNotExists(directoryPath: string): Promise<void> {
        try {
            await this.vault.createFolder(path.join(this.hunchlyLocation, directoryPath))
        } catch (error) {
            console.error(`Error creating the directory: ${error}`);
        }
    }

    private async processNoteContent(note: string){
        await this.vault.getMarkdownFiles().map((file) => {
            const searchMask = file.name.replace(".md", "")
            const regEx = new RegExp(searchMask, "ig");
            const replaceMask = ` [[${searchMask}]] `;
            note = note.replace(regEx, replaceMask)			
		})
        return note
    }

    private async addImages(source: string, destination: string, filename: string, fileContent: string) : Promise<string>{
        if (await this.checkFileOrFolderExistence(source, filename)){
            const sourceImagePath = path.join(source, filename)
            const destinationImagePath = path.join(destination, filename)
            await copyImages(sourceImagePath, destinationImagePath)
            return fileContent + `![[${filename}]]\n`
        }
        return fileContent
    }

    private async createNoteFile(filename: string, content: string): Promise<void> {
        try {
            const notepath =  path.join(this.hunchlyLocation, "hunchly_notes", filename)
            await this.vault.create(notepath, content)
        } catch (error) {
            console.error(`Error creating the file in ${filename}: ${error}`);
        }
    }

    private async updateNoteFile(filename: string, content: string): Promise<void> {
        try {
            const notepath =  path.join(this.hunchlyLocation, "hunchly_notes", filename)
            const notefile = this.vault.getAbstractFileByPath(notepath)

            if (notefile instanceof TFile){
                this.vault.append(notefile, content)
            }
        } catch (error) {
            console.error(`Error appending the file in ${filename}: ${error}`);
        }
    }

}


async function addSelectors(selectorhits: number[], selectors: Map<number, string>, fileContent: string): Promise<string>{
    fileContent = fileContent + "#### Selectors\n\n"
    selectorhits.forEach((selector)=>{
        const sel = selectors.get(selector)
        if (sel) {
            fileContent = fileContent + `#${sel.replace(/[&/\\#,+()$~%.'":*?<>{} =]/g,'-')}\t`
        }
    })
    return fileContent + "\n\n---\n"
}

async function extractSelectorsHits(zipFilePath: string): Promise<Map<number, number[]>> {
    const pagesPath = path.join(zipFilePath, "case_data", "selector_hits.json")
    const results = new Map<number, number[]>()
        
    try {
        const fileContent = await fs_promise.readFile(pagesPath, 'utf8');
        const jsonData = JSON.parse(fileContent);

        if (Array.isArray(jsonData)) {
            jsonData.forEach((item, index) => {
                if (results.has(item.PageID)){
                    const temp = results.get(item.PageID)
                    if (temp != undefined) {
                        temp.push(item.SelectorID)
                        results.set(item.PageID, temp)
                    }
                } else {
                    results.set(item.PageID, [item.SelectorID])
                }
            });
        }
    } catch (error) {
        console.error(`Error parsing the selector_hits.json file: ${error}`);
    }

    return results
}

async function extractSelectors(zipFilePath: string): Promise<Map<number, string>> {
    const pagesPath = path.join(zipFilePath, "case_data", "selectors.json")
    const results = new Map<number, string>()
        
    try {
        const fileContent = await fs_promise.readFile(pagesPath, 'utf8');
        const jsonData = JSON.parse(fileContent);

        if (Array.isArray(jsonData)) {
            jsonData.forEach((item, index) => {
                results.set(item.ID, item.Selector)
            });
        }
    } catch (error) {
        console.error(`Error parsing the selectors.json file: ${error}`);
    }

    return results
} 

async function extractPhotos(zipFilePath: string): Promise<Map<number, IPhoto>> {
    const pagesPath = path.join(zipFilePath, "case_data", "tagged_photos.json")
    const results = new Map<number, IPhoto>()
        
    try {
        const fileContent = await fs_promise.readFile(pagesPath, 'utf8');
        const jsonData = JSON.parse(fileContent);

        if (Array.isArray(jsonData)) {
            jsonData.forEach((item, index) => {
                const temp = {} as IPhoto
                temp.caption = item.Caption
                temp.date = item.PhotoTimestamp
                temp.pageid = item.PageId
                temp.photohash = item.PhotoHash
                temp.photourl = item.PhotoUrl
                temp.photopath = item.LocalFile
                results.set(item.ID, temp)
            });
        }
    } catch (error) {
        console.error(`Error parsing the tagged_photos.JSON file: ${error}`);
    }

    return results
}

async function extractNotes(zipFilePath: string): Promise<Map<number, INote>> {
    const pagesPath = path.join(zipFilePath, "case_data", "notes.json")
    const results = new Map<number, INote>()
        
    try {
        const fileContent = await fs_promise.readFile(pagesPath, 'utf8');
        const jsonData = JSON.parse(fileContent);

        if (Array.isArray(jsonData)) {
            jsonData.forEach((item, index) => {
                const temp = {} as INote
                temp.date = item.NoteDate
                temp.note = item.Note
                temp.pageid = item.PageId
                results.set(item.ID, temp)
            });
        }
    } catch (error) {
        console.error(`Error parsing the notes JSON file: ${error}`);
    }

    return results
}

async function extractPages(zipFilePath: string): Promise<Map<number, IPage>> {
    const pagesPath = path.join(zipFilePath, "case_data", "pages.json")
    const results = new Map<number, IPage>()
        
    try {
        const fileContent = await fs_promise.readFile(pagesPath, 'utf8');
        const jsonData = await JSON.parse(fileContent);
        if (Array.isArray(jsonData)) {
            await jsonData.forEach((item, index) => {
                const temp = {} as IPage
                temp.date = item.timestamp_created
                temp.hash = item.content_hash
                temp.url = item.url
                temp.title = item.title
                results.set(item.id, temp)
            });
        }
    } catch (error) {
        console.error(`Error parsing the pages JSON file: ${error}`);
    }        
    return results
}

async function copyImages(sourcePath: string, destinationPath: string): Promise<void> {
    try {
        const fileContent = await fs_promise.readFile(sourcePath);
        await fs_promise.writeFile(destinationPath, fileContent);
    } catch (error) {
        console.error(`Error copying the file: ${error}`);
    }
}




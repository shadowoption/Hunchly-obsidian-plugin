import * as fs_promise from 'fs/promises';
import * as fs from 'fs';
import { FileSystemAdapter, Plugin, TFile, Vault, Notice } from 'obsidian';
import * as path from 'path'
import * as unzipper from 'unzipper';
import * as tmp from 'tmp';
import { parseDocument } from "htmlparser2";
import { textContent } from "domutils";
import nlp from "compromise";
import { decode } from "he";
import * as qp from "quoted-printable";
import { htmlToText } from "html-to-text";

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

    pages: Map<number, IPage>
    notes: Map<number, INote>
    selector: Map<number, string>
    selectorHits: Map<number, number[]>
    taggedPhotos: Map<number, IPhoto>
    extractedData: Map<number, Map<string, string[]>>

    regexMap: Record<string, RegExp> = {
        // phone: /\+?\d[\d\-\s]{7,}\d/g,
        ip: /\b(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(?:\.|$)){4}\b/g, // stricter IPv4
        email: /[A-Za-z0-9]+[A-Za-z0-9._%+-]*@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,   // added \b for boundaries
        // Facebook: either profile.php?id=123 OR /username (excluding common reserved paths)
        social_media: /(?:https?:\/\/)?(?:www.)?(?:twitter|medium|facebook|vimeo|instagram)(?:.com\/)?([@a-zA-Z0-9-_]+)/img
    };

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
    
            // unzip the file
            await unzipper.Open.file(zipFilePath).then(d => d.extract({path: extractionPath, concurrency: 5}));

            if (!await this.checkFileOrFolderExistence(extractionPath, "case_data")){
                new Notice("Not a valid hunchly case file. Use Export > Export Case in the hunchly dashboard.", 5000)
                return
            }
            
            this.pages = await extractPages(extractionPath)
            this.notes = await extractNotes(extractionPath)
            this.taggedPhotos = await extractPhotos(extractionPath)
            this.selector = await extractSelectors(extractionPath)
            this.selectorHits = await extractSelectorsHits(extractionPath)
            this.extractedData = await extractData(extractionPath)
            
            await this.processPages(extractionPath)
            await this.processNotes(extractionPath)
            await this.processImages(extractionPath)

            setTimeout(()=>{tempDir.removeCallback();}, 3000);
            
        } catch (error) {
            new Notice("Not a valid hunchly case zip file.", 5000)  
            console.log(`Error processing hunchly zip file: ${error}`);
        }
    }

    private async checkFileOrFolderExistence(folder: string, filename: string): Promise<boolean> {
        const filePath = path.join(folder, filename)
        try {
                await fs_promise.access(filePath);
                return true;
            } catch (err) {
                return false;
            }
    }

    private async processPages(extractionPath : string){
        await this.createDirectoryIfNotExists(path.join("hunchly_captures", "screenshots"))
        for (const [key, page] of this.pages) {
            const selectorhits = this.selectorHits.get(key)
            if (page) {
                let title = page.title
                let fileContent = ""
                title = title.substring(0, 65).replace(/[&/\\#,+()$~%.'":*?<>{} ]/g,'_')
                title = `${title}-captures-${key}`

                fileContent = "---\n"
                fileContent = fileContent + `Date: ${page.date}\n`
                fileContent = fileContent + `URL: ${page.url}\n`
                fileContent = fileContent + "---\n"

                fileContent = await this.addDataExtractors(key, fileContent)
                fileContent = await this.extractNamesAndLocationsFromMhtml(path.join(extractionPath, "pages", `${key}.mhtml`), fileContent)
                if(selectorhits){
                    fileContent = await addSelectors(selectorhits, this.selector, fileContent)
                }

                fileContent = await this.addImages(path.join(extractionPath, "pages"), path.join(this.vaultPath, "hunchly_captures", "screenshots"), `${key}.jpeg`, fileContent)
                fileContent = fileContent + "\n---\n"
                
                await this.createMDFile(`${title}.md`, fileContent, "hunchly_captures")
            }
        }
    }

    private async processNotes(extractionPath : string){
        await this.createDirectoryIfNotExists(path.join("hunchly_notes", "screenshots"))
        const urlMap = new Map<string, string>()
        for (const [key, value] of this.notes) {
            const page = this.pages.get(value.pageid)
            const selectorhits = this.selectorHits.get(value.pageid)
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
                        fileContent = await addSelectors(selectorhits, this.selector, fileContent)
                    }
                }

                let note = await this.processNoteContent(value.note)
                if(note && note != null){
                    fileContent = fileContent + `${note}\n\n`
                }

                fileContent = await this.addImages(path.join(extractionPath, "note_screenshots"), path.join(this.vaultPath, "hunchly_notes", "screenshots"), `${key}.jpeg`, fileContent)
                fileContent = fileContent + "\n---\n"

                if (urlMap.has(page.url) &&  this.consolidate) {
                    const notePath = urlMap.get(page.url)
                    if (notePath){
                        await this.updateNoteFile(notePath, fileContent, "hunchly_notes")
                    }
                } else {
                    await this.createMDFile(`${title}.md`, fileContent, "hunchly_notes")
                    urlMap.set(page.url, `${title}.md`)
                }                
            }
        }
    }

    private async processImages(extractionPath : string){
        await this.createDirectoryIfNotExists(path.join("hunchly_captioned_images", "screenshots"))
        const urlMap = new Map<string, string>()
        for (const [key, value] of this.taggedPhotos) {
            const page = this.pages.get(value.pageid)
            const selectorhits = this.selectorHits.get(value.pageid)
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
                        fileContent = await addSelectors(selectorhits, this.selector, fileContent)
                    }
                }   
                
                let caption = await this.processNoteContent(value.caption)
                if(caption && caption != "null"){
                    fileContent = fileContent + `${caption}\n\n`
                }
                fileContent = await this.addImages(
                    path.join(extractionPath, "tagged_photos"), 
                    path.join(this.vaultPath, "hunchly_captioned_images", "screenshots"), 
                    value.photopath, 
                    fileContent
                )
                fileContent = fileContent + "\n---\n"

                if (urlMap.has(page.url) &&  this.consolidate) {
                    const notePath = urlMap.get(page.url)
                    if (notePath){
                        await this.updateNoteFile(notePath, fileContent, "hunchly_captioned_images")
                    }
                } else {
                    await this.createMDFile(`${title}.md`, fileContent, "hunchly_captioned_images")
                    urlMap.set(page.url, `${title}.md`)
                }                
            }
        }
    }

    private async  createDirectoryIfNotExists(directoryPath: string): Promise<void> {
        try {
            await this.vault.createFolder(path.join(this.hunchlyLocation, directoryPath))
        } catch (error) {
            console.log(error);
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

    private async createMDFile(filename: string, content: string, location: string): Promise<void> {
        try {
            const filepath =  path.join(this.hunchlyLocation, location, filename)
            await this.vault.create(filepath, content)
        } catch (error) {
            console.log(`Error creating the file in ${filename}: ${error}`);
        }
    }

    private async updateNoteFile(filename: string, content: string, location: string): Promise<void> {
        try {
            const notepath =  path.join(this.hunchlyLocation, location, filename)
            const notefile = this.vault.getAbstractFileByPath(notepath)

            if (notefile instanceof TFile){
                this.vault.append(notefile, content)
            }
        } catch (error) {
            console.log(`Error appending the file in ${filename}: ${error}`);
        }
    }

    private async addDataExtractors(pageId: number, fileContent: string): Promise<string>{
        const matches = this.extractedData.get(pageId)
        if (matches) {
            for (const [key, data] of matches.entries()){
                fileContent = fileContent + `#### ${key}:\n\n`
                for (const value of data){
                    fileContent = fileContent + `[[${value}]]\t`
                }
                fileContent = fileContent + "\n\n"
            }
        } 
        
        return fileContent + "\n\n---\n"
    }



    private async extractNamesAndLocationsFromMhtml(filePath: string, fileContent: string): Promise<string>{
        const raw = await fs_promise.readFile(filePath, "utf8");
        const htmlParts = raw.match(/<html[\s\S]*?<\/html>/gi);

        if (!htmlParts) {
            return fileContent
        };

        let allText = "";

        for (const m of htmlParts) {
            // Decode quoted-printable first
            const decodedQP = qp.decode(m.toString());

            // Decode HTML entities (&lt; &amp; etc.)
            const cleanHtml = decode(decodedQP.toString());

            // Parse and extract text
            const cleanText = htmlToText(cleanHtml, {
                wordwrap: 130,
                decodeEntities: true
            });
            // allText += " " + textContent(dom);
            allText += " " + cleanText;
        }
        
        const dom = parseDocument(allText);
        const text = textContent(dom)

        const doc = nlp(text);
        const people = Array.from(
            new Set(doc.people().out("array").map((p: string) => cleanString(p)))
        );

        const places = Array.from(
            new Set(doc.places().out("array").map((p: string) => cleanString(p)))
        );

        const orgs = Array.from(
            new Set(doc.organizations().out("array").map((p: string) => cleanString(p)))
        );
        
        fileContent = fileContent + `#### People:\n\n`
        for (const value of people){
            fileContent = fileContent + `[[${value}]]\t`
        }
        fileContent = fileContent + "\n\n"

        fileContent = fileContent + `#### Location:\n\n`
        for (const value of places){
            fileContent = fileContent + `[[${value}]]\t`
        }
        fileContent = fileContent + "\n\n"

         fileContent = fileContent + `#### Organizations:\n\n`
        for (const value of orgs){
            fileContent = fileContent + `[[${value}]]\t`
        }
        fileContent = fileContent + "\n\n"
        
        return fileContent + "\n\n---\n"
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
        console.log(`Error parsing the selector_hits.json file: ${error}`);
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
        console.log(`Error parsing the selectors.json file: ${error}`);
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
        console.log(`Error parsing the tagged_photos.JSON file: ${error}`);
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
        console.log(`Error parsing the notes JSON file: ${error}`);
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
        console.log(`Error parsing the pages JSON file: ${error}`);
    }        
    return results
}

async function extractData(zipFilePath: string) : Promise<Map<number, Map<string, string[]>>> {
    const dataMatches = path.join(zipFilePath, "case_data", "data_matches.json")
    const dataExtractors = path.join(zipFilePath, "case_data", "data_extractors.json")
    const result = new Map<number, Map<string, string[]>>()
    
    try {
        interface Extractor {
            ExtractorId: number;
            PageId: number;
            DataRecordId: number;
            Data: string;
        }
            
        const extractors = JSON.parse(await fs_promise.readFile(dataExtractors, 'utf8'));
        const extractorMap = new Map<number, string>()
        if (Array.isArray(extractors)) {
            extractors.forEach((item, index) => {
                extractorMap.set(item.ID, item.Name)
            });
        }

        if (extractorMap.size > 0) {
            const matches: Extractor[]= JSON.parse(await fs_promise.readFile(dataMatches, 'utf8'));
            if (Array.isArray(matches)) {
                matches.forEach((item, index) => {
                    const extractorName = extractorMap.get(item.ExtractorId)
                    if (result && result.has(item.PageId)){
                        const data= result.get(item.PageId)
                        if (extractorName && data && data.has(extractorName)){
                            const val = data.get(extractorName) || []
                            val.push(item.Data)
                        } else if (extractorName && data) {
                            data.set(extractorName, [item.Data])
                        } else {
                            console.log("data is undefined")
                        }
                    } else {
                        const ex = new Map<string, string[]>()
                        if (extractorName) {
                            result.set(item.PageId, ex.set(extractorName, [item.Data]))
                        }
                    }
                });
            }
        }
    } catch (error) {
        console.log(`Error parsing the selectors.json file: ${error}`);
    }

    return result
} 

async function copyImages(sourcePath: string, destinationPath: string): Promise<void> {
    try {
        await fs_promise.copyFile(sourcePath, destinationPath);
    } catch (error) {
        console.log(`Error copying the file: ${error}`);
    }
}

function cleanString(str: string): string {
  return str
    .trim()
    // Remove anything that’s not a letter, number, space, or basic punctuation
    .replace(/[^a-zA-Z0-9\s.'-]/g, "")
    // Collapse multiple spaces
    .replace(/\s+/g, " ")
    // Remove leading/trailing punctuation like commas, periods, dashes
    .replace(/^[,.\-'\s]+|[,.\-'\s]+$/g, "");
}   

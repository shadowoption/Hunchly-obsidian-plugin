# Hunchly Obsidian Sample Plugin

This is an obsidian plugin to convert Hunchly notes and captioned images in obsidian notes. Also adds the selector as tags.

Implementing using obsidian sample plugin template https://github.com/obsidianmd/obsidian-sample-plugin.git

## How to use

Click on the **H** ribbon icon on Obsidian.

In the modal,
- Enter the location to store the notes.  This is relative to the vault's root path.  If empty the notes get added to vault root
- Option to consolidate notes based on the same URL.  Hunchly notes take on the same url will be consolidate in one obsidian note
- Select the path where the hunchly export case file resides (in zip format).  Usually obtained by using the `Export Case` in the Hunchly Dashboard.
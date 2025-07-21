import { App, Plugin, PluginSettingTab, Setting, TFile, Notice } from 'obsidian';

export default class LogseqNamespaceInjector extends Plugin {
    async onload() {
        console.log('Loading Logseq Namespace Injector plugin');

        this.addSettingTab(new LogseqNamespaceInjectorSettingTab(this.app, this));

        // Add command to process existing files
        this.addCommand({
            id: 'process-existing-files',
            name: 'Process existing files with namespaces',
            callback: () => {
                this.processExistingFiles();
            }
        });

        // Register event listener for file creation
        this.registerEvent(
            this.app.vault.on('create', (file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.injectNamespace(file);
                }
            })
        );
    }

    onunload() {
        console.log('Unloading Logseq Namespace Injector plugin');
    }

    async processExistingFiles() {
        console.log('Processing existing files...');
        
        const files = this.app.vault.getMarkdownFiles();
        const filesToProcess = files.filter(file => file.parent?.path); // Only files in subdirectories
        
        if (filesToProcess.length === 0) {
            new Notice('No files found in subdirectories to process.');
            return;
        }
        
        // Show confirmation for large numbers of files
        if (filesToProcess.length > 50) {
            const proceed = confirm(`This will process ${filesToProcess.length} files. This may take a while. Continue?`);
            if (!proceed) {
                new Notice('Processing cancelled.');
                return;
            }
        }
        
        new Notice(`Processing ${filesToProcess.length} files with namespaces...`);
        
        let processedCount = 0;
        let updatedCount = 0;
        let errorCount = 0;
        
        for (const file of filesToProcess) {
            try {
                const hadNamespace = await this.fileHasNamespace(file);
                
                if (!hadNamespace) {
                    await this.injectNamespace(file);
                    updatedCount++;
                }
                
                processedCount++;
                
                // Add small delay to prevent overwhelming Obsidian
                if (processedCount % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                
            } catch (error) {
                console.error(`Error processing ${file.path}:`, error);
                errorCount++;
            }
        }
        
        console.log(`Processed ${processedCount} files, updated ${updatedCount}, errors: ${errorCount}`);
        
        if (errorCount > 0) {
            new Notice(`Processing complete! Updated ${updatedCount} files, ${errorCount} errors. Check console for details.`);
        } else {
            new Notice(`Processing complete! Updated ${updatedCount} out of ${processedCount} files.`);
        }
    }

    async fileHasNamespace(file: TFile): Promise<boolean> {
        try {
            const content = await this.app.vault.read(file);
            return content.includes('namespace::');
        } catch (error) {
            return false;
        }
    }

    async injectNamespace(file: TFile) {
        try {
            // Get the file's directory path
            const folderPath = file.parent?.path || '';
            
            // Skip if file is in root directory
            if (!folderPath) {
                return;
            }
            
            // Read current file content
            const content = await this.app.vault.read(file);
            
            // Check if namespace already exists
            if (content.includes('namespace::')) {
                return;
            }
            
            // Validate content is not empty or corrupted
            if (content === null || content === undefined) {
                console.warn(`Skipping ${file.path}: content is null or undefined`);
                return;
            }
            
            // Create namespace metadata
            const namespace = folderPath.replace(/\//g, '/');
            const namespaceMetadata = `namespace:: ${namespace}\n\n`;
            
            // Prepend namespace to file content
            const newContent = namespaceMetadata + content;
            
            // Validate new content before writing
            if (newContent.length < content.length) {
                console.error(`Skipping ${file.path}: new content is shorter than original`);
                return;
            }
            
            // Write updated content back to file using Obsidian's safe modify method
            await this.app.vault.modify(file, newContent);
            
            console.log(`Injected namespace "${namespace}" into ${file.path}`);
        } catch (error) {
            console.error(`Error injecting namespace into ${file.path}:`, error);
            throw error; // Re-throw to be caught by caller
        }
    }
}

class LogseqNamespaceInjectorSettingTab extends PluginSettingTab {
    plugin: LogseqNamespaceInjector;

    constructor(app: App, plugin: LogseqNamespaceInjector) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

        containerEl.createEl('h2', {text: 'Logseq Namespace Injector Settings'});

        new Setting(containerEl)
            .setName('Process existing files')
            .setDesc('This will add the namespace to all existing files in your vault that are in subdirectories and do not have a namespace yet. This can be useful when you first install the plugin.')
            .addButton(button => button
                .setButtonText('Process')
                .onClick(() => {
                    this.plugin.processExistingFiles();
                }));
    }
}

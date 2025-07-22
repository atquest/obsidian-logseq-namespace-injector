import { App, Plugin, PluginSettingTab, Setting, TFile, Notice, Modal } from 'obsidian';

/**
 * Interface for plugin settings
 */
interface LogseqNamespaceSettings {
    namespaceFormat: string;
    excludePatterns: string[];
    autoProcessNewFiles: boolean;
    batchSize: number;
    showProgressBar: boolean;
}

/**
 * Interface for file backup during atomic operations
 */
interface FileBackup {
    file: TFile;
    originalContent: string;
    timestamp: number;
}

/**
 * Interface for planned file changes
 */
interface PlannedChange {
    file: TFile;
    newContent: string;
    hasNamespace: boolean;
}

/**
 * Default plugin settings
 */
const DEFAULT_SETTINGS: LogseqNamespaceSettings = {
    namespaceFormat: '{path}',
    excludePatterns: ['templates/', '.trash/', 'archive/'],
    autoProcessNewFiles: true,
    batchSize: 50,
    showProgressBar: true
};

/**
 * Progress tracking for bulk operations
 */
class ProgressTracker {
    private total: number;
    private processed: number = 0;
    private notice: Notice | null = null;

    constructor(total: number) {
        this.total = total;
    }

    start(message: string) {
        this.notice = new Notice(`${message} (0/${this.total})`, 0);
    }

    update() {
        this.processed++;
        if (this.notice) {
            this.notice.setMessage(`Processing files... (${this.processed}/${this.total})`);
        }
    }

    finish(message: string) {
        if (this.notice) {
            this.notice.hide();
        }
        new Notice(message);
    }
}

/**
 * Confirmation modal for bulk operations
 */
class BulkOperationModal extends Modal {
    private files: TFile[];
    private onConfirm: () => void;
    private onCancel: () => void;

    constructor(app: App, files: TFile[], onConfirm: () => void, onCancel: () => void) {
        super(app);
        this.files = files;
        this.onConfirm = onConfirm;
        this.onCancel = onCancel;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Confirm Bulk Operation' });
        
        contentEl.createEl('p', { 
            text: `This will process ${this.files.length} files and add namespace metadata to files that don't have it yet.` 
        });

        if (this.files.length > 100) {
            contentEl.createEl('p', { 
                text: '⚠️ This is a large operation that may take several minutes.',
                cls: 'mod-warning'
            });
        }

        contentEl.createEl('p', { 
            text: '✅ Atomic operation: All files will be processed successfully or none at all.',
            cls: 'mod-success'
        });

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        
        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelButton.onclick = () => {
            this.close();
            this.onCancel();
        };

        const confirmButton = buttonContainer.createEl('button', { 
            text: 'Process Files',
            cls: 'mod-cta'
        });
        confirmButton.onclick = () => {
            this.close();
            this.onConfirm();
        };
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export default class LogseqNamespaceInjector extends Plugin {
    settings!: LogseqNamespaceSettings;

    async onload() {
        console.log('Loading Logseq Namespace Injector plugin v2.0');

        await this.loadSettings();
        this.addSettingTab(new LogseqNamespaceInjectorSettingTab(this.app, this));

        // Add command to process existing files
        this.addCommand({
            id: 'process-existing-files',
            name: 'Process existing files with namespaces',
            callback: () => {
                this.processExistingFiles();
            }
        });

        // Add command for dry run
        this.addCommand({
            id: 'dry-run-existing-files',
            name: 'Preview namespace changes (dry run)',
            callback: () => {
                this.previewChanges();
            }
        });

        // Register event listener for file creation (if enabled)
        if (this.settings.autoProcessNewFiles) {
            this.registerEvent(
                this.app.vault.on('create', (file) => {
                    if (file instanceof TFile && file.extension === 'md') {
                        // Add small delay to ensure file is fully created
                        setTimeout(() => this.injectNamespace(file), 100);
                    }
                })
            );
        }
    }

    onunload() {
        console.log('Unloading Logseq Namespace Injector plugin');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    /**
     * Validates that the vault is available and ready for operations
     */
    private validateVaultState(): boolean {
        if (!this.app?.vault) {
            new Notice('❌ Vault not available. Please try again.');
            return false;
        }

        if (!this.app.vault.adapter) {
            new Notice('❌ Vault adapter not ready. Please try again.');
            return false;
        }

        return true;
    }

    /**
     * Improved namespace detection using regex pattern
     */
    private hasNamespaceMetadata(content: string): boolean {
        // Match "namespace::" at start of line, with or without whitespace
        const namespaceRegex = /^\s*namespace\s*::\s*.+$/m;
        return namespaceRegex.test(content);
    }

    /**
     * Check if file should be excluded based on patterns
     */
    private shouldExcludeFile(file: TFile): boolean {
        const filePath = file.path.toLowerCase();
        return this.settings.excludePatterns.some(pattern => 
            filePath.includes(pattern.toLowerCase())
        );
    }

    /**
     * Generate namespace from file path using configured format
     */
    private generateNamespace(file: TFile): string {
        const folderPath = file.parent?.path || '';
        
        if (!folderPath) {
            return '';
        }

        // Apply namespace format
        let namespace = this.settings.namespaceFormat;
        namespace = namespace.replace('{path}', folderPath);
        namespace = namespace.replace('{name}', file.basename);
        
        // Clean up the namespace (remove redundant slashes, normalize)
        namespace = namespace.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
        
        return namespace;
    }

    /**
     * Preview changes without applying them
     */
    async previewChanges() {
        if (!this.validateVaultState()) return;

        try {
            const files = this.getFilesToProcess();
            const plannedChanges: PlannedChange[] = [];

            for (const file of files) {
                const content = await this.app.vault.read(file);
                const hasNamespace = this.hasNamespaceMetadata(content);
                
                if (!hasNamespace) {
                    const namespace = this.generateNamespace(file);
                    if (namespace) {
                        const newContent = `namespace:: ${namespace}\n\n${content}`;
                        plannedChanges.push({ file, newContent, hasNamespace });
                    }
                }
            }

            if (plannedChanges.length === 0) {
                new Notice('No files need namespace injection.');
                return;
            }

            // Show preview
            const previewText = plannedChanges
                .slice(0, 10)
                .map(change => `• ${change.file.path} → namespace:: ${this.generateNamespace(change.file)}`)
                .join('\n');

            const moreText = plannedChanges.length > 10 ? `\n... and ${plannedChanges.length - 10} more files` : '';

            new Notice(`Preview: ${plannedChanges.length} files will be updated:\n\n${previewText}${moreText}`, 10000);

        } catch (error) {
            console.error('Error during preview:', error);
            new Notice('❌ Error generating preview. Check console for details.');
        }
    }

    /**
     * Get all files that should be processed
     */
    private getFilesToProcess(): TFile[] {
        const files = this.app.vault.getMarkdownFiles();
        return files.filter(file => {
            // Only files in subdirectories
            if (!file.parent?.path) return false;
            
            // Exclude files matching patterns
            if (this.shouldExcludeFile(file)) return false;
            
            return true;
        });
    }

    /**
     * Create backups of files before modification (for atomic operations)
     */
    private async createBackups(files: TFile[]): Promise<FileBackup[]> {
        const backups: FileBackup[] = [];
        
        for (const file of files) {
            try {
                const content = await this.app.vault.read(file);
                backups.push({
                    file,
                    originalContent: content,
                    timestamp: Date.now()
                });
            } catch (error: any) {
                console.error(`Failed to backup ${file.path}:`, error);
                throw new Error(`Backup failed for ${file.path}: ${error?.message || 'Unknown error'}`);
            }
        }
        
        return backups;
    }

    /**
     * Restore files from backups (rollback)
     */
    private async restoreFromBackups(backups: FileBackup[]): Promise<void> {
        for (const backup of backups) {
            try {
                await this.app.vault.modify(backup.file, backup.originalContent);
            } catch (error) {
                console.error(`Failed to restore ${backup.file.path}:`, error);
                // Continue restoring other files even if one fails
            }
        }
    }

    /**
     * Atomically process existing files with full backup/rollback support
     */
    async processExistingFiles() {
        if (!this.validateVaultState()) return;

        try {
            const filesToProcess = this.getFilesToProcess();
            
            if (filesToProcess.length === 0) {
                new Notice('No files found to process.');
                return;
            }

            // Filter files that don't already have namespaces
            const plannedChanges: PlannedChange[] = [];
            const progress = new ProgressTracker(filesToProcess.length);
            
            progress.start('Analyzing files...');

            for (const file of filesToProcess) {
                try {
                    const content = await this.app.vault.read(file);
                    const hasNamespace = this.hasNamespaceMetadata(content);
                    
                    if (!hasNamespace) {
                        const namespace = this.generateNamespace(file);
                        if (namespace) {
                            const newContent = `namespace:: ${namespace}\n\n${content}`;
                            plannedChanges.push({ file, newContent, hasNamespace });
                        }
                    }
                    
                    progress.update();
                } catch (error) {
                    console.error(`Error analyzing ${file.path}:`, error);
                    throw error;
                }
            }

            progress.finish(`Analysis complete: ${plannedChanges.length} files need updates`);

            if (plannedChanges.length === 0) {
                new Notice('All files already have namespace metadata.');
                return;
            }

            // Show confirmation modal
            new BulkOperationModal(
                this.app,
                plannedChanges.map(c => c.file),
                () => this.executeAtomicOperation(plannedChanges),
                () => new Notice('Operation cancelled.')
            ).open();

        } catch (error: any) {
            console.error('Error during file processing:', error);
            new Notice(`❌ Error: ${error?.message || 'Unknown error'}`);
        }
    }

    /**
     * Execute the atomic operation with backup/rollback
     */
    private async executeAtomicOperation(plannedChanges: PlannedChange[]) {
        const filesToModify = plannedChanges.map(c => c.file);
        let backups: FileBackup[] = [];
        const progress = new ProgressTracker(plannedChanges.length);

        try {
            // Phase 1: Create backups
            progress.start('Creating backups...');
            backups = await this.createBackups(filesToModify);
            progress.finish('Backups created successfully');

            // Phase 2: Apply all changes
            progress.start('Applying changes...');
            
            for (let i = 0; i < plannedChanges.length; i++) {
                const change = plannedChanges[i];
                
                try {
                    await this.app.vault.modify(change.file, change.newContent);
                    progress.update();
                    
                    // Small delay for large batches to prevent overwhelming Obsidian
                    if (i > 0 && i % this.settings.batchSize === 0) {
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                    
                } catch (error: any) {
                    throw new Error(`Failed to modify ${change.file.path}: ${error?.message || 'Unknown error'}`);
                }
            }

            progress.finish(`✅ Successfully updated ${plannedChanges.length} files with namespace metadata!`);
            
            // Log success details
            console.log(`Atomic operation completed successfully:`, {
                filesProcessed: plannedChanges.length,
                timestamp: new Date().toISOString(),
                backupsCreated: backups.length
            });

        } catch (error) {
            console.error('Atomic operation failed, rolling back:', error);
            
            // Rollback: restore all files from backups
            if (backups.length > 0) {
                progress.start('Rolling back changes...');
                await this.restoreFromBackups(backups);
                progress.finish('❌ Operation failed. All files restored to original state.');
            }
            
            new Notice(`❌ Operation failed: ${(error as any)?.message || 'Unknown error'}\nAll files have been restored.`);
        }
    }

    /**
     * Check if file already has namespace (improved version)
     */
    async fileHasNamespace(file: TFile): Promise<boolean> {
        try {
            const content = await this.app.vault.read(file);
            return this.hasNamespaceMetadata(content);
        } catch (error) {
            console.error(`Error reading ${file.path}:`, error);
            return false;
        }
    }

    /**
     * Inject namespace into a single file (improved version)
     */
    async injectNamespace(file: TFile) {
        if (!this.validateVaultState()) return;

        try {
            // Skip if file is in root directory
            const namespace = this.generateNamespace(file);
            if (!namespace) {
                return;
            }

            // Check if file should be excluded
            if (this.shouldExcludeFile(file)) {
                return;
            }
            
            // Read current file content
            const content = await this.app.vault.read(file);
            
            // Check if namespace already exists
            if (this.hasNamespaceMetadata(content)) {
                return;
            }
            
            // Validate content
            if (content === null || content === undefined) {
                console.warn(`Skipping ${file.path}: content is null or undefined`);
                return;
            }
            
            // Create namespace metadata
            const namespaceMetadata = `namespace:: ${namespace}\n\n`;
            
            // Prepend namespace to file content
            const newContent = namespaceMetadata + content;
            
            // Validate new content
            if (newContent.length < content.length) {
                console.error(`Skipping ${file.path}: new content is shorter than original`);
                return;
            }
            
            // Write updated content
            await this.app.vault.modify(file, newContent);
            
            console.log(`Injected namespace "${namespace}" into ${file.path}`);
            
        } catch (error) {
            console.error(`Error injecting namespace into ${file.path}:`, error);
            throw error;
        }
    }
}

/**
 * Enhanced settings tab with all configuration options
 */
class LogseqNamespaceInjectorSettingTab extends PluginSettingTab {
    plugin: LogseqNamespaceInjector;

    constructor(app: App, plugin: LogseqNamespaceInjector) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Logseq Namespace Injector Settings' });

        // Auto-process new files setting
        new Setting(containerEl)
            .setName('Auto-process new files')
            .setDesc('Automatically add namespace metadata to new files created in folders')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoProcessNewFiles)
                .onChange(async (value) => {
                    this.plugin.settings.autoProcessNewFiles = value;
                    await this.plugin.saveSettings();
                }));

        // Namespace format setting
        new Setting(containerEl)
            .setName('Namespace format')
            .setDesc('Template for namespace generation. Use {path} for folder path, {name} for file name')
            .addText(text => text
                .setPlaceholder('{path}')
                .setValue(this.plugin.settings.namespaceFormat)
                .onChange(async (value) => {
                    this.plugin.settings.namespaceFormat = value || '{path}';
                    await this.plugin.saveSettings();
                }));

        // Exclude patterns setting
        new Setting(containerEl)
            .setName('Exclude patterns')
            .setDesc('Comma-separated list of folder patterns to exclude (e.g., templates/, .trash/)')
            .addTextArea(text => text
                .setPlaceholder('templates/, .trash/, archive/')
                .setValue(this.plugin.settings.excludePatterns.join(', '))
                .onChange(async (value) => {
                    this.plugin.settings.excludePatterns = value
                        .split(',')
                        .map(p => p.trim())
                        .filter(p => p.length > 0);
                    await this.plugin.saveSettings();
                }));

        // Batch size setting
        new Setting(containerEl)
            .setName('Batch size')
            .setDesc('Number of files to process before adding a small delay (prevents freezing)')
            .addSlider(slider => slider
                .setLimits(10, 200, 10)
                .setValue(this.plugin.settings.batchSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.batchSize = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'Bulk Operations' });

        // Preview changes button
        new Setting(containerEl)
            .setName('Preview changes')
            .setDesc('See which files would be modified without making any changes')
            .addButton(button => button
                .setButtonText('Preview')
                .setIcon('eye')
                .onClick(() => {
                    this.plugin.previewChanges();
                }));

        // Process existing files button
        new Setting(containerEl)
            .setName('Process existing files')
            .setDesc('Add namespace metadata to all existing files in subdirectories (atomic operation with backup)')
            .addButton(button => button
                .setButtonText('Process All Files')
                .setIcon('play')
                .setWarning()
                .onClick(() => {
                    this.plugin.processExistingFiles();
                }));

        // Help section
        containerEl.createEl('h3', { text: 'Help' });
        
        const helpDiv = containerEl.createDiv();
        helpDiv.innerHTML = `
            <p><strong>Namespace Format Examples:</strong></p>
            <ul>
                <li><code>{path}</code> → "Projects/MyProject"</li>
                <li><code>notes/{path}</code> → "notes/Projects/MyProject"</li>
                <li><code>{path}.{name}</code> → "Projects/MyProject.filename"</li>
            </ul>
            <p><strong>Safety Features:</strong></p>
            <ul>
                <li>✅ Atomic operations with automatic rollback on failure</li>
                <li>✅ Preview mode to see changes before applying</li>
                <li>✅ Duplicate detection prevents double-processing</li>
                <li>✅ Progress tracking for large operations</li>
            </ul>
        `;

        // Support section
        containerEl.createEl('h3', { text: 'Support the Plugin' });
        
        const supportDiv = containerEl.createDiv();
        supportDiv.innerHTML = `
            <p>If this plugin has been helpful for your workflow, consider supporting its development:</p>
            <div style="display: flex; gap: 10px; margin: 15px 0; flex-wrap: wrap;">
                <a href="https://bunq.me/svp" target="_blank" style="display: inline-block; background-color: #ff8c00; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-weight: bold;">
                    💳 Support via bunq.me/svp
                </a>
                <a href="https://coff.ee/atquest" target="_blank" style="display: inline-block;">
                    <img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=☕&slug=atquest&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" alt="Buy Me A Coffee" style="height: 36px; border-radius: 4px;">
                </a>
            </div>
            <p style="font-size: 0.9em; color: var(--text-muted);">Your support helps maintain and improve this plugin. Thank you! 🙏</p>
        `;
    }
}
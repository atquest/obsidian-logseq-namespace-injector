# Obsidian Logseq Namespace Injector

An Obsidian plugin that automatically injects Logseq-style namespace metadata into new notes based on their folder structure.

## Features

- Automatically adds `namespace::` metadata to new markdown files
- Uses the file's folder path as the namespace value
- Only processes files in subdirectories (skips root directory files)
- Prevents duplicate namespace injection
- **Safe processing**: Includes confirmation dialogs, error handling, and rate limiting
- **Non-destructive**: Only adds metadata, never removes or modifies existing content

## How it works

The plugin works in three ways:

1.  **Settings Tab**: You can process existing files via the plugin's settings tab. Go to `Settings > Community Plugins > Logseq Namespace Injector` and click the "Process" button. This is the recommended way to process existing files.

2.  **Manual Processing**: Use the command "Process existing files with namespaces" (accessible via Command Palette `Ctrl/Cmd+P`) to process all existing markdown files in your vault and add namespace metadata to files in subdirectories that don't already have it.

3.  **Automatic for New Files**: When you create a new markdown file in a folder, the plugin will automatically prepend namespace metadata to the file.

For example:
- File at: `Projects/MyProject/notes.md`
- Namespace added: `namespace:: Projects/MyProject`

The final file content will look like:
```
namespace:: Projects/MyProject

[Your original content here]
```

## Usage

1.  **For existing files**: Go to `Settings > Community Plugins > Logseq Namespace Injector` and click the "Process" button. The plugin will show a notice when processing starts and completes, indicating how many files were updated.

2.  **For new files**: Simply create new markdown files in folders - namespaces will be added automatically.

## Installation

1. Copy the plugin files (`main.js`, `manifest.json`, `styles.css`) to your Obsidian vault's plugins directory:
   ```
   .obsidian/plugins/logseq-namespace-injector/
   ```

2. Enable the plugin in Obsidian's Community Plugins settings.

## ⚠️ Friendly Reminder

While this plugin is designed to be safe and non-destructive, it's always a good idea to backup your vault before running any plugin that modifies files. Better safe than sorry! 😊

The plugin only adds namespace metadata to the beginning of files and includes multiple safety checks, but having a backup gives you peace of mind.

## Development

To build the plugin from source:

```bash
npm install
npm run build
```

This will compile the TypeScript source (`main.ts`) to JavaScript (`main.js`).

## Requirements

- Obsidian v0.12.0 or higher

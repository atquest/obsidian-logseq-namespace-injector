# Obsidian Logseq Namespace Injector - Installatie

✅ **Error opgelost!** De plugin gebruikt nu de juiste CommonJS module format voor Obsidian.

## Stap 1: Plugin installeren

1. Kopieer de hele map `logseq-namespace-injector` naar je Obsidian vault plugins directory:
   ```
   [Je Vault]/.obsidian/plugins/logseq-namespace-injector/
   ```

2. Herstart Obsidian of ga naar Settings → Community Plugins → Refresh

3. Schakel de plugin in bij Settings → Community Plugins → "Logseq Namespace Injector"

## Stap 2: Plugin gebruiken

### Voor bestaande bestanden:
- Open Command Palette (`Ctrl/Cmd+P`)
- Zoek naar "Process existing files with namespaces"
- Klik Enter om uit te voeren

### Voor nieuwe bestanden:
- Maak gewoon nieuwe markdown bestanden in mappen aan
- De plugin voegt automatisch namespace metadata toe

## Wat doet de plugin?

De plugin voegt automatisch `namespace:: [mapnaam]` toe aan het begin van je markdown bestanden.

Bijvoorbeeld:
- Bestand in `Projecten/MijnProject/notities.md`
- Krijgt: `namespace:: Projecten/MijnProject`

## Veiligheid

- De plugin is veilig en niet-destructief
- Voegt alleen metadata toe, wijzigt geen bestaande content
- Bevat bevestigingsdialogen en foutafhandeling
- **Tip**: Maak altijd een backup van je vault voordat je plugins installeert! 😊

## Bestanden in deze map:
- `main.js` - De plugin code
- `manifest.json` - Plugin configuratie  
- `styles.css` - Optionele styling (leeg)

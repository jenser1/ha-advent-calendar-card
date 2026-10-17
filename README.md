# 🎄 Adventskalender-Card für Home Assistant

> **Status:** in Entwicklung, noch nicht einsatzbereit.

Eine animierte Custom Lovelace Card, die jeder Person im Haushalt einen eigenen Adventskalender zeigt (1. bis 24. Dezember). Jedes Türchen lässt sich nur an seinem Tag öffnen und kann Text, Bilder/GIFs, Links, Mini-Aufgaben und Smart-Home-Effekte enthalten.

<!-- TODO: Demo-GIF -->

## Funktionen (geplant)

- Eigener Kalender und eigener Öffnungsstatus pro Home-Assistant-Benutzer, geräteübergreifend gespeichert
- Türchen öffnen sich nur am jeweiligen Tag; verpasste Türchen bleiben zu
- Inhalte: Text, Rätsel mit Lösung, Bild/GIF, Gutschein/Aufgabe, Link, YouTube-Video
- Effekte beim ersten Öffnen über beliebige Service-Calls (Licht, Musik, Szene, Script)
- Gemeinsame Türchen für alle (zusätzlich oder statt persönlichem Inhalt)
- Themes `winter`, `kids`, `nerd`, optionaler Schneefall
- Visueller Editor, YAML bleibt möglich

## Installation

### HACS

Folgt mit dem ersten Release.

### Manuell

1. `advent-calendar-card.js` nach `/config/www/` kopieren.
2. **Einstellungen → Dashboards → ⋮ → Ressourcen → Ressource hinzufügen**
   - URL: `/local/advent-calendar-card.js`
   - Typ: **JavaScript-Modul**
3. Browser neu laden und die Karte zum Dashboard hinzufügen.

## Konfiguration

```yaml
type: custom:advent-calendar-card
title: Adventskalender 2026
year: 2026
```

| Option  | Typ    | Standard                   | Beschreibung                                  |
| ------- | ------ | -------------------------- | --------------------------------------------- |
| `title` | Text   | `Adventskalender <Jahr>`   | Überschrift; `""` blendet sie aus             |
| `year`  | Zahl   | aktuelles Jahr             | Jahr, für das der Kalender gilt               |

Weitere Optionen folgen mit den nächsten Versionen.

## Entwicklung

Voraussetzung: Node.js 22.12 oder neuer.

```bash
npm install
npm run build      # erzeugt dist/advent-calendar-card.js
npm run watch      # baut bei jeder Änderung neu (unminifiziert)
npm test           # Vitest
npm run typecheck  # TypeScript-Prüfung inkl. Tests
```

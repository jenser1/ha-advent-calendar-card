# 🎄 Adventskalender-Card für Home Assistant

Eine animierte Custom Lovelace Card, die jeder Person im Haushalt einen eigenen Adventskalender zeigt (1. bis 24. Dezember). Jedes Türchen lässt sich nur an seinem Tag öffnen und kann Text, Bilder/GIFs, Links, Mini-Aufgaben und Smart-Home-Effekte enthalten.

![Adventskalender mit Schneefall: Das heutige Türchen klappt auf und zeigt einen Spruch und einen Gutschein](https://raw.githubusercontent.com/jenser1/ha-advent-calendar-card/main/docs/demo.gif)

## Funktionen

- Eigener Kalender und eigener Öffnungsstatus pro Home-Assistant-Benutzer, geräteübergreifend gespeichert
- Türchen öffnen sich nur am jeweiligen Tag; verpasste Türchen bleiben zu
- Inhalte: Text, Rätsel mit Lösung, Bild/GIF, Gutschein/Aufgabe, Link, YouTube-Video
- Effekte beim ersten Öffnen über beliebige Service-Calls (Licht, Musik, Szene, Script)
- Gemeinsame Türchen für alle (zusätzlich oder statt persönlichem Inhalt)
- Themes `winter`, `kids`, `nerd`, optionaler Schneefall
- Visueller Editor, YAML bleibt möglich
- Inhalte wahlweise in JSON-Dateien statt in der Dashboard-Konfiguration

## Installation

Voraussetzung: Home Assistant 2024.11 oder neuer.

### HACS

Die Karte steht nicht im HACS-Standardverzeichnis, sondern wird als benutzerdefiniertes Repository hinzugefügt:

1. **HACS → ⋮ → Benutzerdefinierte Repositories**
   - Repository: `https://github.com/jenser1/ha-advent-calendar-card`
   - Typ: **Dashboard**
2. In HACS nach **Adventskalender Card** suchen und herunterladen. Die Ressource trägt HACS selbst ein.
3. Browser neu laden.

### Manuell

1. `advent-calendar-card.js` aus dem [neuesten Release](https://github.com/jenser1/ha-advent-calendar-card/releases/latest) nach `/config/www/` kopieren.
2. **Einstellungen → Dashboards → ⋮ → Ressourcen → Ressource hinzufügen**
   - URL: `/local/advent-calendar-card.js`
   - Typ: **JavaScript-Modul**
3. Browser neu laden.

## Schnellstart

1. Dashboard bearbeiten, **Karte hinzufügen** und **Adventskalender** wählen.
2. Im Tab **Personen** für jede Person einen Eintrag anlegen und den HA-Benutzer wählen.
3. Im Tab **Türchen** die Person wählen, ein Türchen anklicken und Bausteine hinzufügen.
4. Ausprobieren, ohne bis Dezember zu warten: Im Tab **Allgemein** ein Testdatum setzen (siehe Testmodus).

Fertige Vorlagen liegen in [`examples/`](examples):

| Datei                                       | Inhalt                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| [`card.yaml`](examples/card.yaml)           | Karte mit zwei Personen, Fallback und Inhalten aus JSON-Dateien          |
| [`jens.json`](examples/jens.json)           | Beispiel-Datei mit Türchen für eine Person                               |
| [`scripts.yaml`](examples/scripts.yaml)     | Beispiel-Scripts für Effekte: Lichtshow, Weihnachtsmusik, Nikolaus       |

## Konfiguration

Die Karte lässt sich im Dashboard-Editor visuell einstellen oder per YAML – beides landet in derselben Konfiguration.

### Visueller Editor

| Tab         | Inhalt                                                                                  |
| ----------- | --------------------------------------------------------------------------------------- |
| Allgemein   | Überschrift, Jahr, Theme, Schnee, Mischen, Text für leere Türchen, Inhaltsquelle (YAML/JSON) mit Pfad, Testdatum (nur Admins) |
| Personen    | Personen anlegen, umbenennen, löschen; HA-Benutzer und Theme pro Person; Fallback an/aus |
| Türchen     | Person (oder Fallback) wählen, Türchen im Raster anklicken, Bausteine hinzufügen, ausfüllen, verschieben, entfernen; „Türchen testen“ und „Effekt auslösen“; Export als JSON-Datei |
| Gemeinsam   | Modus (aus / zusätzlich / statt persönlich), „einmal pro Tag“ mit Text-Helfer, gemeinsame Türchen mit eigenem Modus pro Türchen, Test und Effekt auslösen |

Mit Inhaltsquelle JSON zeigen die Tabs Türchen und Gemeinsam die Dateien nur an (siehe Inhalte aus JSON-Dateien).

Personen und den Fallback mit eingetragenen Türchen löscht der Editor erst nach einer Rückfrage.

Im Tab **Türchen** zeigt das Raster mit kleinen Symbolen, welche Türchen schon gefüllt sind. Effekte werden mit dem Aktions-Editor von Home Assistant eingestellt (wie bei Automationen). **Türchen testen** zeigt den Inhalt so, wie ihn die Person sieht – inklusive gemeinsamer Inhalte, ohne etwas zu speichern; Effekte laufen dabei nur über **Effekt auslösen**. Gerade angelegte, noch leere Bausteine ignoriert die Karte, bis sie ausgefüllt sind.

### YAML

```yaml
type: custom:advent-calendar-card
title: Adventskalender 2026
year: 2026
```

| Option       | Typ                | Standard                 | Beschreibung                                        |
| ------------ | ------------------ | ------------------------ | --------------------------------------------------- |
| `title`      | Text               | `Adventskalender <Jahr>` | Überschrift; `""` blendet sie aus                   |
| `year`       | Zahl               | aktuelles Jahr           | Jahr, für das der Kalender gilt                     |
| `debug_date` | Datum `JJJJ-MM-TT` | –                        | Testdatum, wirkt nur für Admins (siehe Testmodus)   |
| `theme`      | `winter`, `kids`, `nerd` | `winter`           | Standard-Theme für alle Personen (siehe Aussehen)   |
| `snow`       | `true`/`false`     | `false`                  | Schneefall in der Karte                             |
| `shuffle`    | `true`/`false`     | `true`                   | Türchen pro Person fest gemischt                    |
| `users`      | Personen           | –                        | Ein Kalender pro Person (siehe Personen)            |
| `fallback`   | Kalender           | –                        | Für alle ohne eigenen Eintrag in `users`            |
| `empty_text` | Text               | „Heute ist das Türchen leer …“ | Text für Türchen ohne Inhalt                  |
| `shared`     | gemeinsame Türchen | –                        | Türchen für alle (siehe Gemeinsame Türchen)         |
| `content_source` | `yaml`, `json` | `yaml`                   | Türchen aus der Karte oder aus JSON-Dateien (siehe Inhalte aus JSON-Dateien) |
| `json_path`  | Pfad               | `/local/advent/{person}.json` | Wo die JSON-Dateien liegen; `{person}`, `{year}` |

> **Tipp für Januar:** Ohne `year` zeigt die Karte ab dem 1. Januar den Kalender des neuen Jahres. Wer den alten Kalender noch ansehen möchte, setzt `year` auf das Vorjahr.

### Personen

Jede Person bekommt unter `users` einen Eintrag mit frei wählbarem Namen:

```yaml
type: custom:advent-calendar-card
theme: winter
users:
  jens:
    user_id: 8f2c4e…   # optional, feste Zuordnung zum HA-Benutzer
    theme: nerd        # optional, sonst das Theme der Karte
    doors:
      1: { text: "…" }
  anna:                # ohne user_id: Zuordnung über den HA-Benutzernamen „Anna“
    theme: kids
fallback:              # optional, z. B. für ein Gäste-Tablet
  doors:
    1: { text: "…" }
```

So findet die Karte den Kalender des angemeldeten Benutzers:

1. Eintrag, dessen `user_id` passt
2. sonst ein Eintrag ohne `user_id`, dessen Name dem HA-Benutzernamen entspricht (Groß-/Kleinschreibung egal)
3. sonst `fallback`
4. sonst der Hinweis „Für dich gibt’s noch keinen Kalender 🎅“

Ohne `users` sehen alle denselben Kalender. Die `user_id` steht in Home Assistant unter **Einstellungen → Personen → Benutzer** in den Details des Benutzers (erweiterter Modus nötig). Welche Türchen geöffnet sind, wird immer pro HA-Benutzer gespeichert.

### Inhalte der Türchen

Jedes Türchen kann mehrere Bausteine kombinieren. Sie erscheinen in der Reihenfolge, in der sie in der YAML stehen.

```yaml
doors:
  1:
    text: "Wusstest du? Der erste Adventskranz hatte 24 Kerzen."
    image: /local/advent/jens/01.gif
  2:
    text: "Was ist grün und klopft an die Tür?"
    answer: "Ein Klopfsalat 🥬"
  3:
    task: "Gutschein: 1x Frühstück ans Bett 🥐"
  4:
    link:
      title: "Mein Vorrat-Add-on für Home Assistant"
      url: https://github.com/jenser1/ha-vorrat-addon
      kind: github
  5:
    video: https://www.youtube.com/watch?v=XXXXXXXXXXX
```

| Baustein | Inhalt                                                                                     |
| -------- | ------------------------------------------------------------------------------------------ |
| `text`   | Spruch, Rätsel oder Fakt; Zeilenumbrüche (`text: \|`) bleiben erhalten                     |
| `answer` | Lösung zum Rätsel in `text`, erscheint nach Klick auf „Lösung zeigen“                      |
| `image`  | Bild oder GIF, `/local/…` oder `https://…`                                                 |
| `task`   | Mini-Aufgabe oder Gutschein mit „Erledigt“-Haken; der Haken wird pro Benutzer gespeichert  |
| `link`   | Adresse oder `url`, `title`, `description`, `kind` (`web`, `shop`, `video`, `github`)      |
| `video`  | YouTube-Link (auch youtu.be und Shorts) oder eigene Videodatei (`.mp4`, `.webm`, …)        |
| `effect` | Ein oder mehrere Service-Aufrufe beim ersten Öffnen (siehe Effekte)                        |

- **GitHub-Karte:** Bei `kind: github` lädt der Browser Beschreibung und ⭐ über die öffentliche GitHub-API und merkt sie sich einen Tag lang. Klappt das nicht, zeigt die Karte `title` und die Adresse.
- **YouTube** wird über `youtube-nocookie.com` eingebettet. YouTube setzt damit erst Cookies, wenn das Video abgespielt wird.
- Adressen müssen mit `https://`, `http://` oder `/` beginnen. Tippfehler bei Bausteinen (z. B. `txt:`) meldet die Karte als Fehler.
- Ein Türchen ohne Inhalt lässt sich trotzdem öffnen und zeigt `empty_text`.

### Effekte

Beim **ersten** Öffnen eines Türchens kann die Karte beliebige Dienste in Home Assistant aufrufen – Licht, Musik, Szenen oder Scripts. Beim erneuten Ansehen passiert nichts, auch nicht auf einem anderen Gerät.

```yaml
doors:
  4:
    text: "Schau mal ins Wohnzimmer ✨"
    effect:
      action: script.advent_lichtshow
  6:
    text: "Nikolaus! Stiefel checken 🥾"
    effect:                       # mehrere Effekte als Liste
      - action: script.advent_nikolaus
      - action: light.turn_on
        target:
          entity_id: light.flur
        data:
          flash: long
  7:
    effect:                       # ältere Schreibweise mit service: geht auch
      service: script.turn_on
      target:
        entity_id: script.advent_weihnachtsmusik
```

- Scripts bekommen automatisch die Variablen `tag` (1–24) und `person` (Name aus `users`, beim Fallback der HA-Benutzername). Bei `script.turn_on` landen sie unter `variables`. Eigene Angaben in der YAML haben Vorrang.
- Fehlt ein Script oder eine Entität, oder schlägt der Aufruf fehl, zeigt die Karte einen Hinweis. Das Türchen ist trotzdem geöffnet.
- Effekte laufen auch im Testmodus; nach **Testdaten zurücksetzen** lösen sie erneut aus.
- Effekte laufen über `hass.callService` mit den Rechten des angemeldeten Benutzers. Scripts dürfen auch Nicht-Admins starten.
- Beispiel-Scripts für Lichtshow, Weihnachtsmusik und Nikolaus stehen in [`examples/scripts.yaml`](examples/scripts.yaml).
- Tipp: Schreib zu einem Effekt einen `text` dazu – sonst zeigt der Dialog `empty_text`.

### Gemeinsame Türchen

Unter `shared` stehen Türchen, die alle Personen sehen – zusätzlich zum persönlichen Inhalt oder stattdessen:

```yaml
shared:
  mode: merge                         # off | merge | replace (Standard: merge)
  effect_helper: input_text.adventskalender
  doors:
    6:
      mode: replace                   # nur für dieses Türchen
      text: "Nikolaus! Alle zusammen Stiefel checken 🥾"
      effect:
        action: script.advent_nikolaus
    24:
      text: "Frohe Weihnachten! 🎄"
```

| `mode`    | Was alle sehen                                                                  |
| --------- | ------------------------------------------------------------------------------- |
| `off`     | nur ihre persönlichen Türchen                                                   |
| `merge`   | erst „🎄 Für alle“ mit dem gemeinsamen Inhalt, darunter „Für dich“               |
| `replace` | nur den gemeinsamen Inhalt; persönlicher Inhalt und Effekt fallen an dem Tag weg |

`mode` gilt für alle gemeinsamen Türchen und lässt sich pro Türchen überschreiben. Ob ein Türchen geöffnet ist und ob eine Aufgabe erledigt ist, bleibt pro Person getrennt. Gemeinsame Türchen sieht jeder, der einen Kalender hat – für Gäste reicht `fallback: {}`.

**Gemeinsamer Effekt nur einmal pro Tag:** Der Effekt eines gemeinsamen Türchens soll nur bei der ersten Person laufen, nicht bei jeder. Dafür merkt sich die Karte den Tag in einem Text-Helfer:

1. **Einstellungen → Geräte & Dienste → Helfer → Helfer erstellen → Text**, z. B. „Adventskalender“ → `input_text.adventskalender`
2. In der Karte `shared.effect_helper: input_text.adventskalender` eintragen.

Ohne Helfer läuft der gemeinsame Effekt bei jeder Person einmal; Admins sehen dazu einen Hinweis in der Karte. Mit `shared.effect_once: false` ist das gewollt und der Hinweis verschwindet. Öffnen zwei Personen im selben Moment, kann der Effekt trotzdem doppelt laufen. Im Testmodus schreibt die Karte `test:…` in den Helfer, damit Tests den echten Tag nicht blockieren; **Testdaten zurücksetzen** löscht diesen Test-Merker.

### Inhalte aus JSON-Dateien

Mit `content_source: json` stehen die Türchen nicht in der Dashboard-Konfiguration, sondern in Dateien auf dem Server. Dann sieht niemand die Inhalte, nur weil er die Karten-Konfiguration öffnet, und lange Kalender machen das Dashboard nicht unübersichtlich.

```yaml
type: custom:advent-calendar-card
content_source: json
users:
  jens:
    theme: nerd
  anna: {}
shared:
  effect_helper: input_text.adventskalender
```

| Datei (Standardpfad)              | Liegt auf dem Server unter               | Inhalt                                 |
| --------------------------------- | ---------------------------------------- | -------------------------------------- |
| `/local/advent/jens.json`         | `/config/www/advent/jens.json`           | Türchen der Person `jens`              |
| `/local/advent/fallback.json`     | `/config/www/advent/fallback.json`       | Fallback bzw. Kalender ohne `users`    |
| `/local/advent/shared.json`       | `/config/www/advent/shared.json`         | gemeinsame Türchen (optional)          |

Eine Datei enthält die Türchen genau wie in der YAML, nur als JSON – siehe [`examples/jens.json`](examples/jens.json) und [`examples/card.yaml`](examples/card.yaml):

```json
{
  "doors": {
    "1": { "text": "Wusstest du? Der erste Adventskranz hatte 24 Kerzen." },
    "2": { "task": "Gutschein: 1x Frühstück ans Bett 🥐" },
    "4": {
      "text": "Schau mal ins Wohnzimmer ✨",
      "effect": { "action": "script.turn_on", "target": { "entity_id": "script.advent_lichtshow" } }
    }
  }
}
```

- Der Dateiname ist der Name der Person aus `users` – genau so geschrieben, Groß-/Kleinschreibung zählt. Die Namen `fallback` und `shared` sind deshalb im JSON-Modus für Personen tabu.
- In `shared.json` darf ein Türchen wie in der YAML einen eigenen `mode` haben. Personen, Themes, `fallback` und die Einstellungen unter `shared` (Modus, Helfer) bleiben in der Karte. Türchen in der YAML ignoriert die Karte im JSON-Modus.
- Mit `json_path` lässt sich der Pfad ändern: `{person}` wird durch den Namen ersetzt, `{year}` durch das Jahr, z. B. `/local/advent/{year}/{person}.json`.
- Fehlt die Datei einer Person, zeigt die Karte „Dein Kalender ist noch nicht fertig 🎅“ statt der Türchen (Admins sehen dazu den Pfad). Fehlt `shared.json`, gibt es einfach keine gemeinsamen Türchen. Fehler in einer Datei zeigt die Karte mit Dateiname und Stelle an; Türchen lassen sich dann erst wieder öffnen, wenn alles stimmt.
- Die Karte lädt die Dateien beim Öffnen der Ansicht frisch – geänderte Inhalte sind also ohne Neustart da. Fehlt etwas, versucht sie es jede Minute erneut.
- Dateien ablegen geht z. B. mit dem Add-on **File editor** oder **Samba share**.
- Der visuelle Editor kann keine Dateien schreiben: Im JSON-Modus zeigen die Tabs **Türchen** und **Gemeinsam** Pfad, Ladestatus und den Inhalt jedes Türchens, und **Türchen testen** und **Effekt auslösen** arbeiten mit dem Datei-Inhalt. Stehen noch Türchen in der YAML, macht **…json herunterladen** daraus eine fertige Datei (oder **JSON anzeigen** zum Kopieren), danach lassen sie sich mit **Aus der YAML entfernen** löschen. Den Export gibt es auch im YAML-Modus – praktisch, um einen im Editor gebauten Kalender in Dateien umzuziehen.

> **Spicken:** `/local/`-Dateien kann jeder abrufen, der die Adresse kennt – auch ohne Anmeldung. Für die Familie reicht das; wirklich geheim ist der Inhalt so nicht.

### Aussehen

| Theme    | Look                                                                      |
| -------- | ------------------------------------------------------------------------- |
| `winter` | Nachthimmel in Blau mit goldenen Zahlen; hell: Eisblau mit Gold            |
| `kids`   | Jedes Türchen in einer anderen Farbe, große runde Zahlen                   |
| `nerd`   | Terminal-Look in Grün auf Schwarz, Überschrift mit blinkendem Cursor       |

- `winter` und `kids` folgen dem hellen bzw. dunklen Design von Home Assistant, `nerd` ist immer dunkel. Der Dialog nutzt die normalen HA-Farben.
- Das Theme gilt für die Karte und lässt sich pro Person überschreiben (`users.<name>.theme`).
- Das heutige Türchen pulsiert, gesperrte wackeln beim Antippen, beim Öffnen klappt das Türchen auf. Geöffnete Türchen bleiben aufgeklappt.
- `shuffle` (Standard an) mischt die Türchen pro Person und Jahr – immer gleich, auf allen Geräten.
- `snow: true` lässt es in der Karte schneien. Der Schnee pausiert, wenn die Karte nicht zu sehen ist.
- Ist am Gerät „Bewegung reduzieren“ eingestellt, gibt es weder Animationen noch Schnee.

### Wann sich ein Türchen öffnen lässt

„Heute“ ist das Datum in der Zeitzone von Home Assistant (Einstellungen → System → Allgemein), nicht die des Geräts.

| Status    | Wann                                    | Anzeige                         |
| --------- | --------------------------------------- | ------------------------------- |
| gesperrt  | Tag liegt in der Zukunft                | 🔒, beim Antippen „Noch X Tage!“ |
| öffenbar  | heute ist der Tag                       | leuchtet, „Heute!“              |
| offen     | wurde geöffnet                          | aufgeklappt mit ✔, Inhalt jederzeit wieder ansehbar |
| verpasst  | Tag ist vorbei, nie geöffnet            | grau, „Verpasst 😢“             |

Ab dem 25. Dezember zeigt die Karte, wie viele Türchen geöffnet wurden.

### Speicherung

Welche Türchen geöffnet sind, speichert Home Assistant pro Benutzer auf dem Server (Schlüssel `advent_calendar_<Jahr>`). Der Stand gilt damit auf allen Geräten – Handy, Tablet, PC – und bleibt nach dem Neuladen erhalten. Ein eigenes Backend oder eine Integration ist dafür nicht nötig.

### Testmodus

Mit `debug_date` lässt sich ein beliebiges Datum vorgeben, z. B. um den Kalender schon im November auszuprobieren:

```yaml
type: custom:advent-calendar-card
debug_date: "2026-12-05"
```

Das Datum gilt nur für Admins; alle anderen sehen weiterhin das echte Datum. Solange der Testmodus aktiv ist, zeigt die Karte einen Hinweis an.

Im Testmodus geöffnete Türchen werden getrennt gespeichert (`advent_calendar_<Jahr>_test`), der echte Kalender bleibt unberührt. Mit **Testdaten zurücksetzen** im Hinweis fängt der Test wieder von vorn an.

## Entwicklung

Voraussetzung: Node.js 22.12 oder neuer.

```bash
npm install
npm run build       # Community-Edition → dist/advent-calendar-card.js
npm run build:full  # volle Edition mit eigenen Kalendern
npm run watch       # baut bei jeder Änderung neu (unminifiziert)
npm test            # Vitest, deckt beide Editionen ab
npm run typecheck   # TypeScript-Prüfung inkl. Tests
```

### Editionen

- **Community-Edition 2026** (`npm run build`): Die Türchen stecken fest in der Karte, alle sehen denselben Kalender. Die Inhalte kommen beim Bauen aus `content/2026.json`. Die Datei liegt nicht im Repository; fehlt sie, baut die Karte mit dem Platzhalter `content/beispiel.json` und warnt. `users`, `fallback`, `shared`, `content_source`, `json_path` und `year` führen zu einer Fehlermeldung, der Editor zeigt nur „Allgemein“. Effekte sind in den Inhalten verboten: Der Build bricht ab, und die Karte würde sie zusätzlich ignorieren.
- **Volle Edition** (`npm run build:full`): eigene Kalender pro Person, wie in dieser Anleitung beschrieben – geplant für 2027.

Eine andere Inhaltsdatei lässt sich zum Testen mit `ADVENT_CONTENT` angeben, z. B. `npx rollup -c --environment ADVENT_CONTENT:content/test.json`.

### Release

`dist/` liegt nicht im Repository. Ein Tag `vX.Y.Z` startet die GitHub Action: Sie prüft, ob der Tag zur Version in `package.json` passt, lässt Typecheck und Tests laufen, baut die Karte, hängt `advent-calendar-card.js` an ein neues Release und prüft das Repository mit der HACS-Validierung.

```bash
npm version 0.13.0
```

```bash
git push --follow-tags
```

## Lizenz

[MIT](LICENSE)

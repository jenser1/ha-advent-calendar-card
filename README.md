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

| Option       | Typ                | Standard                 | Beschreibung                                        |
| ------------ | ------------------ | ------------------------ | --------------------------------------------------- |
| `title`      | Text               | `Adventskalender <Jahr>` | Überschrift; `""` blendet sie aus                   |
| `year`       | Zahl               | aktuelles Jahr           | Jahr, für das der Kalender gilt                     |
| `debug_date` | Datum `JJJJ-MM-TT` | –                        | Testdatum, wirkt nur für Admins (siehe Testmodus)   |
| `theme`      | `winter`, `kids`, `nerd` | `winter`           | Standard-Theme für alle Personen                    |
| `users`      | Personen           | –                        | Ein Kalender pro Person (siehe Personen)            |
| `fallback`   | Kalender           | –                        | Für alle ohne eigenen Eintrag in `users`            |
| `empty_text` | Text               | „Heute ist das Türchen leer …“ | Text für Türchen ohne Inhalt                  |

Weitere Optionen folgen mit den nächsten Versionen.

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
| `effect` | Service-Aufruf beim ersten Öffnen (folgt)                                                  |

- **GitHub-Karte:** Bei `kind: github` lädt der Browser Beschreibung und ⭐ über die öffentliche GitHub-API und merkt sie sich einen Tag lang. Klappt das nicht, zeigt die Karte `title` und die Adresse.
- **YouTube** wird über `youtube-nocookie.com` eingebettet. YouTube setzt damit erst Cookies, wenn das Video abgespielt wird.
- Adressen müssen mit `https://`, `http://` oder `/` beginnen. Tippfehler bei Bausteinen (z. B. `txt:`) meldet die Karte als Fehler.
- Ein Türchen ohne Inhalt lässt sich trotzdem öffnen und zeigt `empty_text`.

### Wann sich ein Türchen öffnen lässt

„Heute“ ist das Datum in der Zeitzone von Home Assistant (Einstellungen → System → Allgemein), nicht die des Geräts.

| Status    | Wann                                    | Anzeige                         |
| --------- | --------------------------------------- | ------------------------------- |
| gesperrt  | Tag liegt in der Zukunft                | 🔒, beim Antippen „Noch X Tage!“ |
| öffenbar  | heute ist der Tag                       | leuchtet, „Heute!“              |
| offen     | wurde geöffnet                          | ✔, Inhalt jederzeit wieder ansehbar |
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
npm run build      # erzeugt dist/advent-calendar-card.js
npm run watch      # baut bei jeder Änderung neu (unminifiziert)
npm test           # Vitest
npm run typecheck  # TypeScript-Prüfung inkl. Tests
```

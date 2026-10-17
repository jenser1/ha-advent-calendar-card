# 🎄 Adventskalender-Card für Home Assistant – Umsetzungsplan

Spaßprojekt: eine animierte **Custom Lovelace Card**, die pro HA-Benutzer einen eigenen Adventskalender (1.–24. Dezember) zeigt. Jedes Türchen lässt sich **nur genau an seinem Tag** öffnen und kann Text, Bilder/GIFs, Links, Mini-Aufgaben und Smart-Home-Effekte enthalten.

Dieser Plan ist als Arbeitsauftrag für Claude Code gedacht.

---

## 1. Ziele & Rahmen

| Punkt | Entscheidung |
|---|---|
| Form | Custom Lovelace Card (kein Add-on, keine Integration) |
| Tech | TypeScript + Lit, Build mit Rollup oder Vite → eine `advent-calendar-card.js` |
| Verteilung | GitHub-Repo `jenser1/ha-advent-calendar-card`, HACS-kompatibel (Kategorie „Dashboard“) |
| Personen | Mehrere HA-Benutzer, jeder mit eigenem Inhalt und eigenem Öffnungsstatus |
| Öffnen | Nur am jeweiligen Tag. Zukünftige Türchen gesperrt, verpasste bleiben zu („verpasst“-Optik) |
| UI-Sprache | Deutsch |

---

## 2. Architektur

```
Lovelace Dashboard
 └─ advent-calendar-card (Lit)
     ├─ liest Inhalt aus Card-YAML  ODER  aus /local/advent/<user>.json
     ├─ erkennt Person über hass.user (id / name)
     ├─ speichert „geöffnet“-Status pro Benutzer serverseitig
     │    → WebSocket: frontend/get_user_data / frontend/set_user_data
     │      (Key: "advent_calendar_<jahr>")
     └─ löst Effekte aus über hass.callService(...)
          → z. B. script.advent_effekt mit Variablen {tag, person}
```

Warum so:
- **Kein Backend nötig** – `frontend/set_user_data` speichert pro HA-User auf dem Server, funktioniert also geräteübergreifend (Handy, Tablet, PC).
- **Effekte über Scripts** statt `fire_event` (fire_event braucht Admin-Rechte, Scripts dürfen alle User aufrufen).
- Die Datumsprüfung passiert im Frontend – für ein Spaßprojekt völlig okay.

---

## 3. Türchen-Inhalte (Datenmodell)

Jedes Türchen kann **mehrere Bausteine** kombinieren:

```yaml
type: custom:advent-calendar-card
title: Adventskalender 2026
year: 2026
content_source: yaml          # yaml | json  (json → /local/advent/<user>.json)
theme: winter                  # winter | kids | nerd
snow: true
users:
  jens:                        # Match über hass.user.name (lowercase) oder user_id
    doors:
      1:
        text: "Wusstest du? Der erste Adventskranz hatte 24 Kerzen."
        image: /local/advent/jens/01.gif
      2:
        task: "Gutschein: 1x Frühstück ans Bett 🥐"
      3:
        link:
          title: "Mein Vorrat-Add-on für Home Assistant"
          url: https://github.com/jenser1/ha-vorrat-addon
          kind: github          # github | video | shop | web
      4:
        effect:
          service: script.turn_on
          target: { entity_id: script.advent_lichtshow }
        text: "Schau mal ins Wohnzimmer ✨"
      5:
        video: https://www.youtube.com/watch?v=XXXX   # wird eingebettet
  anna:
    doors: { ... }
```

### Gemeinsame Türchen (optional, einstellbar)

```yaml
shared:
  mode: merge        # off | merge | replace
  doors:
    6:
      text: "Nikolaus! Alle zusammen Stiefel checken 🥾"
      effect:
        service: script.turn_on
        target: { entity_id: script.advent_nikolaus }
```

- `off` – nur persönliche Türchen
- `merge` – gemeinsamer Inhalt wird **zusätzlich** zum persönlichen angezeigt
- `replace` – an diesem Tag sehen alle denselben Inhalt (persönlicher wird ignoriert)
- Der Öffnungsstatus bleibt trotzdem pro Person getrennt.
- Ein gemeinsamer Effekt wird nur **einmal pro Tag** ausgelöst (wer zuerst öffnet). Merker dafür: `input_datetime`/`input_text`-Helper, den die Karte setzt, oder einfach Option `shared_effect_once: false` zum Abschalten.

### Personen (einstellbar)

- Personen werden in der Karte angelegt, jeweils mit **HA-User-Auswahl** (Dropdown aller User, Match über `user_id`).
- Optional `fallback`-Kalender für User ohne eigenen Eintrag (z. B. Gäste-Tablet), sonst Hinweis „Für dich gibt’s noch keinen Kalender 🎅“.
- Theme pro Person einstellbar (`kids`, `winter`, `nerd`), Standard aus der Karte.

### Effekte (einstellbar)

- Beliebiger Service-Call pro Türchen; im Editor per **Entity-/Service-Picker** (Lichter, `media_player`, Szenen, Scripts).
- Mitgelieferte Beispiel-Scripts in `examples/scripts.yaml` (Lichtshow, Weihnachtsmusik, Nikolaus), werden aber nicht vorausgesetzt.

Bausteine:
- `text` – Spruch, Rätsel, Fakt (optional `answer` → „Lösung zeigen“-Button für Rätsel)
- `image` – Bild/GIF (`/local/...` oder URL)
- `task` – Mini-Aufgabe / Gutschein, als „Gutschein-Karte“ gestaltet, mit „Erledigt ✔“-Haken (wird mitgespeichert)
- `link` – Video, Shop-Angebot oder GitHub-Projekt; `kind: github` zeigt Repo-Karte (Name, Beschreibung, ⭐ – optional über GitHub-API geladen)
- `video` – YouTube-Embed
- `effect` – beliebiger HA-Service-Call (Licht, Musik, Szene, Script)

---

## 4. Öffnungslogik

```
heute = lokales Datum (HA-Zeitzone aus hass.config.time_zone)

Türchen n ist …
  gesperrt   wenn heute < n.Dezember   → 🔒 wackelt beim Klick, Toast „Noch X Tage!“
  öffenbar   wenn heute == n.Dezember und noch nicht geöffnet
  offen      wenn geöffnet gespeichert  → Inhalt jederzeit wieder anschaubar
  verpasst   wenn heute > n.Dezember und nie geöffnet → grau, „Verpasst 😢“
```

- Effekt (`effect`) wird **nur beim ersten Öffnen** ausgelöst, nicht beim erneuten Anschauen.
- **Testmodus** für Admins: Card-Option `debug_date: 2026-12-05` (wird nur beachtet, wenn `hass.user.is_admin`), damit man im Oktober/November testen kann.
- Nach dem 24.12.: alle geöffneten Türchen bleiben ansehbar, kleine Statistik („18/24 geöffnet“).

---

## 5. UI / Optik

- 24 Türchen in **zufälliger, aber pro User fester Reihenfolge** (Seed = user_id + Jahr), Grid responsive (6×4 Desktop, 4×6 Handy).
- Öffnen-Animation: Türchen klappt in 3D auf (CSS `transform: rotateY`), danach Modal mit Inhalt.
- Optionaler Schneefall (Canvas, leichtgewichtig, respektiert `prefers-reduced-motion`).
- Heutiges Türchen leuchtet/pulsiert.
- Themes: `winter` (dunkelblau/gold), `kids` (bunt, große Zahlen), `nerd` (Terminal-Look).
- Dark/Light über HA-Theme-Variablen.

---

## 5b. Visueller Editor (alles einstellbar ohne YAML)

Die Karte bringt einen eigenen Editor mit (`getConfigElement()`):

- **Tab „Allgemein“** – Titel, Jahr, Theme, Schnee, Inhaltsquelle (YAML/JSON), Testdatum (nur Admin)
- **Tab „Personen“** – Person hinzufügen/entfernen, HA-User wählen (`ha-selector` user), Theme pro Person, Fallback-Kalender an/aus
- **Tab „Türchen“** – Person wählen → Raster 1–24 → Türchen anklicken → Bausteine hinzufügen (Text, Rätsel+Lösung, Bild, Aufgabe/Gutschein, Link, Video, Effekt)
- **Tab „Gemeinsam“** – Modus off/merge/replace, gemeinsame Türchen pflegen
- Effekt-Baustein nutzt HA-Selectors (`action`-Selector bzw. Entity-Picker), damit Lichter/Lautsprecher/Scripts direkt auswählbar sind
- Vorschau-Button „Türchen X testen“ (öffnet Dialog ohne Status zu speichern, Effekt optional auslösen)

Alles, was der Editor setzt, landet in der normalen Card-Config – YAML bleibt weiter möglich.

---

## 6. Repo-Struktur

```
ha-advent-calendar-card/
├─ src/
│  ├─ advent-calendar-card.ts    # Haupt-Element
│  ├─ door.ts                    # einzelnes Türchen
│  ├─ door-dialog.ts             # Modal mit Inhalt
│  ├─ editor/                    # visueller Editor (Tabs: Allgemein, Personen, Türchen, Gemeinsam)
│  ├─ blocks/                    # text, image, task, link, video, effect
│  ├─ storage.ts                 # frontend/get|set_user_data
│  ├─ date-logic.ts              # Datums-/Statuslogik (gut testbar)
│  ├─ snow.ts
│  ├─ themes.ts
│  └─ types.ts
├─ examples/
│  ├─ card.yaml
│  ├─ jens.json
│  └─ scripts.yaml               # Beispiel-Script advent_lichtshow
├─ tests/date-logic.test.ts      # Vitest
├─ hacs.json
├─ package.json
├─ rollup.config.mjs
└─ README.md (Deutsch, mit GIF)
```

---

## 7. Meilensteine

1. **Grundgerüst** – Lit-Card, Build, lädt in HA als Resource, zeigt 24 statische Türchen.
2. **Datumslogik + Tests** – Status gesperrt/öffenbar/offen/verpasst, `debug_date`.
3. **Speicherung** – `frontend/set_user_data` pro User, Status überlebt Reload & Gerätewechsel.
4. **Mehrere Personen** – User-Matching über `user_id`, Fallback-Kalender, Theme pro Person.
5. **Inhaltsbausteine** – text, image, task (+ Erledigt), link (+ GitHub-Karte), video.
6. **Effekte** – Service-Call beim ersten Öffnen, Fehlerbehandlung (Toast, falls Script fehlt).
7. **Gemeinsame Türchen** – Modi off/merge/replace, gemeinsamer Effekt einmal pro Tag.
8. **Optik** – Animationen, Schnee, Themes, Mischreihenfolge.
9. **Visueller Editor** – alle Einstellungen per UI (siehe 5b).
10. **JSON-Inhaltsquelle** – `/local/advent/<user>.json`, damit Inhalte nicht in der Dashboard-YAML stehen (und andere User nicht spicken können, wenn man ihnen den YAML-Editor nicht zeigt).
11. **HACS & README** – `hacs.json`, Release-Workflow (GitHub Action baut `dist/`), Doku + Beispiel.

---

## 8. Hinweise / bekannte Grenzen

- **Spicken:** Wer Admin ist oder die JSON-Datei direkt aufruft, kann Inhalte sehen. Für Familie egal – fürs „richtige“ Geheimhalten bräuchte man eine Integration (bewusst nicht Teil dieses Plans).
- Nicht-Admins brauchen Zugriff aufs Dashboard; Scripts können sie aufrufen.
- `frontend/set_user_data` speichert pro HA-Benutzer, nicht pro Gerät – gewünscht.

---

## 9. Entscheidungen

- Repo-Name: `jenser1/ha-advent-calendar-card` ✔
- Personen, Themes pro Person, gemeinsame Türchen und Effekte sind **frei einstellbar** (Editor + YAML), nichts davon ist fest verdrahtet.

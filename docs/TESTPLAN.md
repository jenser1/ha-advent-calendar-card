# Testplan vor dem Release (22.–24.11.2026)

Getestet wird die fertige Community-Edition mit den echten Inhalten auf dem eigenen Home Assistant. Zum Abhaken: `[ ]` → `[x]`.

## Vorbereitung

- [ ] Karte mit echten Inhalten bauen: `npm run build` (oder `ADVENT_REQUIRE_CONTENT=1`, dann bricht der Build ohne Inhalte ab)
- [ ] `dist/advent-calendar-card.js` nach `/config/www/` kopieren
- [ ] Ressource auf `/local/advent-calendar-card.js?v=<neue Version>` stellen (Einstellungen → Dashboards → Ressourcen)
- [ ] Alte Karten-Config bereinigen: `users`, `fallback`, `shared`, `year`, `content_source`, `json_path` entfernen
- [ ] Zweiten Benutzer **ohne** Admin-Rechte anlegen (oder einen vorhandenen nehmen)

## Karte und Editor

- [ ] Karte erscheint im Kartendialog als „Adventskalender“
- [ ] Editor zeigt nur „Allgemein“ mit dem Hinweis zur Community-Edition
- [ ] Überschrift ändern und ausblenden
- [ ] Alle drei Looks (`winter`, `kids`, `nerd`) im hellen und dunklen HA-Design
- [ ] Schneefall an/aus, „Türchen mischen“ an/aus
- [ ] Alte Config mit `users` zeigt eine verständliche Fehlermeldung

## Datum und Öffnen

Mit `debug_date: "2026-12-05"` als Admin:

- [ ] Türchen 1–4: grau „Verpasst 😢“, nicht zu öffnen
- [ ] Türchen 5: leuchtet „Heute!“, lässt sich öffnen, klappt auf, zeigt ✔
- [ ] Türchen 6–24: 🔒, beim Antippen „Noch X Tage!“
- [ ] Hinweis „Testmodus“ ist zu sehen, **Testdaten zurücksetzen** macht Türchen 5 wieder zu
- [ ] Nicht-Admin sieht das echte Datum (vor dem 1.12.: alles gesperrt), keinen Testhinweis

Mit `debug_date: "2026-12-24"`:

- [ ] Alle 24 Türchen nacheinander öffnen: Text, Video und Link stimmen, kein Tippfehler
- [ ] Jedes Video spielt (YouTube-Player im Dialog, Adresse `youtube-nocookie.com`)
- [ ] Kanal-Links und GitHub-Karten (Türchen 6 und 23) öffnen die richtige Seite, GitHub zeigt Beschreibung und ⭐
- [ ] Noch leere Türchen zeigen den Text für leere Türchen bzw. `empty_text`
- [ ] Mit `debug_date: "2026-12-25"`: Karte zeigt, wie viele Türchen geöffnet wurden

## Geräte

- [ ] PC-Browser (Chrome/Edge, Firefox)
- [ ] Handy-Browser
- [ ] Companion-App Android/iOS (nach „Frontend-Cache zurücksetzen“)
- [ ] Geöffnetes Türchen ist auf dem zweiten Gerät auch offen (gleicher Benutzer)
- [ ] Anderer Benutzer hat seinen eigenen Stand
- [ ] Mit „Bewegung reduzieren“ am Gerät: keine Animationen, kein Schnee

## Licht und Musik

- [ ] Licht „Kurz blinken“: Lampe blinkt beim ersten Öffnen, nicht beim erneuten Ansehen
- [ ] Licht „Lichteffekt starten“: Liste zeigt die Effekte der Lampe, Effekt startet
- [ ] Musik über Music Assistant mit Titelnamen und Lautstärke
- [ ] Musik über normalen Mediaplayer mit voller Datei-Adresse (`http://…/local/…mp3`)
- [ ] „Aus Medien auswählen“: Datei aus „Lokale Medien“ wählen, Player und Titel werden eingetragen, Lied spielt
- [ ] „Aus Medien auswählen“ mit einem Music-Assistant-Player (Playlist oder Radio)
- [ ] Musik nur an bestimmten Türchen: an anderen Türchen keine Musik, Licht trotzdem
- [ ] „Erweitert: eigene Aktionen“ mit `script.advent_tuerchen` aus `examples/scripts.yaml`: bekommt `tag` und `person`
- [ ] Nicht-Admin öffnet ein Türchen: Effekte laufen auch bei ihm
- [ ] Fehlende Entität (z. B. Lampe umbenannt): Türchen öffnet trotzdem, kurzer Hinweis „Effekt nicht möglich …“

## Zum Schluss

- [ ] Browser-Konsole (F12) ohne rote Fehler der Karte
- [ ] JS-Datei durchsuchen: Texte der Türchen stehen nicht im Klartext darin
- [ ] Gefundene Fehler als Issue oder Notiz festhalten, beheben, neu bauen, nochmal kurz testen

# edufeed-examples

Live-Demos und Integration Guides für Edufeeds **Educational Data Pool** —
Nostr-basierte Bildungsmetadaten (AMB, `kind 30142`) und Kalender-Events
(NIP-52). Veröffentlicht unter
<https://edufeed-org.github.io/edufeed-examples/>.

| Datei | Inhalt |
|---|---|
| `index.html` | Landing Page, verlinkt alle Guides und Demos |
| `amb-datapool.html` | Educational Data Pool — Integration Guide (**Schreib-Seite**, kind 30142 / NIP-AMB) |
| `amb-demo.html` | AMB Resources — Live-Demo (**Lese-Seite** derselben Daten) |
| `calendar-integration.md` | Educational Calendar Events — Integration Guide (**Schreib-Seite**, NIP-52 + Edufeed-Erweiterung) — *Entwurf* |
| `calendar-demo.html` | Calendar Events — Live-Demo (**Lese-Seite**) |
| `ekw-metadata.md` | EKW-Extension-Spezifikation (`ext:ekw:*`) |

## Sprachregelung (Terminologie)

Die Guides beschreiben dieselben Daten aus zwei Blickwinkeln. Damit das nicht
wie zwei verschiedene Systeme wirkt, gilt durchgängig:

- **„kind 30142" und „NIP-AMB" meinen dasselbe.** NIP-AMB ist die
  Spezifikation, `30142` die Event-Kind-Nummer, die sie definiert. Formulierung
  in den Guides: *„AMB resources (kind 30142, specified by NIP-AMB)"*.
- **„Educational Data Pool" und „AMB Resources" sind zwei Sichten auf
  denselben Datenbestand.** Der Integration Guide behandelt die
  **Schreib-Seite** (publizieren, abfragen, aktualisieren), die Live-Demo die
  **Lese-Seite** (lesen, rendern). Jede Seite benennt ihr Gegenstück und
  verlinkt es.
- Dasselbe Muster gilt für Kalender-Events: `calendar-integration.md`
  (schreiben) ↔ `calendar-demo.html` (lesen).

## Arbeitsweise

So sind die Terminologie-Vereinheitlichung und der Kalender-Guide-Entwurf
entstanden — und so sollten künftige Änderungen an den Guides ablaufen:

1. **Bestandsaufnahme.** Alle Seiten vollständig lesen und die tatsächliche
   Begriffsverwendung erheben (`grep` über alle Dateien nach „kind 30142",
   „NIP-AMB", „Data Pool", „AMB Resources" usw.). Erst dann entscheiden,
   welcher Begriff kanonisch ist und wie die Beziehung formuliert wird.
2. **Abgleich mit Live-Daten.** Behauptungen über das Datenformat gegen echte
   Events vom Relay prüfen (Samples während der Entwicklung vom Dev-Relay
   `dev.amb-relay.edufeed.org` holen, z. B. mit `nak req -k 31922 -k 31923`).
   Für den Kalender-Guide ergab das: Die Events auf dem Relay sind heute
   reines NIP-52 ohne Bildungs-Attribute — der Guide dokumentiert den Status
   quo und spezifiziert die Erweiterung als Entwurf, nicht als Ist-Zustand.
3. **Quellen trennen: vereinbart vs. vorgeschlagen.** Der Kalender-Guide
   basiert auf [Issue #13](https://github.com/edufeed-org/edufeed-app/issues/13).
   Was dort im Call vereinbart wurde (Semantik von Anmeldung, price/currency,
   Modus, Rollen, Bildungsstufe), steht im Guide als „agreed"; was dieser
   Entwurf ergänzt (konkrete Tag-Namen, die Regel „einfache Attribute im
   NIP-52-Stil, Vokabular-Attribute als NIP-AMB-Konzept-Tripel"), ist
   ausdrücklich als „proposed / draft" markiert. Offene Punkte aus der
   Issue-Diskussion (differenzierte Preise, Relay-Indexierung,
   Bildungsbereiche/Zielgruppen) stehen gesammelt im Abschnitt
   „Status and open questions".
4. **Bestehende Konventionen wiederverwenden statt neu erfinden.** Die
   Bildungsstufe nutzt das KIM-Vokabular
   (`https://w3id.org/kim/educationalLevel/`) und exakt die
   Tag-Flattening-Konvention von NIP-AMB (`educationalLevel:id` /
   `:prefLabel:de` / `:type`), damit vorhandenes Tooling
   (`amb-nostr-converter`, EKW-Reader) die Werte ohne Sonderbehandlung liest.
   Preis-Tags folgen der etablierten NIP-99-Form.
5. **Entwürfe als Markdown, veröffentlichte Guides als HTML.** Neue Guides
   entstehen zuerst als Markdown (leicht zu reviewen und zu diskutieren, vgl.
   `ekw-metadata.md`). Nach Review und Klärung der offenen Punkte wird daraus
   eine HTML-Seite im Stil von `amb-datapool.html` — idealerweise mit
   Live-Widget gegen das Relay.
6. **Querverlinkung pflegen.** Jede Änderung prüft: Sind Schreib- und
   Lese-Seite wechselseitig verlinkt? Stimmen die Karten auf `index.html`
   (Titel, Pill, Beschreibung) mit den Seiten überein?

## Lokal ansehen

Kein Build-Schritt. `index.html` direkt im Browser öffnen; die Live-Demos
öffnen selbst WebSocket-Verbindungen zu den Relays.

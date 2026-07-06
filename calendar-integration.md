# Educational Calendar Events — integration guide

> **Status: DRAFT.** This guide specifies the Edufeed extension of NIP-52
> ("NIP-52-Edufeed") based on the agreements in
> [edufeed-app issue #13](https://github.com/edufeed-org/edufeed-app/issues/13).
> Attribute semantics follow the issue agreements; the tag names
> (`registrationRequired`, `price`, `eventAttendanceMode`, `educationalLevel:*`)
> are fixed. Nothing here is implemented on the relays yet — see
> [Status](#6-status-and-open-questions).

This guide covers the **write side** of educational calendar events: how to
publish [NIP-52](https://github.com/nostr-protocol/nips/blob/master/52.md)
calendar events enriched with educational metadata into the Edufeed data pool.
The **read side** — fetching and rendering — is shown in the
[Educational Calendar Events live demo](calendar-demo.html). Both describe the
same events.

It is the calendar counterpart of the
[Educational Data Pool integration guide](amb-datapool.html), which covers AMB
resources (kind `30142` / NIP-AMB). Calendar events use the standard Nostr
calendar kinds and stay fully readable for any NIP-52 client; the educational
attributes are **additive**.

---

## 1. Base format: NIP-52

Educational events are ordinary NIP-52 events. Two kinds carry the events
themselves (both are *addressable*, identified by `kind:pubkey:d-tag`, and
updated by re-publishing the full event — same mechanics as described in
[Section 4 of the data-pool guide](amb-datapool.html)):

| Kind | Meaning | `start` / `end` format |
|------|---------|------------------------|
| `31922` | date-based (full-day / multi-day) | `YYYY-MM-DD` (`end` exclusive) |
| `31923` | time-based | unix timestamp seconds, plus optional `start_tzid` / `end_tzid` |

Standard NIP-52 tags used on Edufeed events today (as found live on the relay):

```
["d", "<stable event id, often the source URL>"]
["title", "<event title>"]
["start", "..."] ["end", "..."] ["start_tzid", "Europe/Berlin"]
["summary", "<short description>"]          // long form goes into content
["location", "<place or meeting URL>"]
["image", "<preview image URL>"]
["r", "<link to the event page>"]           // repeated
["t", "<hashtag>"]                          // repeated
```

Everything in the next section comes **on top of** this.

---

## 2. The Edufeed extension ("NIP-52-Edufeed")

NIP-52 itself has **no** fields for registration, cost, attendance mode, or
educational classification. The Edufeed working group agreed on the following
attributes (issue #13, calls of 2025-03-25 and 2025-05-22). Two tag styles are
used, on purpose:

- **Plain event attributes** (registration, price, mode) are flat tags with
  schema.org-aligned camelCase names where a schema.org counterpart exists
  (`eventAttendanceMode`, `registrationRequired`); `price` follows the
  NIP-15 / NIP-99 shape.
- **Vocabulary attributes** (educational level, later: Bildungsbereiche,
  Zielgruppen) reuse the **NIP-AMB flattening convention**
  (`<property>:id` / `<property>:prefLabel:<lang>` / `<property>:type` concept
  triples), so the same tooling that reads kind `30142` resources —
  including `amb-nostr-converter` — can read them off calendar events.

### 2.1 Registration (Anmeldung) — agreed: yes/no only

Whether attending requires signing up beforehand. Registration *details*
(how, where, deadlines) belong in the description text and/or an `r`-tag
linking to the event page — there is deliberately no structured
registration-link field.

```
["registrationRequired", "true"]     // or "false"
```

- Tag **absent** → no statement.

### 2.2 Cost (Kosten) — agreed: price + currency

Modelled on the `price` / `currency` fields of
[NIP-15](https://nostrhub.edufeed.org/15#event-30018-create-or-update-a-product),
encoded as one tag (shape follows NIP-99's `price` tag):

```
["price", "<amount>", "<ISO-4217 currency>"]      // e.g. ["price", "0", "EUR"]
```

Agreed semantics:

| `price` value | Meaning |
|---------------|---------|
| tag absent / empty amount | keine Angabe (no statement) |
| `0` | kostenlos (free) |
| `> 0` | kostenpflichtig (paid) |

There is **no** separate "Kostenbeschreibung" field and **no**
`isAccessibleForFree` flag — anything beyond the number (reduced rates,
member prices, "teilweise kostenpflichtig") goes into the description text.
For events with differentiated pricing where no single number is honest,
publish the tag **without an amount statement** (or the base price) and
explain in the description. A structured per-audience price list
(Personenkreis / Kosten / Währung) was discussed and deferred — see
[open questions](#6-status-and-open-questions).

### 2.3 Attendance mode (Modus) — agreed: online / offline / mix

Tag name and values are taken **exactly** from schema.org
[`eventAttendanceMode`](https://schema.org/eventAttendanceMode):

```
["eventAttendanceMode", "https://schema.org/OnlineEventAttendanceMode"]
```

| Issue-#13 term | Tag value |
|---|---|
| online | `https://schema.org/OnlineEventAttendanceMode` |
| offline | `https://schema.org/OfflineEventAttendanceMode` |
| mix | `https://schema.org/MixedEventAttendanceMode` |

- `mix` covers what other systems call *blended* or *hybrid*; details are
  expected on the organizer's event page.

### 2.4 Participants and roles — agreed: organizer / attendee

NIP-52 already defines participant `p`-tags with a role field. Edufeed
supports (at least) these two roles:

```
["p", "<32-byte hex pubkey>", "<optional relay hint>", "organizer"]
["p", "<32-byte hex pubkey>", "<optional relay hint>", "attendee"]
```

Note: an `attendee` `p`-tag is set by the event author and is independent of
NIP-52 RSVP events (kind `31925`), which attendees publish themselves.

### 2.5 Educational level (Bildungsstufe) — vocabulary attribute

The stage of the education system the event addresses. Uses the AMB property
name `educationalLevel` with the KIM vocabulary
[`https://w3id.org/kim/educationalLevel/`](https://w3id.org/kim/educationalLevel/),
flattened exactly as on kind `30142` resources — a concept triple per value,
multi-valued by repeating the triple:

```
["educationalLevel:id", "https://w3id.org/kim/educationalLevel/level_C"]
["educationalLevel:prefLabel:de", "Fortbildung"]
["educationalLevel:type", "Concept"]
```

The vocabulary (ISCED-2011-aligned where applicable):

| Concept URI (`…/educationalLevel/`) | prefLabel de | prefLabel en |
|---|---|---|
| `level_0` | Elementarbereich | Early childhood education |
| `level_1` | Primarbereich | Primary education |
| `level_2` | Sekundarbereich I | Lower secondary education |
| `level_3` | Sekundarbereich II | Upper secondary education |
| `level_4` | Postsekundarer nicht-tertiärer Bereich | Post-secondary non-tertiary education |
| `level_5` | Kurzes tertiäres Bildungsprogramm | Short-cycle tertiary education |
| `level_A` | Hochschule | University |
| `level_6` | — Bachelor oder äquivalent (narrower of `level_A`) | Bachelor or equivalent |
| `level_7` | — Master oder äquivalent (narrower of `level_A`) | Master or equivalent |
| `level_8` | — Promotion oder äquivalent (narrower of `level_A`) | Doctoral or equivalent |
| `level_B` | Vorbereitungsdienst | Preparatory service |
| `level_C` | Fortbildung | Advanced training |

As everywhere in the data pool: the `:id` URI is authoritative,
`:prefLabel:de` is a denormalised display copy, `:type` is the literal
`Concept`.

---

## 3. Worked example

A time-based (kind `31923`) online training, free of charge, registration
required, aimed at teacher training (Fortbildung) and preparatory service:

```json
{
  "kind": 31923,
  "tags": [
    ["d", "https://relilab.org/relilab-werkstatt-2026-09/"],
    ["title", "reli.werkstatt – Du bist kostbar!"],
    ["start", "1789651800"],
    ["start_tzid", "Europe/Berlin"],
    ["end", "1789655400"],
    ["end_tzid", "Europe/Berlin"],
    ["summary", "Kurze thematische Inputs mit Austausch und Praxis. Anmeldung über relilab.org; Zugangslink nach Anmeldung."],
    ["location", "Zoom: https://relilab.org/live"],
    ["image", "https://relilab.org/wp-content/uploads/werkstatt.jpg"],
    ["r", "https://relilab.org/relilab-werkstatt-2026-09/"],
    ["t", "relilab"],

    ["registrationRequired", "true"],
    ["price", "0", "EUR"],
    ["eventAttendanceMode", "https://schema.org/OnlineEventAttendanceMode"],

    ["p", "<organizer pubkey hex>", "wss://relay.edufeed.org", "organizer"],

    ["educationalLevel:id", "https://w3id.org/kim/educationalLevel/level_C"],
    ["educationalLevel:prefLabel:de", "Fortbildung"],
    ["educationalLevel:type", "Concept"],
    ["educationalLevel:id", "https://w3id.org/kim/educationalLevel/level_B"],
    ["educationalLevel:prefLabel:de", "Vorbereitungsdienst"],
    ["educationalLevel:type", "Concept"]
  ],
  "content": "Die reli.werkstatt bietet kurze thematische Inputs und die Möglichkeit zu Austausch und Praxis.\n\nAnmeldung erforderlich (kostenlos): https://relilab.org/relilab-werkstatt-2026-09/"
}
```

A NIP-52 client that knows nothing about the extension renders this as a
normal calendar event; an education-aware client can additionally filter and
display registration, cost, mode, and Bildungsstufe.

---

## 4. Publishing

As with AMB resources, any client that can sign for the author can publish —
directly with the private key, via NIP-07 (browser extension), or via NIP-46
(remote signer). End-to-end from the command line with
[nak](https://github.com/fiatjaf/nak):

```bash
nak event -k 31923 \
  -d "https://example.org/events/my-training" \
  -t "title=Einführung in OER" \
  -t "start=1789651800" \
  -t "start_tzid=Europe/Berlin" \
  -t "registrationRequired=true" \
  -t "eventAttendanceMode=https://schema.org/OnlineEventAttendanceMode" \
  -t "educationalLevel:id=https://w3id.org/kim/educationalLevel/level_C" \
  -t "educationalLevel:prefLabel:de=Fortbildung" \
  -t "educationalLevel:type=Concept" \
  -c "Eine offene Fortbildung zu Open Educational Resources. Anmeldung: siehe Veranstaltungsseite." \
  --sec nsec1... \
  wss://relay.edufeed.org
```

(`price` needs a third tag element and can't be expressed with `nak -t`;
publish the full JSON via `nak event --tags-json` or a client library instead.)

For testing, use the development relay `wss://dev.amb-relay.edufeed.org`
instead of the production relay.

Updates re-publish the full event under the same `d`-tag; deletion is NIP-09
(kind `5` with an `a`-tag `31923:<pubkey>:<d>`), identical to the
[data-pool guide, Section 4](amb-datapool.html).

---

## 5. Querying

Standard NIP-01 filters:

```jsonc
// All calendar events
{"kinds": [31922, 31923]}

// By educational level (requires the relay to index this tag key — see below)
{"kinds": [31922, 31923], "#educationalLevel:id": ["https://w3id.org/kim/educationalLevel/level_C"]}
```

Notes:

- "Upcoming" cannot be filtered relay-side: `since`/`until` match
  `created_at`, not the `start` tag. Fetch and filter client-side (this is
  what the [live demo](calendar-demo.html) does).
- Filtering on `#educationalLevel:id` (and the other new keys) only works
  once the calendar relay indexes them — part of the planned relay adaptation
  (issue #13: "Kalender-Relay anpassen"). Until then, fetch by kind and
  filter client-side.

---

## 6. Status and open questions

**Agreed in issue #13** (semantics): registration yes/no with details in the
description; price + currency with the empty/0/>0 semantics; attendance mode
online/offline/mix; `p`-tag roles organizer/attendee; educationalLevel as an
additional vocabulary attribute.

**Fixed tag names** (decided 2026-07-06): `registrationRequired` (true/false),
`price` (NIP-15 semantics, NIP-99 shape), `eventAttendanceMode` (name and
values exactly as schema.org), `educationalLevel:*` (NIP-AMB concept triples).

**Open / follow-ups:**

- Adapt the calendar relay (tag indexing for the new keys).
- Structured per-audience pricing (Personenkreis/Kosten/Währung list) — could
  become repeated `price` tags with a label element; deferred, description
  text is the interim answer.
- Further vocabulary attributes: Bildungsbereiche, Zielgruppen (audience).
- Import relilab dates into edufeed.

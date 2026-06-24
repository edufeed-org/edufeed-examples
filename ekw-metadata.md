# EKW Educational Metadata — extension paths for kind 30142

This document describes the **EKW** extension metadata that the
[Edufeed app](https://github.com/edufeed-org) writes onto AMB learning-resource
events (Nostr **kind 30142**). It is a companion to the
[Nostr-AMB specification](https://git.edufeed.org/edufeed/nips/src/branch/edufeed-amb/AMB.md):
AMB defines the core properties (`name`, `about`, `learningResourceType`, …) and
the rule for flattening nested JSON into `key:subkey` tags; this document defines
the EKW-specific properties that AMB has no field for.

> **EKW vs. EKKW.** The tag namespace, the env config, and the form variant are
> all named **`ekw`**. The profile is maintained for the
> [**Evangelische Kirche von Kurhessen-Waldeck (EKKW)**](https://www.ekkw.de/)
> and its religious-education portal. "EKW" is the short slug used on the wire;
> "EKKW" is the organisation.

Everything here is plain Nostr — the values live in ordinary event tags, so any
Nostr client or library can read them without special support.

---

## 1. Namespace and tag-key grammar

EKW facets are flattened into tag keys under a fixed prefix:

```
ext:ekw:<facet>...
```

- **Prefix:** `ext:ekw:` — follows the NIP-AMB `ext:<ns>:` shape for
  forward-compatible extension metadata.
- **Namespace IRI:** `https://edufeed.org/ns/ekw#` (symbolic — no JSON-LD context
  document is hosted yet).
- **Legacy fallback:** the unprefixed shape `ekw:<facet>...` is still **read** for
  backward compatibility, but is never written. New events always use `ext:ekw:`.

Two value shapes exist, mirroring AMB's own `key:subkey` convention:

### Concept facets (SKOS-backed)

A controlled-vocabulary value is emitted as a **triple of tags** per selected
concept:

```
["ext:ekw:<facet>:id",            "<concept-uri>"]
["ext:ekw:<facet>:prefLabel:de",  "<German label>"]
["ext:ekw:<facet>:type",          "Concept"]
```

`:id` is the stable key. `:prefLabel:de` is a human-readable convenience copy.
`:type` is always the literal `Concept`. Concept facets are **multi-valued** —
repeat the triple once per concept.

### Scalar facets (free text)

A free-text value is emitted as a **single bare tag**, one per entry:

```
["ext:ekw:<facet>", "<value>"]
```

Scalar facets are also multi-valued — repeat the tag once per value.

> **Indexing note.** Like all `ext:*` tags, these keys are **not** indexed by
> `amb-relay.edufeed.org` for `#`-filtering, and are **not** covered by NIP-50
> `search`. They round-trip on the event but you cannot query by them at the
> relay; filter on AMB-core keys (`#about:id`, `#learningResourceType:id`, `#t`)
> and read the EKW facets off the returned events.

---

## 2. Core EKW facets

| Facet | Tag keys | Value | Cardinality | Vocabulary |
|-------|----------|-------|-------------|------------|
| **gradeLevel** | `ext:ekw:gradeLevel:{id,prefLabel:de,type}` | SKOS concept | multi | [Klassenstufen](https://nocabs.edufeed.org/vocab/npub16f5fut6pm2lm49fa5fn9t22vu24yuq5u8qlwjgwx5n02l2ue5cfqk7kc0l/klassenstufen) |
| **schoolType** | `ext:ekw:schoolType:{id,prefLabel:de,type}` | SKOS concept | multi | [Schularten](https://nocabs.edufeed.org/vocab/npub16f5fut6pm2lm49fa5fn9t22vu24yuq5u8qlwjgwx5n02l2ue5cfqk7kc0l/schulart) |
| **didacticConcept** | `ext:ekw:didacticConcept:{id,prefLabel:de,type}` | SKOS concept | multi | [Didaktische Konzepte](https://nocabs.edufeed.org/vocab/npub16f5fut6pm2lm49fa5fn9t22vu24yuq5u8qlwjgwx5n02l2ue5cfqk7kc0l/didaktisches-konzept) |
| **method** | `ext:ekw:method:{id,prefLabel:de,type}` | SKOS concept | multi | [Methoden](https://nocabs.edufeed.org/vocab/npub16f5fut6pm2lm49fa5fn9t22vu24yuq5u8qlwjgwx5n02l2ue5cfqk7kc0l/methode) |
| **methodOther** | `ext:ekw:methodOther` | free text | multi | — |
| **bibleReference** | `ext:ekw:bibleReference` | free text | multi | — |

Notes:

- **methodOther** captures methods not in the controlled vocabulary. In the
  editor it is a single multi-line text box; each non-empty line becomes one
  `ext:ekw:methodOther` tag.
- **bibleReference** holds a Bible passage in **German short form** with an
  en-dash range, e.g. `Mt 5,3–12`. Input is parsed and canonicalised before
  emission, so values are consistent and can be deep-linked (Lutherbibel 2017).

The SKOS vocabularies are themselves Nostr-published concept schemes
(**kind 39737**), referenced by `naddr` in the deployment configuration. Concept
`id`s are URIs minted under `https://edufeed.org/v/...`, for example
`https://edufeed.org/v/klassenstufen/5-6`.

Each vocabulary can be browsed at
[**nocabs.edufeed.org**](https://nocabs.edufeed.org) — Edufeed's Nostr vocabulary
browser. The links in the **Vocabulary** columns above and below open the live
concept scheme (its concepts, labels, and `id` URIs) for that facet.

---

## 3. Konfi sub-namespace (`ext:ekw:konfi:*`)

When a resource is authored for the **Konfi-Arbeit** (confirmation-program)
context, an additional set of facets is written under a nested namespace:

```
ext:ekw:konfi:<facet>...
```

Same two shapes as above — concept triple (`:id` / `:prefLabel:de` / `:type`) for
vocab facets, bare tag for scalar facets.

| Facet | Tag keys | Value | Cardinality | Vocabulary |
|-------|----------|-------|-------------|------------|
| **zielgruppen** | `ext:ekw:konfi:zielgruppen:{id,prefLabel:de,type}` | SKOS concept | multi | [Zielgruppen](https://nocabs.edufeed.org/vocab/npub16f5fut6pm2lm49fa5fn9t22vu24yuq5u8qlwjgwx5n02l2ue5cfqk7kc0l/konfi-zielgruppen) |
| **lernformat** | `ext:ekw:konfi:lernformat:{id,prefLabel:de,type}` | SKOS concept | multi | [Lernformat](https://nocabs.edufeed.org/vocab/npub16f5fut6pm2lm49fa5fn9t22vu24yuq5u8qlwjgwx5n02l2ue5cfqk7kc0l/konfi-lernformat) |
| **zeitstruktur** | `ext:ekw:konfi:zeitstruktur:{id,prefLabel:de,type}` | SKOS concept | multi | [Zeitstruktur](https://nocabs.edufeed.org/vocab/npub16f5fut6pm2lm49fa5fn9t22vu24yuq5u8qlwjgwx5n02l2ue5cfqk7kc0l/konfi-zeitstruktur) |
| **beteiligte** | `ext:ekw:konfi:beteiligte:{id,prefLabel:de,type}` | SKOS concept | multi | [Beteiligte](https://nocabs.edufeed.org/vocab/npub16f5fut6pm2lm49fa5fn9t22vu24yuq5u8qlwjgwx5n02l2ue5cfqk7kc0l/konfi-beteiligte) |
| **themen** | `ext:ekw:konfi:themen:{id,prefLabel:de,type}` | SKOS concept | multi | [Themen](https://nocabs.edufeed.org/vocab/npub16f5fut6pm2lm49fa5fn9t22vu24yuq5u8qlwjgwx5n02l2ue5cfqk7kc0l/konfi-themen) |
| **dimensionen** | `ext:ekw:konfi:dimensionen:{id,prefLabel:de,type}` | SKOS concept | multi | [Dimensionen](https://nocabs.edufeed.org/vocab/npub16f5fut6pm2lm49fa5fn9t22vu24yuq5u8qlwjgwx5n02l2ue5cfqk7kc0l/konfi-dimensionen) |
| **methode** | `ext:ekw:konfi:methode:{id,prefLabel:de,type}` | SKOS concept | multi | [Methode](https://nocabs.edufeed.org/vocab/npub16f5fut6pm2lm49fa5fn9t22vu24yuq5u8qlwjgwx5n02l2ue5cfqk7kc0l/konfi-methode) |
| **materialaufwand** | `ext:ekw:konfi:materialaufwand:{id,prefLabel:de,type}` | SKOS concept | single | [Materialaufwand](https://nocabs.edufeed.org/vocab/npub16f5fut6pm2lm49fa5fn9t22vu24yuq5u8qlwjgwx5n02l2ue5cfqk7kc0l/konfi-materialaufwand) |
| **technikbedarf** | `ext:ekw:konfi:technikbedarf:{id,prefLabel:de,type}` | SKOS concept | multi | [Technikbedarf](https://nocabs.edufeed.org/vocab/npub16f5fut6pm2lm49fa5fn9t22vu24yuq5u8qlwjgwx5n02l2ue5cfqk7kc0l/konfi-technikbedarf) |
| **lernorte** | `ext:ekw:konfi:lernorte:{id,prefLabel:de,type}` | SKOS concept | multi | [Lernorte](https://nocabs.edufeed.org/vocab/npub16f5fut6pm2lm49fa5fn9t22vu24yuq5u8qlwjgwx5n02l2ue5cfqk7kc0l/konfi-lernorte) |
| **landeskirche** | `ext:ekw:konfi:landeskirche:{id,prefLabel:de,type}` | SKOS concept | single | [Landeskirchen](https://nocabs.edufeed.org/vocab/npub16f5fut6pm2lm49fa5fn9t22vu24yuq5u8qlwjgwx5n02l2ue5cfqk7kc0l/landeskirchen) |
| **plainLanguage** | `ext:ekw:konfi:plainLanguage` | scalar (`"true"`) | single | — |
| **requiredMaterialsNote** | `ext:ekw:konfi:requiredMaterialsNote` | free text | single | — |

Additional rules:

- **Custom vocab values.** Some vocab facets allow a free-text addition. It is
  emitted as a scalar sibling of the concept triple:
  `["ext:ekw:konfi:<facet>:custom", "<value>"]` (currently used by
  `zeitstruktur`). Vocab concepts and a custom value may coexist.
- **plainLanguage** is a boolean rendered as the string `"true"`. The tag is
  omitted entirely when false.

---

## 4. Bildungsbereich label (NIP-32)

So the originating form variant can be inferred when re-editing, EKW events also
carry a NIP-32 label pair identifying the educational sector
(`konfi`, `schule`, …):

```
["L", "https://edufeed.org/ns/bildungsbereich#"]
["l", "konfi", "https://edufeed.org/ns/bildungsbereich#"]
```

This is independent of the `["L","metadata-form"] / ["l","<variant>","metadata-form"]`
NIP-32 labels that AMB events already use to record which editor produced them.

---

## 5. Worked example

A school resource with two grade levels, one school type, a didactic concept, a
vocab method plus a free-text method, and a Bible reference. AMB-core tags are
shown for context; EKW tags are the focus.

```json
{
  "kind": 30142,
  "tags": [
    ["d", "https://example.org/material/42"],
    ["name", "Schöpfung – eine Unterrichtseinheit"],
    ["type", "LearningResource"],

    ["about:id", "https://w3id.org/kim/schulfaecher/s1055"],
    ["about:prefLabel:de", "Religion"],
    ["about:type", "Concept"],

    ["ext:ekw:gradeLevel:id", "https://edufeed.org/v/klassenstufen/5-6"],
    ["ext:ekw:gradeLevel:prefLabel:de", "5–6"],
    ["ext:ekw:gradeLevel:type", "Concept"],
    ["ext:ekw:gradeLevel:id", "https://edufeed.org/v/klassenstufen/7-8"],
    ["ext:ekw:gradeLevel:prefLabel:de", "7–8"],
    ["ext:ekw:gradeLevel:type", "Concept"],

    ["ext:ekw:schoolType:id", "https://edufeed.org/v/schulart/grundschule"],
    ["ext:ekw:schoolType:prefLabel:de", "Grundschule (1–4)"],
    ["ext:ekw:schoolType:type", "Concept"],

    ["ext:ekw:didacticConcept:id", "https://edufeed.org/v/didaktisches-konzept/symboldidaktik"],
    ["ext:ekw:didacticConcept:prefLabel:de", "Symboldidaktik / Symbollernen"],
    ["ext:ekw:didacticConcept:type", "Concept"],

    ["ext:ekw:method:id", "https://edufeed.org/v/methode/rollenspiel"],
    ["ext:ekw:method:prefLabel:de", "Rollenspiel"],
    ["ext:ekw:method:type", "Concept"],
    ["ext:ekw:methodOther", "Stationenlernen"],

    ["ext:ekw:bibleReference", "Mt 5,3–12"],

    ["L", "https://edufeed.org/ns/bildungsbereich#"],
    ["l", "schule", "https://edufeed.org/ns/bildungsbereich#"]
  ],
  "content": "Eine Unterrichtseinheit zur Schöpfung."
}
```

### Nested (un-flattened) view

The same EKW facets, read back as nested JSON (AMB-style un-flattening of the
`:`-delimited keys):

```json
{
  "ext": {
    "ekw": {
      "gradeLevel": [
        { "id": "https://edufeed.org/v/klassenstufen/5-6", "prefLabel": { "de": "5–6" }, "type": "Concept" },
        { "id": "https://edufeed.org/v/klassenstufen/7-8", "prefLabel": { "de": "7–8" }, "type": "Concept" }
      ],
      "schoolType": [
        { "id": "https://edufeed.org/v/schulart/grundschule", "prefLabel": { "de": "Grundschule (1–4)" }, "type": "Concept" }
      ],
      "didacticConcept": [
        { "id": "https://edufeed.org/v/didaktisches-konzept/symboldidaktik", "prefLabel": { "de": "Symboldidaktik / Symbollernen" }, "type": "Concept" }
      ],
      "method": [
        { "id": "https://edufeed.org/v/methode/rollenspiel", "prefLabel": { "de": "Rollenspiel" }, "type": "Concept" }
      ],
      "methodOther": ["Stationenlernen"],
      "bibleReference": ["Mt 5,3–12"]
    }
  }
}
```

---

## 6. Reading EKW facets — pseudocode

```js
// Group ext:ekw tags by facet, reconstructing concepts and scalars.
function readEkw(event) {
  const out = {};
  for (const [key, value] of event.tags) {
    let k = key;
    if (k.startsWith('ext:ekw:')) k = k.slice('ext:ekw:'.length);
    else if (k.startsWith('ekw:')) k = k.slice('ekw:'.length); // legacy
    else continue;

    const parts = k.split(':');           // e.g. ["gradeLevel","id"] or ["methodOther"]
    const facet = parts[0];
    const sub = parts[1];                  // "id" | "prefLabel" | "type" | undefined

    if (sub === undefined) {               // scalar facet
      (out[facet] ??= []).push(value);
    } else if (sub === 'id') {             // start of a concept
      (out[facet] ??= []).push({ id: value, type: 'Concept' });
    } else if (sub === 'prefLabel') {      // parts[2] === 'de'
      const list = out[facet];
      if (list?.length) (list.at(-1).prefLabel ??= {})[parts[2]] = value;
    }
    // ":type" carries no new information; ignored.
  }
  return out;
}
```

(Konfi facets parse the same way after stripping the extra `konfi:` segment.)

---

## 7. Status and stability

- **`ext:ekw:` is the canonical write shape.** `ekw:` is read-only legacy.
- The namespace IRI is **symbolic** for now; treat `id` URIs and the tag-key
  grammar as the contract, not a dereferenceable context.
- Concept `id`s come from Nostr-published SKOS schemes (kind 39737). `prefLabel:de`
  is a denormalised copy for display; the `id` is authoritative.
- EKW facets are **additive** — an event with no EKW data is a plain AMB resource,
  and consumers that ignore `ext:*` keys see a valid AMB record.

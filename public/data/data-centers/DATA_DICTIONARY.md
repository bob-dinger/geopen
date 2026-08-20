# Texas data centre filings — data dictionary

Every data centre construction filing on the Texas Department of Licensing and
Regulation's architectural barriers register, at its street address.

**671 filings · 278 new-construction buildings · 70,729,191 sq ft of new building**

TDLR is an accessibility regulator. Every substantial construction project in
Texas registers with it for barriers review, which makes the register an
accidental and fairly complete record of what is being built — but nothing in it
exists to track data centres, and that shapes every limitation below.

---

## How filings were found

There is no building-type field anywhere in TABS — 27 fields on a detail page and
not one classifies the use — so filings are found by text, against the four
places the words can appear.

| Route | Where it lives | Filings found this way |
|---|---|---|
| Project name | statewide extract | 317 |
| Facility name | statewide extract | 195 |
| Scope of work | detail page only | 440 |
| Operator name in owner field | detail page only | 35 |

**Searching project names alone finds 110 of 671.** Operators file
under code names — Project Pumpkin, Project Eagle, DA12-2, Sharka — and the words
land in the facility name or the scope instead. The `found_by` column records
which routes matched each filing.

Matching terms: `data center`, `data centre`, `data hall`, `datacenter`,
`colocation`, `co-location`, `hyperscale`, `server farm`. Narrow on purpose:
`server` alone catches every office with a server closet.

---

## Columns copied from the filing

These are the document's own values, unaltered.

| Column | Meaning |
|---|---|
| `project` | TDLR project number, e.g. TABS2025026455 |
| `name` | Project Name |
| `facility` | Facility Name |
| `owner` | Owner Name, **verbatim** — usually a company formed for one building |
| `address` | Location Address |
| `city`, `county` | Location city and county |
| `cost` | Estimated Cost at filing |
| `sqft_stated` | Square Footage as filed |
| `work` | New Construction / Renovation-Alteration / Additions to Existing Building |
| `status` | Registered / Review Complete / Inspection Complete / Project Closed |
| `registered` | Registration date |
| `start`, `end` | Estimated start and completion dates |
| `scope` | Scope of Work, verbatim |
| `design_firm` | Design Firm Name |
| `url` | Link to the filing on tdlr.texas.gov |

## Columns derived here, with their rules

| Column | Rule |
|---|---|
| `sqft` | `sqft_stated`, unless that figure was impossible on its own terms — over 2M sq ft, or implying a cost outside $50–$5,000/sq ft when the median build is $683 — **and** the scope names a figure that resolves it. Applied once, to QTS DFW2-DC7, filed as 3,635,000 where its scope says "New 363,500 square foot 2 story building". |
| `sqft_source` | `"scope of work"` where that correction fired, else absent |
| `primary` | `false` on the second filing of a building filed twice, once for core-and-shell and once for the fit-out built into it, each carrying the full area and cost. **Sum only `primary` rows.** 8 filings are marked false. Identical *sibling* buildings are NOT collapsed — a campus builds to one design, and the scopes say so ("the ninth data center", "the second building of a campus") |
| `duplicate_of` | the project number this filing was folded into |
| `cost_per_sqft` | `cost / sqft` where both exist and area exceeds 10,000 sq ft |
| `cost_suspect` | `true` above $4,000/sq ft — the cost stated is the campus, not this building. 7 filings. **Exclude from cost totals** |
| `area_is_campus` | `true` where a filing over 2M sq ft describes a campus. 1 filing: Project Seafox, El Paso, stating 596 acres of site. **Exclude from area totals** |
| `found_by` | which of the four search routes matched |
| `geo_precision` | `"address"` where the geocode fell inside the filing's county; `"county"` for the 6 that could not be resolved and sit at the county centre |
| `lon`, `lat` | position, WGS84 |

---

## How to total it correctly

```python
rows = json.load(open("texas_data_centers.json"))

new_buildings = [r for r in rows
                 if r["primary"]                    # not a second-phase filing
                 and r["work"] == "New Construction"
                 and not r["area_is_campus"]]       # not a site-area figure
floor_area = sum(r["sqft"] or 0 for r in new_buildings)

cost = sum(r["cost"] or 0 for r in new_buildings if not r["cost_suspect"])
```

Floor area is the sounder measure. Cost is an estimate made at filing, it moves,
and on the largest projects it is sometimes the whole campus written onto one
building's paperwork.

**Do not sum floor area across renovations.** A fit-out filing restates the area
of the hall it sits inside, so adding it to new construction counts the same
building twice.

---

## What this is not

**Not a census.** The scope-of-work sweep read filings of $20M or more — 8,292 of
them. Below that, small fit-outs inside existing halls remain invisible, and no
name search would surface them. Treat every total as a floor.

**Not a list of operating data centres.** These are construction filings. A
filing registered in 2026 may not be built.

**Not current with the news.** A project registers when it reaches design and
construction, not when it is proposed or rezoned, so a data centre being argued
over at a council meeting is months from appearing here.

**Two populations are mixed.** Purpose-built halls and corporate server rooms
inside offices, hospitals and warehouses both use the words. They separate
reasonably on cost — of 671 filings, 271 are under $5M and contribute
1,627,020 sq ft of new building — but the dataset does not draw the line for
you, because where it falls is a judgement.

**Ownership is not resolved.** `owner` is the string on the filing. Most are
single-purpose companies, and identifying the operator behind one takes Secretary
of State and deed records not used here.

---

*Source: Texas Department of Licensing and Regulation, Architectural Barriers
project register. Built at geopen.io. Statewide extract of 327,903 filings pulled
18 August 2026.*

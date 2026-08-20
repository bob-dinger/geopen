# Texas data center filings — data dictionary

Every data center construction filing on the Texas Department of Licensing and
Regulation's architectural barriers register, at its street address.

**663 filings · 277 new-construction buildings · 71,033,970 sq ft of new building**

TDLR is an accessibility regulator. Every substantial construction project in
Texas registers with it for barriers review, which makes the register an
accidental and fairly complete record of what is being built — but nothing in it
exists to track data centers, and that shapes every limitation below.

---

## How filings were found

There is no building-type field anywhere in TABS — 27 fields on a detail page and
not one classifies the use — so filings are found by text, against the four
places the words can appear.

| Route | Where it lives | Filings found this way |
|---|---|---|
| Project name | statewide extract | 309 |
| Facility name | statewide extract | 195 |
| Scope of work | detail page only | 459 |
| Operator name in owner field | detail page only | 35 |

**Searching project names alone finds 101 of 663.** Operators file
under code names — Project Pumpkin, Project Eagle, DA12-2, Sharka — and the words
land in the facility name or the scope instead. The `found_by` column records
which routes matched each filing.

Matching terms: `data center`, `data center`, `data hall`, `datacenter`,
`colocation`, `hyperscale`, `server farm`. Narrow on purpose: `server` alone
catches every office with a server closet.

`co-location` with a hyphen was dropped. It is not an industry term in these
filings — it means two tenants sharing a space, and it caught eight projects that
were airline gate swaps (American, US Airways, United/Continental), Parkland
hospital and a Bank of America branch. Not one was a data center.

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
| `category` | the one field to count on: **New building** (273), Renovation (323), Addition (39), Work type not stated (16), Not counted (12 — a second-phase filing, a garage or shop containing a data center, or a site-acreage figure). These sum to the full 663 |
| `found_by` | which of the four search routes matched |
| `primary_use_other` | set where the building is primarily something else that happens to contain a data center — a parking garage, a medical office, a convenience store. 4 filings, read individually rather than caught by a rule. **Excluded from building and area totals** |
| `geo_precision` | `"address"` where the geocode fell inside the filing's county; `"county"` for the 6 that could not be resolved and sit at the county center |
| `lon`, `lat` | position, WGS84 |

---

## How to total it correctly

```python
rows = json.load(open("texas_data_centers.json"))

new_buildings = [r for r in rows if r["category"] == "New building"]
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

**Not a list of operating data centers.** These are construction filings. A
filing registered in 2026 may not be built.

**Not current with the news.** A project registers when it reaches design and
construction, not when it is proposed or rezoned, so a data center being argued
over at a council meeting is months from appearing here.

**Two populations are mixed, and no field separates them.** A purpose-built hall
and a server room inside a hospital, bank or shop both file work described as a
"data center". Reading 22 renovation filings at random, about nine were corporate
server rooms — Ben Taub Hospital, Farm Credit Bank ("data room on 2nd floor of
existing office building"), Tomball Regional Medical Center ("expanding computer
room"), BBVA, Saxon Mortgage, Lowe's, Micron, AIG.

Cost does not divide them: in that same sample the Lowe's server room was $25.2M
while an H5 colocation fit-out was $300,000. Facility name gets partway there and
leaves half the file unresolved. So the dataset does not label them, and **the
filing count should be described as filings, not as data centers**.

**The new-construction figures are not affected.** A new 700,000 sq ft building
is not a server closet. Reading the twenty largest — 41% of all floor area —
every one states a whole building: "1-story data center", "single story Data
Center approximately 805,380 sf", "800,000sf data center facility". This is why
floor area is quoted over new buildings only, and why it is the number to lead
with.

**Crypto mining and AI sit in the same file, and the line between them moves.**
Crusoe, Lancium and Galaxy built for bitcoin and now build for AI — Core
Scientific's Denton filing literally reads "Convert bitcoin mining buildings into
data centers". They are counted, because they are data centers now. Saxet Energy
Park in Corpus Christi is the ambiguous case, its scope reading "TO HOUSE DATA
CENTERS/MINING EQUIPMENT"; it is counted too, at three buildings of 37,813 sq ft.
Together, filings tied to companies with mining histories are about 7% of floor
area.

**Ownership is not resolved.** `owner` is the string on the filing. Most are
single-purpose companies, and identifying the operator behind one takes Secretary
of State and deed records not used here.

---

*Source: Texas Department of Licensing and Regulation, Architectural Barriers
project register. Built at geopen.io. Statewide extract of 327,903 filings pulled
18 August 2026.*

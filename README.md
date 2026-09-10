# Perseus Equipment: Service Opportunity Finder

A dealer operations analytics app built on the Perseus Equipment dealer management database. It covers the
reporting a manager expects, but its centerpiece answers the question a sales manager actually has on Monday
morning: **who do I call today, what do I pitch them, and what is it worth?**

Every recommendation has to survive being said out loud on a phone call, so each one carries a plain-English
talk track built only from numbers traceable to a row in the database.

## Running it

```bash
npm install
npm run seed   # generates a sample database; skip if you have the real export
npm run dev    # http://localhost:43123
```

### The database

The app reads a SQLite file directly, read-only, and never writes to it. It looks for one in this order:

1. `$PERSEUS_DB`, if set
2. `perseus_equipment_database.db` at the repository root
3. `data/perseus_equipment_database.db`
4. `data/perseus-sample.db`, the generated sample

Dropping the real export at the repository root is all it takes. No code change, no configuration, and the sample
is ignored the moment the real file is present. Database files are gitignored so customer data is never
committed.

**Running on the sample?** The app says so in a banner on every screen. The arithmetic is real; the dollar
figures are invented, because they come from generated data. `npm run seed` builds that sample with the same
table and column names the challenge README documents, and plants the behavioural patterns the rules look for
(dormant accounts, parts-only buyers, repeat-visit churn, warranties lapsing).

`/diagnostics` shows which file is loaded, which parts of the schema were found, and every figure the app derived
from the data rather than assumed.

## What it recommends

Seven rules, each pairing a signal in the data with a service the dealership already sells:

| Signal | Pitch |
| --- | --- |
| Owns machines, never serviced here | Scheduled maintenance plan |
| Buys parts, never buys labor | Shop service on the jobs they cannot do in the yard |
| Service spend below comparable customers | Catch-up inspection and a maintenance interval |
| Warranty lapsing or recently lapsed | Post-warranty coverage |
| Repeat renter with no machine of their own | Rental-to-own conversion |
| Purchase cadence broken against their own history | Win-back inspection |
| High support churn | On-site best-practices training |

The default view is the list the business asked for: customers with posted history who have bought **no new
service** in the trailing twelve months, split into those who never bought service, those who lapsed, and those
who only ever buy reactive repairs.

## How the dollar figures are built

The comparison is against real customers in the same database, not an industry average:

- **Cohort.** Same trade class (`CustomerClass`), bucketed by machines owned, so a three-machine landscaper is
  compared against other three-machine landscapers. Too few peers and it widens to the trade class, then to the
  whole book. The basis used is always shown.
- **Benchmark.** The cohort's median *annual* service spend, with the top quartile as the stretch case. Medians
  are taken over peers who actually buy service: including the non-buyers drags the median to zero and the
  benchmark stops meaning anything. Both counts appear in the UI so the comparison is never overstated.
- **Fleet scaling.** The obvious benchmark is a per-machine median times the machines a customer owns, but that
  assumes every extra machine brings a full extra machine's worth of work. This data disagrees: service spend per
  machine falls about fourfold from small fleets to large ones, so the multiplication inflates in proportion to
  fleet size. Instead the app fits log spend against log machine count across the book and scales the cohort
  median by that measured elasticity, which comes out near zero on the sample. The fitted value is on
  `/diagnostics`.
- **Expected annual revenue.** `peer annual service spend − their current service spend`, floored at zero.
- **Confidence gating.** Cohort size is displayed, and when there are too few comparable customers the app shows
  "not priced" rather than inventing precision.
- **One wallet, counted once.** Several rules can fire on the same customer and reach for the same money. Every
  qualifying row is still shown, because each is a different way into the conversation, but the pipeline totals
  count each customer once at their largest estimate.
- **Win-backs.** A dormant account is priced on the twelve months ending at its own last invoice, not a fixed
  calendar window. A fixed window drifts off the customer's activity as they go quiet, which would make an
  account look less valuable the longer it had been gone.

### What an offering costs the customer

The revenue opportunity and the price of the thing you are pitching are two different numbers, and the call sheet
keeps them apart. Each offering is priced from the basis its catalogue entry claims: a maintenance plan from what
a comparable account spends on service across a year, an annual inspection from the blended labour rate times the
median technician hours a planned visit actually takes. Pricing an inspection off a peer's whole year of service
would make a single visit cost more than a year on a plan.

A plan is how a customer buys service instead of buying it ad hoc, so its price stands against spend they already
make. An inspection lands on top of whatever repairs the year brings. Either way the customer's added cost is the
same dollar the dealership books as added revenue, and the retrospective compares that against the repair spend
the service could plausibly have prevented. When the added cost is larger, the panel says the pitch is an uptime
argument rather than a saving, instead of implying it pays for itself.

### Contribution, not profit

The schema has parts cost (`SalePart.AvgCost`) but no technician wage cost, so net profit is not computable from
this data. The app reports **contribution** — parts gross margin plus labor revenue — and labels it that way
everywhere. The contribution rate itself is measured from the database, not assumed.

An invoice total is not only labor and parts: it also carries sales tax and shop supplies, which the dealership
collects but does not keep. Taking the parts share as "everything that is not labor" would apply a parts margin
to that money, so the parts slice is measured from the line items instead and the pass-through remainder
contributes nothing. On the sample it is about 5% of service revenue, worth roughly two points of contribution.

### Measured, calculated, assumed

Every call sheet has a "How we calculated this" panel where each figure is tagged as one of three things: taken
from the data, calculated from it, or an assumption the user controls. The on-site training pitch is the clearest
case. These are measured: repeat visits on the same machine within 90 days, the technician hours they consumed
(`WorkInProgress`), the blended labor rate (labor revenue divided by labor hours), what the customer paid, and
days past the promised date. These are not in the data and are therefore adjustable inputs: the training fee, and
the share of repeat visits training would prevent. The app will not assert an efficiency statistic this database
cannot support.

Downtime is counted against `WorkOrderSchedule.PromisedDate`, because that is the date the customer was told;
`RequiredDate` is an internal target and is only the fallback when the export has no promised date. Which one was
used is on `/diagnostics` and in the wording of the talk track.

The training pitch is also gated on its own arithmetic. If the fee costs the customer more in the first year than
the repeat repairs it would spare them, the recommendation stays on the list — the repeat visits are still worth
a call — but it carries no dollar figure and the talk track argues uptime instead of claiming a saving.

## Screens

- **`/`** Overview. Posted revenue, invoice counts, open work orders, in-stock machines, monthly revenue trend,
  top customers, inventory and parts health, and total open opportunity dollars.
- **`/opportunities`** The call list. Ranked by what the pitch is worth, filtered by reason, customer type, and
  fleet size. Filters live in the URL, so a filtered view is a link you can send to a colleague.
- **`/opportunities/[customerId]`** The call sheet. Why they qualify, how they compare to their cohort, the math
  panel, what last year would have been worth with the service in place, a copyable talk track, and their
  machines and history.
- **`/customers`, `/invoices`** Search, filter and drill into a customer profile or an invoice with its line
  items and service segments.
- **`/inventory`** Machines by stock status and age, and the parts that move.
- **`/service`** Work orders by status, technician workload, and a repeat-visit audit listing the actual work
  orders behind every training recommendation.
- **`/diagnostics`** Which database is loaded, schema coverage, and the derived figures.

## Care taken with this data

- **Revenue means posted revenue.** Only `finalized` and `archived` invoices count. Quotes, drafts, voided and
  committed documents are visible in the invoice list but never in a revenue figure.
- **Dates are TEXT.** They are compared by their `YYYY-MM-DD` prefix rather than parsed. `/diagnostics` warns if
  a file's dates do not match that shape.
- **No reliable on-hand parts quantity.** Parts health is reported as stocking-policy coverage, and the screen
  says which columns it used.
- **Machine sales are separated from recurring spend.** Service share of wallet and win-back estimates exclude
  equipment purchases, since one machine sale would otherwise swamp both.
- **Sensitive fields are never surfaced.** No passwords, hashes or internal-only columns are read or displayed.
- **Incomplete contacts are shown as such.** The call list flags accounts with no usable phone or email rather
  than silently showing a blank.

## Layout

```
scripts/seed-dev-db.ts     Generates the schema-faithful sample database
scripts/smoke.ts           Runs the data layer outside Next, for quick SQL checks
scripts/verify.ts          Reconciles reported figures against independent SQL
scripts/degrade.ts         Drops each optional table and checks the app degrades
src/lib/db.ts              Read-only connection, invalidated when the file changes
src/lib/schema.ts          Schema probe: capabilities, gaps, date format, support tables
src/lib/metrics/           Customer metrics, peer cohorts, economics, list queries
src/lib/opportunities/     The seven rules, training model, retrospective, approach
src/lib/services/          Service catalog and service-code classification
src/app/                   Screens
```

Derived figures are memoised against the database file and the current date. The file half means nothing stale
survives a new export; the date half matters because almost every number is cut to a trailing twelve months from
today, and without it a long-running server would keep serving the window it computed on its first request. A
SQLite export is a snapshot rather than a live feed, so every screen carries a "data as of" stamp taken from the
newest activity date in the file.

## Commands

```bash
npm run dev     # dev server on port 43123
npm run build   # production build
npm run start   # serve the production build
npm run seed    # regenerate the sample database
npm run smoke   # run the data layer in isolation and print what it found
npm run verify  # reconcile what the app reports against the database
npm run degrade # check the app survives a database missing each optional table
npx eslint .    # lint
```

`npm run verify` is the one worth running against a new export. It re-derives every headline figure in
independent SQL and checks it matches what the screens show, confirms no quote, draft, void or commitment reached
a revenue number, asserts each rule's qualifying condition really holds for the customers it flagged, checks no
invoice lands in two revenue lines at once, and reports any password or token columns the app must never select.
It exits non-zero if anything disagrees.

`npm run degrade` is the other one. Every query declares the tables and columns it needs, and the point of that
is a readable report rather than an exception thrown from inside a query. This drops each optional table from a
copy of the database in turn and runs the whole data layer against it, so that promise is tested rather than
assumed.

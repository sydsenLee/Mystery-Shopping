# Mystery Shop Manager

A web app that replaces the Excel "Blood Chart" used for automotive dealership mystery shopping.
Delegates' visits are captured with large Yes / No buttons, every answer saves straight away, and the
Blood Chart, analytics and reports calculate themselves. It works for any OEM: nothing about Suzuki,
a dealer network or a particular questionnaire is built in.

**Quickest way to use it:** download `release/Mystery-Shop.html` and double-click it. It opens in your
browser and works offline. Your data is saved in that browser on that computer, so use
Settings → Download backup regularly.

**For developers:**

```
npm install
npm run dev          # local development at http://localhost:5173
npm test             # calculation tests
npm run build        # static website in dist/
npm run build:single  # one self-contained HTML file in dist-single/ (copy it to release/)
```

---

## 1. What the existing workbook does (analysis)

`Mystery shopping Blood chart 9 Aril 2026.xlsx` has one sheet in two halves:

| Part | Columns | Content |
|---|---|---|
| First Moment of Truth | A to V | 4 questions, then "Did the salesperson:" with 12 lettered sub-questions (a to j, with h and j used twice). 19 "teams" across the top, each with a dealership name. |
| Second Moment of Truth | X to AS | Question 1 "Did the salesperson qualify your needs?" with 3 sub-questions (a to c), then questions 2 to 12. Dealer names copied from the first half with `=D4` formulas. |
| "CAN I HELP YOU?" | row 21 | An extra tally row marked with "x" for 7 of the 19 teams. It records a behaviour the OEM does **not** want. |

Conditional formatting colours "Yes" green and "No" red. There are no percentage formulas yet, so all
compliance figures were worked out by hand.

What this told us, and how the app handles it:

* **The same dealership is visited more than once** (GWM Menlyn 3 times, Land Rover, Hyundai, Nissan and Jetour twice). Each visit is stored separately and labelled "(visit 2)", and results can also be rolled up by dealership.
* **One exercise can cover many brands** (a competitor benchmark). Dealerships therefore have their own optional brand, separate from the exercise's OEM.
* **Questions have sub-questions**, and sometimes the parent is only a heading ("Did the salesperson:") while other times it is a real question ("Did they qualify your needs?"). Both are supported.
* **Manual lettering went wrong** (two "h" and two "j"). Numbering is now automatic: 1, 2, 5a, 5b ...
* **"Can I help you?" is a negative behaviour.** Questions can be flagged so that **No** is the compliant answer.
* **Team numbers matter** to identify visits. Every visit keeps a Team / shopper reference.

## 2. Architecture

```
React single-page app (TypeScript)
 ├─ Screens: Dashboard, Exercises, Dealerships, Data Capture, Blood Chart, Analytics, Reports, Settings
 ├─ Calculation engine (src/lib/calc.ts + report.ts)   ← the only place percentages are worked out
 ├─ Exports (src/lib/exports.ts): Excel, CSV, PDF      ← built from the same report model
 └─ Data store (src/store)
     ├─ in-memory state with per-record auto-save (debounced, one write at a time per record)
     └─ storage adapter
         ├─ Browser (IndexedDB) when hosted as a normal website
         ├─ Online shared store when published as a Claude page
         └─ (future) a server database such as Supabase or Postgres: one new adapter, no screen changes
```

Everything runs in the browser, so the app can be hosted for free on any static host
(Netlify, Vercel, GitHub Pages, Azure Static Web Apps or an internal web server).

## 3. Data model

```
OEM ─┬─< Exercise ─┬─< QuestionnaireVersion (sections → questions)
     │             └─< Visit ──> Dealership
     └─< Dealership (optional brand)        Visit.responses: { questionId → answer }
Template (reusable questionnaires)
```

| Record | Key fields |
|---|---|
| **OEM** | name, logo (resized image), brand colour |
| **Dealership** | name (unique, case-insensitive), brand, region, city, dealer code, archived |
| **Exercise** | OEM, name, period from/to, region, notes, status (planning, in field, closed) |
| **QuestionnaireVersion** | exercise, version number, sections[ {title, questions[]} ], change note |
| **Question** | text, type, required, parent (for sub-questions), heading-only flag, negative-behaviour flag, options, shopper guidance |
| **Visit** | exercise, dealership, questionnaire version, team, shopper, salesperson, visit date, notes, status, responses |
| **Response** | value (yes / no / na / number / text), note, time |
| **Template** | name, sections (copied into each new exercise) |

Response types: **Yes/No** and **Yes/No/N/A** are scored. **Rating out of 5**, **multiple choice** and
**text** are captured and reported but never change compliance percentages.

**History is protected.** As soon as a visit has an answer against a questionnaire version, that version
is locked. Further edits are saved as a new version (v2, v3 ...). Visits already captured keep the
questions they were scored on; visits with no answers move to the new version automatically; an
in-progress visit can be switched to the newest version with one click. Reports merge all versions:
the newest wording is shown, and a question that is not in a visit's version counts as "not in version"
for that visit, never as unanswered or No.

## 4. Main screens

| Screen | Purpose |
|---|---|
| **Dashboard** | All exercises with OEM, period, visits and overall %; filter by OEM; "continue capturing" list of unfinished visits. |
| **Exercises** | Create, search and open exercises. Inside an exercise: Overview, Questionnaire builder, Dealership visits, Details. |
| **Dealerships** | Saved dealership list, inline editing, bulk paste, region, archive, merge duplicates, visit history and all-time score. |
| **Data Capture** | Visit list on the left, questions on the right with large YES / NO (/ N/A) buttons, progress, auto-save, Mark complete, Next dealership. |
| **Blood Chart** | Question × dealer matrix with sticky question column, sticky dealer header, sticky compliance column, section and overall rows. |
| **Analytics** | Headline figures, strengths, biggest gaps, 100% questions, most "No" answers, section averages, score spread, dealer ranking, question table. |
| **Reports** | PDF report, Excel workbook, Blood-Chart-only Excel, four CSV files, with a live preview. |
| **Settings** | OEM logos and colours, score colour bands, saved templates, backup and restore, sample data. |

## 5. User workflow

```
Select exercise → Add dealership visit (type to pick from the saved list) → Tap YES / NO
→ Mark complete (blocked until required questions are answered) → Next dealership
```

* Answers save as you click. The sidebar shows "Saving" then "All changes saved".
* After each answer the next unanswered question is highlighted (can be turned off).
* Keyboard: **Y** Yes, **N** No, **A** N/A, **1 to 5** rating, **↑ ↓** move, **Backspace** clear.
* Click a selected answer again to clear it.
* "Add many at once" accepts a pasted list of dealership names (a name listed twice creates two visits).

## 6. Calculation methodology

All screens and exports call the same functions in `src/lib/calc.ts`.

| Figure | Formula |
|---|---|
| Question compliance | compliant answers ÷ (Yes + No) × 100 |
| Visit score | compliant answers ÷ (Yes + No answers on that visit) × 100 |
| Section score (one visit) | same, limited to that section |
| Section / overall score (many visits) | **pooled**: total compliant ÷ total Yes + No across the visits |
| Dealership score (repeat visits) | pooled across that dealership's visits |

* **Compliant** means Yes, except on a negative-behaviour question where it means No.
* **N/A** and **unanswered** are excluded from the denominator. They are never counted as No.
* When nothing has been answered the result is shown as "-", never 0%.
* By default only **completed** visits count. Tick "Include visits still in progress" to include the rest.
* Worked example from the brief: 30 visits, 20 Yes, 5 No, 5 blank → 20 ÷ 25 = **80%** (not 66.7%). This, the 100% / 75% / 40% examples and the 92% dealership example are automated tests in `src/lib/calc.test.ts`.
* Colour bands (default green ≥ 80%, amber ≥ 60%, red below) only change colours, never numbers. Change them in Settings.

## 7. Layout (wireframe description)

```
┌──────────────┬──────────────────────────────────────────────────────────────┐
│ Mystery Shop │  Page title                                     [Actions]    │
│ Working on ▾ │  ┌ Filters: OEM | Exercise | Dealer | Region | Dates | ... ┐ │
│ Dashboard    │  └──────────────────────────────────────────────────────────┘ │
│ Exercises    │  [KPI] [KPI] [KPI] [KPI]                                      │
│ Dealerships  │  ┌ Data Capture ─────────────────────────────────────────────┐ │
│ Data Capture │  │ Visits list   │ Dealer name     [<] [Mark complete] [Next]│ │
│ Blood Chart  │  │ ● Montana 32/32│ ███████████░░ 18 of 25 completed        │ │
│ Analytics    │  │ ○ Menlyn  18/32│ 1 Showroom clean?        [ YES ] [ NO ] │ │
│ Reports      │  │ + Add visit    │ 2 Acknowledged in 30s?   [ YES ] [ NO ] │ │
│ Settings     │  └───────────────┴─────────────────────────────────────────┘ │
│ ✓ Saved      │                                                              │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

On tablets and phones the menu collapses behind a button and the visit list sits above the form.

## 8. Additions beyond the spreadsheet

* Negative-behaviour questions (for "Can I help you?").
* Repeat-visit labelling and roll-up by dealership.
* Per-answer notes (shown as a dot in the Blood Chart and as cell comments in Excel).
* Questionnaire versions so history is never rewritten.
* Templates: start from the Blood Chart template, a blank questionnaire, a saved template or a copy of a previous exercise.
* Dealership merge to fix duplicate spellings, plus archive.
* Visit details: team, shopper, salesperson seen, date, notes.
* Score spread chart and "most No answers" list.
* Backup and restore of all data as one JSON file.
* Sample data (19 visits using the workbook's dealer names with made-up answers) to try every screen.

## 9. Implementation plan and status

| Phase | Scope | Status |
|---|---|---|
| 1 | Data model, calculation engine, tests | Done |
| 2 | Exercises, questionnaire builder with versions, dealership list | Done |
| 3 | Fast data capture with auto-save | Done |
| 4 | Blood Chart, analytics, filters | Done |
| 5 | Excel, CSV and PDF exports, OEM branding | Done |
| 6 | Multi-user server database with logins and roles (adapter in `src/store/adapters.ts`) | Next step |
| 7 | Offline field capture on tablets with later sync; photo evidence per answer; trend reports across exercises for the same OEM | Ideas |

## Where data is stored

* **Hosted as a website:** in the browser (IndexedDB) of the computer or tablet being used. Use
  Settings → Download backup regularly and Restore to move data to another device.
* **Published as a Claude page:** in the page's online store, shared with everyone you give edit access.

For a team using several devices at once, phase 6 (a shared server database) is the recommended next step.

## Project layout

```
src/lib/types.ts         data model
src/lib/calc.ts          calculation engine (tested)
src/lib/report.ts        builds the filtered result set used everywhere
src/lib/exports.ts       Excel, CSV, PDF
src/lib/templates.ts     built-in questionnaire templates
src/store/               state, auto-save queue, storage adapters, business actions
src/components/          shared UI, Blood Chart, questionnaire builder, filters
src/pages/               one file per screen
```

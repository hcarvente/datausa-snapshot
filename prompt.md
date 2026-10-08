# Data USA Snapshot — Planning & Build Log

A running record of how this project was planned and built. Updated as work progresses.

## Goal
A small, dependency-free web app (HTML + CSS + JavaScript + JSON) that fetches live data from the Data USA API and shows an industry/workforce snapshot. Built as a first hands-on project for learning how to fetch data from an API.

## Major decisions
| # | Decision | Why |
|---|----------|-----|
| 1 | Use Data USA as the first API | Free, JSON, no signup; good for learning `fetch()` |
| 2 | **No API key** | Data USA's API is open. `config.json` stores the base URL and query names instead of a secret |
| 3 | Use the **Tesseract** API (`https://api.datausa.io/tesseract/data.jsonrecords`) | The older `datausa.io/api/data` endpoint returns 404 (retired) |
| 4 | Use one cube, **`pums_5`** (ACS PUMS 5-year) | It has industry, degree, wage, gender, race, ethnicity and age in one place, so one query pattern covers every section |
| 5 | Plain CSS bars, **no chart library** | Fewer moving parts while learning |
| 6 | Mockup first, then delete it | A throwaway `mockup.html` with made-up numbers settled the layout and the four UI states before any fetch code. It was deleted once the real app replaced it, so the repo has no fake data |
| 7 | National, latest year (2024) first | Keeps the first version simple; state picker is a later stretch |
| 8 | "Workforce" = employed + armed forces (`Employment Status:1,2,4,5`) | The unfiltered total includes children and non-workers, which made average wage misleading ($32k vs $66k) |
| 9 | One shared **focus industry** drives the demographic sections | Lets you compare who works in an industry against the whole workforce |
| 10 | Race & ethnicity get their own highlighted card with a "read this first" note | They are two separate Census questions and must not be added together; the card also shows each group's share against its overall share (dark tick) |
| 11 | Show limits next to the data (card captions + "How to read this data" panel) | Survey estimates, mean wages, and group gaps are not proof of cause |
| 12 | Publish to GitHub | Nothing secret in the repo (no key), so safe to share |

## Features
- Workforce size and average earnings (stat cards)
- Industry breakdown: one bar chart (workforce by sector, average wage); click a bar or use the menu to focus an industry
- Gender and age breakdown for the focused industry, with a tick for the overall share
- Race and Hispanic origin breakdown (side by side), with average wage and a "small group" flag
- Education breakdown (six levels, in order, with average wage)
- Loading, error (with Retry, timeout, and a hint if opened as a file) and no-data states
- "How to read this data" panel

## Findings from API exploration
- Response shape: `{ annotations, page, columns, data: [ ... ] }`; rows live in `data`.
- `pums_5` covers 2014–2024; latest year is **2024** (a 2020–2024 pooled 5-year estimate).
- Filter syntax that works: `include=Year:2024;Employment Status:1,2,4,5` (semicolon between filters, comma between values). With it: **163.7M workers, average wage $66,166**.
- With that filter the industry list has 14 sectors (including Active Duty Military) and no `"uninformed"` row.
- Age comes back as single years, so it is bucketed in JavaScript (config `ageBuckets`).
- Raw education groups include "Preschool", "Primary Education", "No Schooling"; they are merged into "Less than high school" and ordered by level (config `educationGroups`).
- Raw race has 9 groups, three of them different American Indian / Alaska Native labels (one very long); these are merged (config `raceLabels`).
- Raw Hispanic origin has 24 values ("Not Hispanic" plus 23 origins); the app shows Not Hispanic, Mexican, Puerto Rican, Cuban and "Other Hispanic or Latino" (config `hispanicTop`).
- The API sends `access-control-allow-origin: *`, so browser `fetch()` works from localhost.

## Review: ways the code could break (found and handled)
- Stale async results: a slow request for one tab could overwrite another. Fixed with render tokens (`gaToken`, `raceToken`).
- A failed demographic fetch had no retry. Each card now shows a message with a Retry button, and failures are not cached.
- No timeout: requests now abort after `timeoutMs` (20 s) with a clear message.
- Opening `index.html` as a file (fetch of `config.json` is blocked): the error now says to run a local server.
- Null measures are coerced to 0; empty chart data shows "No data for this selection."
- Still true by design: if any of the three main queries fails, the whole page shows the error state; cube and level names in `config.json` must match the API, and a year with no data shows the no-data state.

## Build steps
- [x] 1. Plan approved (scope, API, file structure)
- [x] 1a. Mockup built and reviewed (`mockup.html`), later deleted because it was out of date and held sample numbers
- [x] 1b. Seed this `prompt.md`
- [x] 2. Finalize queries with `curl`
- [x] 3. Write `config.json`
- [x] 4. `index.html` + `style.css`
- [x] 5. `app.js` (`loadConfig`, `fetchCube`, render functions)
- [x] 6. Loading / error / empty state handling
- [x] 7. Tested states in headless Chrome: data, error (bad cube name → HTTP 400), empty (year 1999)
- [x] 7a. Reviewed code; fixed the issues above
- [x] 7b. Demographic view: gender, age, race, Hispanic origin × industry (tested by focusing Construction)
- [ ] 7c. README, `.gitignore`, commit, push to GitHub (repo name and visibility to confirm first)
- [ ] 8. Final update of this log (ideas: state picker, median wage, margin of error)

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
| 7 | National, latest year (2024) first, then a state picker | Kept v1 simple; the picker was added once the national view worked |
| 8 | "Workforce" = employed + armed forces (`Employment Status:1,2,4,5`) | The unfiltered total includes children and non-workers, which made average wage misleading ($32k vs $66k) |
| 9 | One shared **focus industry** drives the demographic sections | Lets you compare who works in an industry against the whole workforce |
| 10 | Race & ethnicity get their own highlighted card with a "read this first" note | They are two separate Census questions and must not be added together; the card also shows each group's share against its overall share (dark tick) |
| 11 | Show limits next to the data (card captions + "How to read this data" panel) | Survey estimates, mean wages, and group gaps are not proof of cause |
| 12 | State picker filters every query with `State:<id>` in `include`; the choice is kept in the URL (`?state=06`) | The API filters by state without changing the drilldowns, so each section reuses its existing query. The URL makes a view shareable and survives reload |
| 13 | Plain-language messages for non-developers; technical details go to the browser console | The page may be shown as an example, so visitors should never see "HTTP 400" or raw error text. Errors we throw carry a safe message (`UserFacingError`); anything unexpected shows a generic one |
| 14 | Publish to GitHub | Nothing secret in the repo (no key), so safe to share |

## Features
- Workforce size and average earnings (stat cards)
- Industry breakdown: one bar chart (workforce by sector, average wage); click a bar or use the menu to focus an industry
- Gender and age breakdown for the focused industry, with a tick for the overall share
- Race and Hispanic origin breakdown (side by side), with average wage and a "small group" flag
- Education breakdown (six levels, in order, with average wage)
- State picker (50 states, DC, Puerto Rico; defaults to the whole US) that updates every section, with a shareable `?state=` link
- Loading, error (with "Try again", a timeout, and a hint if opened as a file) and no-data states, all worded for non-developers
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

## Message wording (what visitors see)
- Page error: "We couldn't load the data" plus one reason, e.g. "The data service is taking longer than usual to respond. Please try again in a moment." / "We couldn't reach the data service. Please check your internet connection and try again." / "The data service is busy right now..." (HTTP 429) / "...is having trouble right now..." (HTTP 5xx) / "...couldn't understand our request. It may have changed..." (other HTTP errors).
- No data: "No data to show. We didn't find any data for this location and year. Try choosing a different location."
- Card errors: "We couldn't load the gender breakdown. ..." with a "Try again" button.
- Empty chart: "No data is available for this selection."
- State list unavailable: "The list of states isn't available right now, so you're seeing the whole United States."
- Opened as a file: explains how to run `python3 -m http.server`.
- Status codes and raw API errors are only written to the browser console.

## State picker findings
- `GET` with `drilldowns=State` lists 52 places (50 states, DC, Puerto Rico); state IDs look like `04000US06` (last two digits = FIPS code). The list is fetched from the API at startup, not hard-coded.
- Filtering uses the same `include` string: `Year:2024;Employment Status:1,2,4,5;State:04000US06`. No state drilldown is needed for the industry, education or demographic queries.
- Examples checked: California 18.9M workers, $75,706 average; Wyoming 291K workers, $55,617.
- Small states: almost every race and ethnicity group falls under the 250,000-worker "small group" flag, which is honest but noisy; the caption now says so.
- If the state list fails to load, the app logs it and shows national data only. Switching places while a load is in flight is guarded by `loadToken`, and the focused industry is kept if it exists in the new place.

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
- [x] 7c. README, `.gitignore`, commit, pushed to https://github.com/hcarvente/datausa-snapshot
- [x] 9. State picker (list from API, `State:<id>` filter, `?state=` URL, stale-load guard); tested California deep link and a switch to Wyoming
- [x] 10. Friendly messages: rewrote every user-visible error, empty and loading message; tested a bad cube name (error), year 1999 (no data) and a broken state list (falls back to the whole US with a note)
- [ ] 8. Final update of this log (ideas: median wage, margin of error, compare two states)

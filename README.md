# Data USA Snapshot

A small web app, built with plain HTML, CSS, JavaScript and JSON (no frameworks, no build step), that fetches live workforce data from the [Data USA](https://datausa.io) API and shows:

- Workforce size and average earnings (United States, 2024)
- Workforce by industry (bar chart); click an industry to focus on it
- Gender and age breakdown of the focused industry
- Race and Hispanic origin breakdown of the focused industry, compared with the whole workforce
- Education breakdown
- Loading, error (with Retry) and no-data states

It was built as a first project for learning how to fetch data from an API. `prompt.md` is the full planning and build log: decisions, findings, review notes and steps.

## Run it

The app loads `config.json` with `fetch()`, which browsers block for files opened directly, so serve the folder:

```
python3 -m http.server
```

Then open http://localhost:8000.

No API key is needed. Data USA's API is open.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page structure |
| `style.css` | Styling, including the plain-CSS bar charts |
| `app.js` | Fetching, data shaping, rendering, UI states |
| `config.json` | API URL, cube and level names, year, category groupings |
| `prompt.md` | Planning and build log |

## Data and limits

Source: U.S. Census Bureau American Community Survey (ACS) PUMS 5-year estimates, via the Data USA Tesseract API (`pums_5` cube).

- These are survey estimates, not a headcount. "2024" pools 2020–2024. Small groups are noisy.
- "Workforce" means employed people plus armed forces. Each person counts in one industry.
- Average wage is a mean. It includes part-time and part-year workers and is pulled up by high earners.
- Differences between groups are not evidence of cause; age, education, hours and job mix all play a part.
- A group's share in an industry only means over- or under-representation when compared with its share of the whole workforce (the dark tick in the charts).
- Race and Hispanic origin are separate Census questions, so those two charts overlap and can't be added together. Gender is the Census male/female question. Age ranges and the grouping of small categories are choices made in this app (see `config.json`).

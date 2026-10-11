# 🗓️ ShiftFlow — Retail Shift Planner

> A zero-install web app that automatically generates weekly staff schedules for a retail store — every department covered, every contract respected, exported straight to Excel.

![HTML5](https://img.shields.io/badge/HTML5-single_file-E34F26?logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?logo=javascript&logoColor=black)
![Offline](https://img.shields.io/badge/works-offline-2EA043)
![Excel](https://img.shields.io/badge/export-Excel-217346?logo=microsoftexcel&logoColor=white)

🇮🇹 [Documento di progetto (italiano)](./README.it.md)

---

## Why

Building a store's weekly rota by hand means juggling contract hours, rest days, absences and minimum coverage for every department at opening and closing. ShiftFlow does it in one click.

## Features

- ⚙️ **Automatic schedule generation** with hard constraints:
  - exactly the contract hours for every employee (e.g. 40h / 5.5 working days)
  - exact number of rest days — never more
  - minimum coverage per department at opening and closing, every day, even for 1–2 person departments
  - manual absences (sick leave, holidays, permits) always respected
  - never loops forever when a department cannot be covered
- 🧩 **Configurable** employees, departments, shift types, fixed hours and blocked days
- 💾 **Presets** — save and load the whole setup as JSON
- 📊 **Excel export** in the store's own format (morning/afternoon in-out columns + daily total), with department colors, legend and hours check
- 📱 **Mobile friendly** — bottom navigation bar and a single-day view
- 🌙 **Dark theme**, color-coded rest days / holidays / absences
- 🔌 **Works offline** — `Turni-offline.html` has no external dependencies

## Usage

Just open the file in a browser — no install, no server, no build step.

| File | Description |
|---|---|
| `Turni-offline.html` | Latest version, fully offline |
| `shift-planner.html` | Original version (uses ExcelJS from a CDN) |
| `ISTRUZIONI.html` | User guide (Italian) |

## Testing

The scheduling engine is tested by running the real in-page code in Node with a DOM stub:

```bash
node _harness_offline.js 2026-10-12 4          # Turni-offline.html: week start, number of runs
node _harness.js <preset.json> 2026-09-14      # shift-planner.html: hours, rest days, coverage gaps per employee
```

## Privacy

Real staff presets and exported rotas are git-ignored; the repository only contains anonymized data.

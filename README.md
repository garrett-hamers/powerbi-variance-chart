# Atlyn Variance Chart

A free, open-source Power BI custom visual for IBCS-aligned variance analysis. Built as an alternative to ZebraBI with 10 chart types, small multiples, interactive comments, cross-filtering, and drill-down support.

![Power BI](https://img.shields.io/badge/Power_BI-API_5.11.1-yellow)
![License](https://img.shields.io/badge/License-MIT-green)
![Tests](https://img.shields.io/badge/Tests-386_passing-brightgreen)
![Version](https://img.shields.io/badge/Version-1.8.6.0-blue)

---

## Features

### 10 Chart Types

| Chart | Description |
|-------|-------------|
| **Variance** | Side-by-side Actual (solid), Plan (outlined), and Variance bars |
| **Waterfall** | Bridge analysis showing how variances contribute to totals |
| **Column** | Grouped or stacked column chart |
| **Bar** | Horizontal bar chart |
| **Line** | Multi-series line chart with data points |
| **Area** | Filled area chart |
| **Combo** | Column + line overlay |
| **Dot** | Variance dot plot with sized markers |
| **Lollipop** | Horizontal lollipop chart for variance display |
| **Stacked Column** | Stacks additive Actual values; scenario comparisons are shown grouped to avoid false totals |

### IBCS-aligned notation
- Solid fill for Actual values (dark gray `#404040`)
- Outlined/dashed for Plan values
- Hatched pattern for Forecast values
- Light fill for Previous Year
- Green (`#4CAF50`) / Red (`#F44336`) for positive/negative variances

### Small Multiples
- Group data by a dimension to render a grid of charts
- Shared or independent axis scaling
- Configurable grid columns and spacing
- Outer-level legend and comment box

### Interactive Comments
- Numbered markers (①②③) appear on chart bars where comments exist
- Scrollable comment panel with variance icons (▲/▼, ↑/↓, ●)
- Click a bar to highlight its comment card
- Comment text with word-wrap in HTML foreignObject

### Cross-Filtering & Drill-Down
- Click a bar to cross-filter slicers and other visuals on the page
- Ctrl+click for multi-select
- Incoming Power BI highlights dim non-highlighted data without losing context
- Clear-selection button (×) appears when data is selected
- Double-click to drill down through hierarchical categories
- Drill-up button for navigation
- Bookmark persistence for filter state

### Data Labels
- Show values, variance, and percentage
- Label density: All, **Auto**, First & Last, Min & Max, None
- **Auto** measures every label off-DOM and hides categories only where their labels
  would collide with a neighbouring category, always keeping the first, last, minimum
  and maximum. Labels belonging to the same category (for example a grouped column's
  per-series values) are shown or hidden together.
- Configurable decimal places and display units (Auto, K, M, B)
- Negative format: minus sign or parentheses
- Localized runtime labels and format-pane card names (English, German, French, and Japanese resources)
- Pointer and touch-aware tooltips, including modern report-page tooltip support
- On-object formatting hooks for titles and data points

---

## Data Roles

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| **Category** | Grouping | ✅ | Dimension for comparison (Month, Product, etc.) |
| **Values** | Measure | ✅ | Actual performance values |
| **Plan** | Measure | | Budget or target values |
| **Previous Year** | Measure | | Prior year values for YoY comparison |
| **Forecast** | Measure | | Forecast values |
| **Group** | Grouping | | Dimension for small multiples grid |
| **Comments** | Grouping | | Text field for annotations |
| **Tooltips** | Measure | | Additional measures shown in tooltips |

---

## Format Pane Options

| Card | Options |
|------|---------|
| **Chart Settings** | Chart type, comparison mode (vs Plan / vs PY / vs Forecast), invert variance |
| **Title** | Show/hide, text, font size, color, alignment |
| **Data Labels** | Values, variance, percentage, font size, decimal places, display units, negative format, label density (incl. Auto overlap avoidance) |
| **Categories** | Show/hide axis, font size, color, rotation, max width |
| **Legend** | Show/hide, position (top/bottom/left/right), font size |
| **Comments** | Show/hide, variance display, variance icon style, padding, gap, font, marker size/color |
| **Design** | Colors for actual, plan, previous year, forecast, positive/negative variance |
| **Difference Highlighting** | Enable/disable, threshold, highlight positive/negative |
| **Axis Break Marker** | Show/hide a non-destructive marker on the continuous scale, marker value |
| **Analytics: Reference Line** | Show/hide, label, value, color, solid/dashed/dotted style |
| **Top N + Others** | Enable, count, sort by/direction, additive/non-additive semantics, show Others, Others label |
| **Small Multiples** | Grid columns, spacing, show headers, scale mode |
| **Responsive Design** | Enable, minimum chart width |
| **Interaction** | Selection, incoming highlights, tooltips, drilldown, cross-filter mode |

### Variance and completeness semantics

- Percentage variance uses `(Actual - Reference) / abs(Reference) * 100`.
- Invert variance preserves that formula and reverses both displayed variance signs for lower-is-better measures.
- A zero reference is reported as N/A; missing and non-finite values remain unavailable rather than becoming zero.
- Top N ranking can operate on reduced host data, but an Others aggregate is emitted only when the returned data is complete and the measure is additive.
- A Power BI data-reduction warning means ranking is provisional; use model filters to obtain an exact complete result.

### Host data-reduction limit

The categorical mapping requests `top.count: 1000`, which is the host contract for this
visual. A report containing more than 1,000 category rows (and the practical 20K-row
report scenarios that motivated this audit) is therefore reduced before the visual can
rank it. Top N ranking and Others are exact only when the host reports a complete result;
on partial data the visual omits Others and labels the result as provisional. The visual
does not implement segmented fetching and does not claim Microsoft or IBCS certification.

---

## Installation

### From Package
1. Download a published `.pbiviz`, or run `npm run package` and use the generated file in `dist/`
2. In Power BI Desktop → **File → Import → Power BI Visual**
3. Select the downloaded file

### Development

```bash
# Install dependencies
npm ci

# Start dev server (requires Power BI developer mode)
npm start

# Run unit tests
npm test

# Run the full local gate: audit + eslint + typecheck + unit/e2e tests + package
npm run certify
```

There is no hosted CI for this repository. `npm run certify` is the only supported
validation entry point — run it from a clean `npm ci` before considering a change ready.

This repository is engineered as a certification candidate; this README does not claim
that Microsoft has awarded certification. The lowercase `certification` branch must
remain an exact source match for the package under review and should advance only when
a specific package is submitted or resubmitted. Development continues on `master`.

---

## Testing

386 automated unit tests, plus a browser-based end-to-end suite.

| Suite | Coverage |
|-------|----------|
| Layout Engine | Margins, chart area, comments, legends, small multiples, and tiny viewports |
| Data Parser | Model formats, variance math, grouped Top N, null/nonfinite/extreme values |
| Chart Rendering | All ten chart types, signs, labels, shared scales, waterfall reconciliation, high contrast |
| Visual Integration | Rendering events, identities, filters, context menus, keyboard/ARIA, themes, resize/scroll |
| Text Measurement | Memoised width measurement, ellipsis truncation, label collision resolution, Auto density across all ten chart types |
| Certification | Real `npm audit` gate, version consistency across manifests, GUID and API pinning, empty privileges |
| Capabilities Matrix | Every format-pane object/property is declared and reachable |

```bash
npm test
```

### End-to-end (Playwright)

208 browser tests covering accessibility (local axe-core, keyboard, ARIA), context menus,
pointer/touch tooltips, format-pane coverage, theming (light/dark/high-contrast),
performance budgets, and rendering of every chart type.

```bash
npx playwright install chromium   # one time
npm run preview
```

The e2e suite is part of `npm run certify`. Install Chromium once with the command above
before running the release gate.

---

## Tech Stack

- **Power BI Visuals API** 5.11.1
- **Power BI Visuals Tools** 7.2.1
- **D3.js** for SVG rendering
- **Power BI tooltip and on-object utilities** for host-native interactions
- **TypeScript** with strict mode
- **Vitest** + happy-dom for testing
- **Webpack** for bundling

---

## License

[MIT License](LICENSE) — free for personal and commercial use.

---

## Credits

Inspired by [ZebraBI](https://zebrabi.com/) and [IBCS](https://www.ibcs.com/) (International Business Communication Standards).

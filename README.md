# Atlyn Variance Chart

A free, open-source Power BI custom visual for IBCS-compliant variance analysis. Built as an alternative to ZebraBI with 10 chart types, small multiples, interactive comments, cross-filtering, and drill-down support.

![Power BI](https://img.shields.io/badge/Power_BI-API_5.11.1-yellow)
![License](https://img.shields.io/badge/License-MIT-green)
![Tests](https://img.shields.io/badge/Tests-285_passing-brightgreen)
![Version](https://img.shields.io/badge/Version-1.8.2.0-blue)

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
| **Stacked Column** | Stacked column variant |

### IBCS Compliance
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
- Clear-selection button (×) appears when data is selected
- Double-click to drill down through hierarchical categories
- Drill-up button for navigation
- Bookmark persistence for filter state

### Data Labels
- Show values, variance, and percentage
- Label density: All, First & Last, Min & Max, None
- Configurable decimal places and display units (Auto, K, M, B)
- Negative format: minus sign or parentheses

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
| **Data Labels** | Values, variance, percentage, font size, decimal places, display units, negative format, label density |
| **Categories** | Show/hide axis, font size, color, rotation, max width |
| **Legend** | Show/hide, position (top/bottom/left/right), font size |
| **Comments** | Show/hide, variance display, variance icon style, padding, gap, font, marker size/color |
| **Design** | Colors for actual, plan, previous year, forecast, positive/negative variance |
| **Difference Highlighting** | Enable/disable, threshold, highlight positive/negative |
| **Axis Break Marker** | Show/hide a non-destructive marker on the continuous scale, marker value |
| **Top N + Others** | Enable, count, sort by/direction, show Others, Others label |
| **Small Multiples** | Grid columns, spacing, show headers, scale mode |
| **Responsive Design** | Enable, minimum chart width |
| **Interaction** | Selection, tooltips, drilldown, cross-filter mode |

---

## Installation

### From Package
1. Download a published `.pbiviz`, or run `npm run package` and use the generated file in `dist/`
2. In Power BI Desktop → **File → Import → Power BI Visual**
3. Select the downloaded file

### Development

```bash
# Install dependencies
npm install

# Start dev server (requires Power BI developer mode)
npm start

# Run tests
npm test

# Run certification lint/audit and package for distribution
npm run eslint
npm audit
npm run package
```

---

## Testing

285 automated tests across four test files:

| Suite | Coverage |
|-------|----------|
| Layout Engine | Margins, chart area, comments, legends, small multiples, and tiny viewports |
| Data Parser | Model formats, variance math, grouped Top N, null/nonfinite/extreme values |
| Chart Rendering | All ten chart types, signs, labels, shared scales, waterfall reconciliation, high contrast |
| Visual Integration | Rendering events, identities, filters, context menus, keyboard/ARIA, themes, resize/scroll |

```bash
npm test
```

---

## Tech Stack

- **Power BI Visuals API** 5.11.1
- **Power BI Visuals Tools** 7.2.0
- **D3.js** for SVG rendering
- **TypeScript** with strict mode
- **Vitest** + happy-dom for testing
- **Webpack** for bundling

---

## License

[MIT License](LICENSE) — free for personal and commercial use.

---

## Credits

Inspired by [ZebraBI](https://zebrabi.com/) and [IBCS](https://www.ibcs.com/) (International Business Communication Standards).

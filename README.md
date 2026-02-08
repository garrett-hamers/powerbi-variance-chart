# IBCS Variance Chart - Free Power BI Custom Visual

A free, open-source alternative to ZebraBI for Power BI, implementing IBCS (International Business Communication Standards) compliant variance analysis visualizations.

## Features

### Chart Types
- **Variance Chart**: Side-by-side comparison of Budget (outlined), Actual (solid), and Variance bars
- **Waterfall Chart**: Bridge analysis showing how individual variances contribute to the total difference

### IBCS Compliance
- Solid fill for Actual values (dark gray #404040)
- Outlined/dashed for Budget/Plan values
- Green (#4CAF50) for positive variances
- Red (#F44336) for negative variances
- Clean, professional styling

### Format Options
- Configurable chart type (Variance/Waterfall)
- Toggle variance labels on/off
- Show absolute values or percentages
- Customizable IBCS colors
- Adjustable font size and color

## Installation

### From Package
1. Download the `.pbiviz` file from the `dist/` folder
2. In Power BI Desktop, go to **File > Import > Power BI Visual**
3. Select the downloaded `.pbiviz` file

### Development
```bash
# Install dependencies
npm install

# Start development server (requires Power BI developer mode)
npm start

# Package for distribution
npm run package
```

## Usage

1. Add the visual to your report
2. Drag fields to the data wells:
   - **Category**: Your dimension (Month, Department, Product, etc.)
   - **Actual**: Your actual values measure
   - **Budget/Plan**: Your budget or planned values measure

3. Use the Format pane to:
   - Switch between Variance and Waterfall chart modes
   - Customize IBCS colors
   - Toggle labels and percentages

## Data Requirements

| Field | Type | Description |
|-------|------|-------------|
| Category | Dimension | Categories for comparison (e.g., months, departments) |
| Actual | Measure | Actual performance values |
| Budget/Plan | Measure | Target or planned values |

## Roadmap

- [ ] Small multiples support
- [ ] Hierarchical tables (P&L style)
- [ ] Dynamic comments/annotations
- [ ] Drill-down support
- [ ] Tooltips with variance details
- [ ] High contrast mode
- [ ] Keyboard navigation

## License

MIT License - Free for personal and commercial use.

## Credits

Inspired by ZebraBI and IBCS (International Business Communication Standards).

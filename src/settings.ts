/*
 *  Power BI Visualizations - Atlyn Variance Chart Settings
 */

"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import { DEFAULT_IBCS_COLORS } from "./utils/colors";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

function numberRange(min: number, max: number): powerbi.visuals.NumUpDownFormat {
    return {
        minValue: { type: 0, value: min },
        maxValue: { type: 1, value: max }
    };
}

/**
 * Chart Settings Card - Controls chart type and display options
 */
class ChartSettingsCard extends FormattingSettingsCard {
    chartType = new formattingSettings.ItemDropdown({
        name: "chartType",
        displayName: "Chart Type",
        items: [
            { value: "variance", displayName: "Variance Chart" },
            { value: "waterfall", displayName: "Waterfall Chart" },
            { value: "column", displayName: "Column Chart" },
            { value: "columnStacked", displayName: "Stacked Column (additive)" },
            { value: "bar", displayName: "Bar Chart" },
            { value: "line", displayName: "Line Chart" },
            { value: "area", displayName: "Area Chart" },
            { value: "combo", displayName: "Combo Chart" },
            { value: "dot", displayName: "Dot Chart" },
            { value: "lollipop", displayName: "Lollipop Chart" }
        ],
        value: { value: "variance", displayName: "Variance Chart" }
    });

    comparisonType = new formattingSettings.ItemDropdown({
        name: "comparisonType",
        displayName: "Compare Against",
        items: [
            { value: "budget", displayName: "vs Plan" },
            { value: "previousYear", displayName: "vs Previous Year" },
            { value: "forecast", displayName: "vs Forecast" }
        ],
        value: { value: "budget", displayName: "vs Plan" }
    });

    invertVariance = new formattingSettings.ToggleSwitch({
        name: "invertVariance",
        displayName: "Invert Variance (for costs)",
        description: "Flip sign and favorability for cost metrics where lower is better; waterfalls use the mirrored cost perspective",
        value: false
    });

    name: string = "chartSettings";
    displayName: string = "Chart Settings";
    displayNameKey: string = "Card_ChartSettings";
    slices: Array<FormattingSettingsSlice> = [
        this.chartType, 
        this.comparisonType,
        this.invertVariance
    ];
}

/**
 * Title Card - Chart title settings
 */
class TitleCard extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Title",
        value: true
    });

    titleText = new formattingSettings.TextInput({
        name: "titleText",
        displayName: "Title Text",
        placeholder: "Enter title",
        value: ""
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Font Size",
        value: 14,
        options: numberRange(8, 72)
    });

    fontColor = new formattingSettings.ColorPicker({
        name: "fontColor",
        displayName: "Font Color",
        value: { value: "#333333" }
    });

    alignment = new formattingSettings.ItemDropdown({
        name: "alignment",
        displayName: "Alignment",
        items: [
            { value: "left", displayName: "Left" },
            { value: "center", displayName: "Center" },
            { value: "right", displayName: "Right" }
        ],
        value: { value: "left", displayName: "Left" }
    });

    name: string = "title";
    displayName: string = "Title";
    displayNameKey: string = "Card_Title";
    slices: Array<FormattingSettingsSlice> = [
        this.show,
        this.titleText,
        this.fontSize,
        this.fontColor,
        this.alignment
    ];
}

/**
 * Data Labels Card - Value label settings
 */
class DataLabelsCard extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Data Labels",
        value: true
    });

    showValues = new formattingSettings.ToggleSwitch({
        name: "showValues",
        displayName: "Show Values",
        value: true
    });

    showVariance = new formattingSettings.ToggleSwitch({
        name: "showVariance",
        displayName: "Show Variance",
        value: true
    });

    showPercentage = new formattingSettings.ToggleSwitch({
        name: "showPercentage",
        displayName: "Show Percentage",
        value: true
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Font Size",
        value: 10,
        options: numberRange(6, 48)
    });

    decimalPlaces = new formattingSettings.NumUpDown({
        name: "decimalPlaces",
        displayName: "Decimal Places",
        value: 1,
        options: numberRange(0, 20)
    });

    displayUnits = new formattingSettings.ItemDropdown({
        name: "displayUnits",
        displayName: "Display Units",
        items: [
            { value: "auto", displayName: "Auto" },
            { value: "none", displayName: "None" },
            { value: "thousands", displayName: "Thousands (K)" },
            { value: "millions", displayName: "Millions (M)" },
            { value: "billions", displayName: "Billions (B)" }
        ],
        value: { value: "auto", displayName: "Auto" }
    });

    negativeFormat = new formattingSettings.ItemDropdown({
        name: "negativeFormat",
        displayName: "Negative Format",
        items: [
            { value: "minus", displayName: "-1,234" },
            { value: "parentheses", displayName: "(1,234)" }
        ],
        value: { value: "minus", displayName: "-1,234" }
    });

    labelDensity = new formattingSettings.ItemDropdown({
        name: "labelDensity",
        displayName: "Label Density",
        description: "Auto measures each label and hides whole categories only where they would collide with a neighbouring category, always keeping the first, last, minimum and maximum",
        items: [
            { value: "all", displayName: "All" },
            { value: "auto", displayName: "Auto (avoid category overlap)" },
            { value: "firstLast", displayName: "First & Last" },
            { value: "minMax", displayName: "Min & Max" },
            { value: "none", displayName: "None" }
        ],
        value: { value: "all", displayName: "All" }
    });

    name: string = "dataLabels";
    displayName: string = "Data Labels";
    displayNameKey: string = "Card_DataLabels";
    slices: Array<FormattingSettingsSlice> = [
        this.show,
        this.showValues,
        this.showVariance,
        this.showPercentage,
        this.fontSize,
        this.decimalPlaces,
        this.displayUnits,
        this.negativeFormat,
        this.labelDensity
    ];
}

/**
 * Categories Card - X-axis category settings
 */
class CategoriesCard extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Categories",
        value: true
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Font Size",
        value: 10,
        options: numberRange(6, 48)
    });

    fontColor = new formattingSettings.ColorPicker({
        name: "fontColor",
        displayName: "Font Color",
        value: { value: "#666666" }
    });

    rotation = new formattingSettings.ItemDropdown({
        name: "rotation",
        displayName: "Rotation",
        items: [
            { value: "0", displayName: "0°" },
            { value: "-45", displayName: "-45°" },
            { value: "-90", displayName: "-90°" },
            { value: "45", displayName: "45°" },
            { value: "90", displayName: "90°" }
        ],
        value: { value: "-45", displayName: "-45°" }
    });

    maxWidth = new formattingSettings.NumUpDown({
        name: "maxWidth",
        displayName: "Max Width (px)",
        value: 100,
        options: numberRange(0, 1000)
    });

    name: string = "categories";
    displayName: string = "Categories";
    displayNameKey: string = "Card_Categories";
    slices: Array<FormattingSettingsSlice> = [
        this.show,
        this.fontSize,
        this.fontColor,
        this.rotation,
        this.maxWidth
    ];
}

/**
 * Legend Card - Legend display settings
 */
class LegendCard extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Legend",
        value: true
    });

    position = new formattingSettings.ItemDropdown({
        name: "position",
        displayName: "Position",
        items: [
            { value: "top", displayName: "Top" },
            { value: "bottom", displayName: "Bottom" },
            { value: "left", displayName: "Left" },
            { value: "right", displayName: "Right" }
        ],
        value: { value: "right", displayName: "Right" }
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Font Size",
        value: 10,
        options: numberRange(6, 48)
    });

    name: string = "legend";
    displayName: string = "Legend";
    displayNameKey: string = "Card_Legend";
    slices: Array<FormattingSettingsSlice> = [
        this.show,
        this.position,
        this.fontSize
    ];
}

/**
 * Comment Box Card - Annotations display settings
 */
class CommentBoxCard extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Comments",
        value: true
    });

    showVariance = new formattingSettings.ItemDropdown({
        name: "showVariance",
        displayName: "Show variance",
        items: [
            { value: "none", displayName: "None" },
            { value: "absolute", displayName: "Absolute variance" },
            { value: "relative", displayName: "Relative variance" },
            { value: "both", displayName: "Both" }
        ],
        value: { value: "relative", displayName: "Relative variance" }
    });

    varianceIcon = new formattingSettings.ItemDropdown({
        name: "varianceIcon",
        displayName: "Variance icon",
        items: [
            { value: "none", displayName: "None" },
            { value: "triangle", displayName: "Triangle" },
            { value: "circle", displayName: "Circle" },
            { value: "arrow", displayName: "Arrow" }
        ],
        value: { value: "triangle", displayName: "Triangle" }
    });

    padding = new formattingSettings.NumUpDown({
        name: "padding",
        displayName: "Padding",
        value: 6,
        options: numberRange(0, 100)
    });

    gap = new formattingSettings.NumUpDown({
        name: "gap",
        displayName: "Gap between comments",
        value: 8,
        options: numberRange(0, 100)
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Font Size",
        value: 10,
        options: numberRange(6, 48)
    });

    fontColor = new formattingSettings.ColorPicker({
        name: "fontColor",
        displayName: "Font Color",
        value: { value: "#333333" }
    });

    markerSize = new formattingSettings.NumUpDown({
        name: "markerSize",
        displayName: "Marker Size",
        value: 18,
        options: numberRange(4, 64)
    });

    markerColor = new formattingSettings.ColorPicker({
        name: "markerColor",
        displayName: "Marker Color",
        value: { value: "#1a73e8" }
    });

    name: string = "commentBox";
    displayName: string = "Comments";
    displayNameKey: string = "Card_Comments";
    slices: Array<FormattingSettingsSlice> = [
        this.show,
        this.showVariance,
        this.varianceIcon,
        this.padding,
        this.gap,
        this.fontSize,
        this.fontColor,
        this.markerSize,
        this.markerColor
    ];
}

/**
 * Design Card - IBCS Colors
 */
class DesignCard extends FormattingSettingsCard {
    actualColor = new formattingSettings.ColorPicker({
        name: "actualColor",
        displayName: "Actual/Values",
        description: "Color for actual values (IBCS: solid dark)",
        value: { value: DEFAULT_IBCS_COLORS.actual }
    });

    budgetColor = new formattingSettings.ColorPicker({
        name: "budgetColor",
        displayName: "Plan",
        description: "Color for plan values (IBCS: outlined)",
        value: { value: DEFAULT_IBCS_COLORS.budget }
    });

    previousYearColor = new formattingSettings.ColorPicker({
        name: "previousYearColor",
        displayName: "Previous Year",
        description: "Color for previous year values (IBCS: light gray)",
        value: { value: DEFAULT_IBCS_COLORS.previousYear }
    });

    forecastColor = new formattingSettings.ColorPicker({
        name: "forecastColor",
        displayName: "Forecast",
        description: "Color for forecast values (IBCS: hatched)",
        value: { value: DEFAULT_IBCS_COLORS.forecast }
    });

    positiveVarianceColor = new formattingSettings.ColorPicker({
        name: "positiveVarianceColor",
        displayName: "Positive Variance",
        description: "Color for favorable variances (IBCS: green)",
        value: { value: DEFAULT_IBCS_COLORS.positiveVariance }
    });

    negativeVarianceColor = new formattingSettings.ColorPicker({
        name: "negativeVarianceColor",
        displayName: "Negative Variance",
        description: "Color for unfavorable variances (IBCS: red)",
        value: { value: DEFAULT_IBCS_COLORS.negativeVariance }
    });

    name: string = "design";
    displayName: string = "Design";
    displayNameKey: string = "Card_Design";
    slices: Array<FormattingSettingsSlice> = [
        this.actualColor,
        this.budgetColor,
        this.previousYearColor,
        this.forecastColor,
        this.positiveVarianceColor,
        this.negativeVarianceColor
    ];
}

/**
 * Difference Highlighting Card - Variance highlighting settings
 */
class DifferenceHighlightingCard extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Enable Highlighting",
        value: true
    });

    threshold = new formattingSettings.NumUpDown({
        name: "threshold",
        displayName: "Threshold (%)",
        description: "Highlight variances above this percentage",
        value: 10,
        options: numberRange(0, 100)
    });

    highlightPositive = new formattingSettings.ToggleSwitch({
        name: "highlightPositive",
        displayName: "Highlight Positive",
        value: true
    });

    highlightNegative = new formattingSettings.ToggleSwitch({
        name: "highlightNegative",
        displayName: "Highlight Negative",
        value: true
    });

    name: string = "differenceHighlighting";
    displayName: string = "Difference Highlighting";
    displayNameKey: string = "Card_DifferenceHighlighting";
    slices: Array<FormattingSettingsSlice> = [
        this.show,
        this.threshold,
        this.highlightPositive,
        this.highlightNegative
    ];
}

/**
 * Axis Break Marker Card - Marks a value without changing the continuous scale.
 */
class AxisBreakCard extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Axis Break Marker",
        value: false
    });

    breakValue = new formattingSettings.NumUpDown({
        name: "breakValue",
        displayName: "Marker Value",
        value: 0
    });

    name: string = "axisBreak";
    displayName: string = "Axis Break Marker";
    displayNameKey: string = "Card_AxisBreak";
    slices: Array<FormattingSettingsSlice> = [
        this.show,
        this.breakValue
    ];
}

/**
 * Reference line Card - Analytical reference value.
 */
class ReferenceLineCard extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Reference Line",
        value: false
    });

    displayNameProperty = new formattingSettings.TextInput({
        name: "displayName",
        displayName: "Label",
        value: "Reference line",
        placeholder: "Reference line"
    });

    value = new formattingSettings.NumUpDown({
        name: "value",
        displayName: "Value",
        value: 0
    });

    color = new formattingSettings.ColorPicker({
        name: "color",
        displayName: "Color",
        value: { value: "#808080" }
    });

    style = new formattingSettings.ItemDropdown({
        name: "style",
        displayName: "Style",
        items: [
            { value: "solid", displayName: "Solid" },
            { value: "dashed", displayName: "Dashed" },
            { value: "dotted", displayName: "Dotted" }
        ],
        value: { value: "dashed", displayName: "Dashed" }
    });

    name: string = "referenceLine";
    displayName: string = "Reference Line";
    displayNameKey: string = "Card_ReferenceLine";
    analyticsPane = true;
    topLevelSlice = this.show;
    slices: Array<FormattingSettingsSlice> = [
        this.displayNameProperty,
        this.value,
        this.color,
        this.style
    ];
}

/**
 * Interaction Card - User interaction settings
 */
class InteractionCard extends FormattingSettingsCard {
    enableSelection = new formattingSettings.ToggleSwitch({
        name: "enableSelection",
        displayName: "Enable Selection",
        value: true
    });

    enableTooltips = new formattingSettings.ToggleSwitch({
        name: "enableTooltips",
        displayName: "Enable Tooltips",
        value: true
    });

    enableDrilldown = new formattingSettings.ToggleSwitch({
        name: "enableDrilldown",
        displayName: "Enable Drilldown",
        value: true
    });

    crossFilterMode = new formattingSettings.ItemDropdown({
        name: "crossFilterMode",
        displayName: "Cross-Filter Mode",
        description: "Highlight dims other visuals; Filter removes non-matching rows",
        items: [
            { value: "highlight", displayName: "Highlight" },
            { value: "filter", displayName: "Filter" }
        ],
        value: { value: "highlight", displayName: "Highlight" }
    });

    name: string = "interaction";
    displayName: string = "Interaction";
    displayNameKey: string = "Card_Interaction";
    slices: Array<FormattingSettingsSlice> = [
        this.enableSelection,
        this.enableTooltips,
        this.enableDrilldown,
        this.crossFilterMode
    ];
}

/**
 * About Card - Visual information
 */
class AboutCard extends FormattingSettingsCard {
    version = new formattingSettings.TextInput({
        name: "version",
        displayName: "Version",
        value: "1.8.4.0",
        placeholder: ""
    });

    name: string = "about";
    displayName: string = "About";
    displayNameKey: string = "Card_About";
    slices: Array<FormattingSettingsSlice> = [this.version];
}

/**
 * Top N Card - Top N + Others grouping
 */
class TopNCard extends FormattingSettingsCard {
    enable = new formattingSettings.ToggleSwitch({
        name: "enable",
        displayName: "Enable Top N",
        value: false
    });

    count = new formattingSettings.NumUpDown({
        name: "count",
        displayName: "Show Top N",
        value: 10,
        options: numberRange(1, 1000)
    });

    sortBy = new formattingSettings.ItemDropdown({
        name: "sortBy",
        displayName: "Sort By",
        items: [
            { value: "value", displayName: "Value" },
            { value: "name", displayName: "Name" },
            { value: "variance", displayName: "Variance" }
        ],
        value: { value: "value", displayName: "Value" }
    });

    sortDirection = new formattingSettings.ItemDropdown({
        name: "sortDirection",
        displayName: "Sort Direction",
        items: [
            { value: "desc", displayName: "Descending" },
            { value: "asc", displayName: "Ascending" }
        ],
        value: { value: "desc", displayName: "Descending" }
    });

    showOthers = new formattingSettings.ToggleSwitch({
        name: "showOthers",
        displayName: "Show Others",
        value: true
    });

    othersLabel = new formattingSettings.TextInput({
        name: "othersLabel",
        displayName: "Others Label",
        value: "Others",
        placeholder: "Others"
    });

    name: string = "topN";
    displayName: string = "Top N + Others";
    displayNameKey: string = "Card_TopN";
    slices: Array<FormattingSettingsSlice> = [
        this.enable,
        this.count,
        this.sortBy,
        this.sortDirection,
        this.showOthers,
        this.othersLabel
    ];
}

/**
 * Small Multiples Card
 */
class SmallMultiplesCard extends FormattingSettingsCard {
    columns = new formattingSettings.NumUpDown({
        name: "columns",
        displayName: "Columns",
        description: "Number of columns in the grid (0 = auto)",
        value: 0,
        options: numberRange(0, 20)
    });

    spacing = new formattingSettings.NumUpDown({
        name: "spacing",
        displayName: "Spacing (px)",
        value: 10,
        options: numberRange(0, 100)
    });

    showHeaders = new formattingSettings.ToggleSwitch({
        name: "showHeaders",
        displayName: "Show Headers",
        value: true
    });

    scaleMode = new formattingSettings.ItemDropdown({
        name: "scaleMode",
        displayName: "Scale Mode",
        items: [
            { value: "shared", displayName: "Shared (same scale)" },
            { value: "independent", displayName: "Independent" }
        ],
        value: { value: "shared", displayName: "Shared (same scale)" }
    });

    name: string = "smallMultiples";
    displayName: string = "Small Multiples";
    displayNameKey: string = "Card_SmallMultiples";
    slices: Array<FormattingSettingsSlice> = [
        this.columns,
        this.spacing,
        this.showHeaders,
        this.scaleMode
    ];
}

/**
 * Responsive Card
 */
class ResponsiveCard extends FormattingSettingsCard {
    enable = new formattingSettings.ToggleSwitch({
        name: "enable",
        displayName: "Responsive Layout",
        value: true
    });

    minChartWidth = new formattingSettings.NumUpDown({
        name: "minChartWidth",
        displayName: "Min Chart Width (px)",
        value: 150,
        options: numberRange(40, 2000)
    });

    name: string = "responsive";
    displayName: string = "Responsive Design";
    displayNameKey: string = "Card_Responsive";
    slices: Array<FormattingSettingsSlice> = [
        this.enable,
        this.minChartWidth
    ];
}

/**
 * Visual settings model class
 */
export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    chartSettingsCard = new ChartSettingsCard();
    titleCard = new TitleCard();
    dataLabelsCard = new DataLabelsCard();
    categoriesCard = new CategoriesCard();
    legendCard = new LegendCard();
    commentBoxCard = new CommentBoxCard();
    designCard = new DesignCard();
    differenceHighlightingCard = new DifferenceHighlightingCard();
    axisBreakCard = new AxisBreakCard();
    referenceLineCard = new ReferenceLineCard();
    topNCard = new TopNCard();
    smallMultiplesCard = new SmallMultiplesCard();
    responsiveCard = new ResponsiveCard();
    interactionCard = new InteractionCard();
    aboutCard = new AboutCard();

    // Backwards compatibility alias
    get ibcsColorsCard() { return this.designCard; }

    cards = [
        this.chartSettingsCard,
        this.titleCard,
        this.dataLabelsCard,
        this.categoriesCard,
        this.legendCard,
        this.commentBoxCard,
        this.designCard,
        this.differenceHighlightingCard,
        this.axisBreakCard,
        this.referenceLineCard,
        this.topNCard,
        this.smallMultiplesCard,
        this.responsiveCard,
        this.interactionCard,
        this.aboutCard
    ];
}

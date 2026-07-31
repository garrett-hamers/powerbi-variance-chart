import powerbi from "powerbi-visuals-api";

import ILocalizationManager = powerbi.extensibility.ILocalizationManager;

export interface VisualLabels {
    visualName: string;
    chartDescription: string;
    category: string;
    actual: string;
    plan: string;
    previousYear: string;
    forecast: string;
    positiveVariance: string;
    negativeVariance: string;
    varianceTo: string;
    comments: string;
    clearSelection: string;
    drillUp: string;
    selected: string;
    filterUpdated: string;
    filterCleared: string;
    selectionCleared: string;
    interactionError: string;
    addData: string;
    addActual: string;
    noActual: string;
    addComparison: string;
    noComparison: string;
    renderError: string;
    dataReducedTitle: string;
    dataReducedMessage: string;
    zeroBaseTitle: string;
    zeroBaseMessage: string;
    scenarioGroupedTitle: string;
    scenarioGroupedMessage: string;
}

const DEFAULT_LABELS: VisualLabels = {
    visualName: "Atlyn Variance Chart",
    chartDescription: "Interactive variance analysis chart",
    category: "Category",
    actual: "Actual",
    plan: "Plan",
    previousYear: "Previous Year",
    forecast: "Forecast",
    positiveVariance: "+Variance",
    negativeVariance: "−Variance",
    varianceTo: "Variance to",
    comments: "Chart comments",
    clearSelection: "Clear selection",
    drillUp: "Drill up",
    selected: "selected.",
    filterUpdated: "filter updated.",
    filterCleared: "Filter cleared.",
    selectionCleared: "Selection cleared.",
    interactionError: "The interaction could not be completed.",
    addData: "Add data to begin.",
    addActual: "Add Category and Actual fields to start",
    noActual: "Add at least one finite Actual value.",
    addComparison: "Add Plan, Previous Year, or Forecast for variance analysis.",
    noComparison: "No comparison available",
    renderError: "The visual could not be rendered.",
    dataReducedTitle: "Data reduction applied",
    dataReducedMessage: "Power BI reduced the data returned to the visual. Use Top N or filters to focus the analysis.",
    zeroBaseTitle: "Percentage variance unavailable",
    zeroBaseMessage: "One or more comparison values are zero, so percentage variance is shown as N/A.",
    scenarioGroupedTitle: "Comparison shown grouped",
    scenarioGroupedMessage: "Actual and comparison values are scenarios, not additive components, so this chart shows them side by side."
};

const LABEL_KEYS: Record<keyof VisualLabels, string> = {
    visualName: "Visual_Name",
    chartDescription: "Visual_Description",
    category: "Role_Category",
    actual: "Label_Actual",
    plan: "Label_Plan",
    previousYear: "Label_PreviousYear",
    forecast: "Label_Forecast",
    positiveVariance: "Label_PositiveVariance",
    negativeVariance: "Label_NegativeVariance",
    varianceTo: "Label_VarianceTo",
    comments: "Label_Comments",
    clearSelection: "Action_ClearSelection",
    drillUp: "Action_DrillUp",
    selected: "Status_Selected",
    filterUpdated: "Status_FilterUpdated",
    filterCleared: "Status_FilterCleared",
    selectionCleared: "Status_SelectionCleared",
    interactionError: "Status_InteractionError",
    addData: "Status_AddData",
    addActual: "Status_AddActual",
    noActual: "Status_NoActual",
    addComparison: "Status_AddComparison",
    noComparison: "Status_NoComparison",
    renderError: "Status_RenderError",
    dataReducedTitle: "Warning_DataReducedTitle",
    dataReducedMessage: "Warning_DataReducedMessage",
    zeroBaseTitle: "Warning_ZeroBaseTitle",
    zeroBaseMessage: "Warning_ZeroBaseMessage",
    scenarioGroupedTitle: "Warning_ScenarioGroupedTitle",
    scenarioGroupedMessage: "Warning_ScenarioGroupedMessage"
};

export class VisualLocalizer {
    private readonly labels: VisualLabels;

    constructor(localizationManager?: ILocalizationManager) {
        this.labels = { ...DEFAULT_LABELS };
        if (!localizationManager) return;

        (Object.keys(LABEL_KEYS) as Array<keyof VisualLabels>).forEach(key => {
            const localized = localizationManager.getDisplayName(LABEL_KEYS[key]);
            if (localized && localized !== LABEL_KEYS[key]) {
                this.labels[key] = localized;
            }
        });
    }

    public get(key: keyof VisualLabels): string {
        return this.labels[key];
    }

    public all(): VisualLabels {
        return { ...this.labels };
    }
}

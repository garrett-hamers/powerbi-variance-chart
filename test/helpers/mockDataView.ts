/**
 * Mock DataView builder for testing.
 * Generates objects matching the Power BI DataView shape without
 * requiring the actual Power BI runtime.
 */

export interface MockDataInput {
    categories: string[];
    actual: number[];
    budget?: number[];
    previousYear?: number[];
    forecast?: number[];
    tooltipMeasures?: Array<{
        displayName: string;
        values: Array<string | number | boolean | null | undefined>;
    }>;
    comments?: string[];
    groups?: string[];
}

/**
 * Build a mock DataView from simple arrays.
 * The returned object matches the shape consumed by parseDataView().
 */
export function buildMockDataView(input: MockDataInput): any {
    const categoryColumn = {
        source: {
            displayName: "Category",
            queryName: "Table.Category",
            type: { text: true },
            roles: { category: true }
        },
        values: input.categories
    };

    const allCategories: any[] = [categoryColumn];

    if (input.groups) {
        allCategories.push({
            source: {
                displayName: "Group",
                queryName: "Table.Group",
                type: { text: true },
                roles: { group: true }
            },
            values: input.groups
        });
    }

    if (input.comments) {
        allCategories.push({
            source: {
                displayName: "Comments",
                queryName: "Table.Comments",
                type: { text: true },
                roles: { comments: true }
            },
            values: input.comments
        });
    }

    const valueColumns: any[] = [];

    valueColumns.push({
        source: {
            displayName: "Actual",
            queryName: "Table.Actual",
            roles: { actual: true }
        },
        values: input.actual
    });

    if (input.budget) {
        valueColumns.push({
            source: {
                displayName: "Budget",
                queryName: "Table.Budget",
                roles: { budget: true }
            },
            values: input.budget
        });
    }

    if (input.previousYear) {
        valueColumns.push({
            source: {
                displayName: "Previous Year",
                queryName: "Table.PreviousYear",
                roles: { previousYear: true }
            },
            values: input.previousYear
        });
    }

    if (input.forecast) {
        valueColumns.push({
            source: {
                displayName: "Forecast",
                queryName: "Table.Forecast",
                roles: { forecast: true }
            },
            values: input.forecast
        });
    }

    if (input.tooltipMeasures) {
        input.tooltipMeasures.forEach((measure, index) => {
            valueColumns.push({
                source: {
                    displayName: measure.displayName,
                    queryName: `Table.Tooltip${index + 1}`,
                    roles: { tooltips: true }
                },
                values: measure.values
            });
        });
    }

    const columns = allCategories.map(c => c.source).concat(valueColumns.map(v => v.source));

    return {
        categorical: {
            categories: allCategories,
            values: valueColumns
        },
        metadata: {
            columns
        }
    };
}

/**
 * Build an empty DataView (no categories).
 */
export function buildEmptyDataView(): any {
    return {
        categorical: {
            categories: [],
            values: []
        },
        metadata: { columns: [] }
    };
}

/**
 * Build a DataView with no value columns (categories only).
 */
export function buildCategoriesOnlyDataView(categories: string[]): any {
    return {
        categorical: {
            categories: [{
                source: {
                    displayName: "Category",
                    queryName: "Table.Category",
                    type: { text: true },
                    roles: { category: true }
                },
                values: categories
            }],
            values: []
        },
        metadata: { columns: [] }
    };
}

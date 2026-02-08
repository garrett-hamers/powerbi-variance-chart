/**
 * Chart Registry - Factory for creating chart instances
 */
export { 
    BaseChart, 
    ChartSettings, 
    ChartDimensions,
    TitleSettings,
    DataLabelSettings,
    CategorySettings,
    LegendSettings,
    CommentBoxSettings,
    DifferenceHighlightSettings,
    ChartLayout,
    Rect
} from "./baseChart";
export { VarianceChart } from "./varianceChart";
export { WaterfallChart } from "./waterfallChart";
export { ColumnChart } from "./columnChart";
export { LineChart } from "./lineChart";
export { AreaChart } from "./areaChart";
export { ComboChart } from "./comboChart";
export { BarChart } from "./barChart";
export { DotChart } from "./dotChart";
export { LollipopChart } from "./lollipopChart";

import * as d3 from "d3";
import { BaseChart, ChartSettings, ChartDimensions } from "./baseChart";
import { VarianceChart } from "./varianceChart";
import { WaterfallChart } from "./waterfallChart";
import { ColumnChart } from "./columnChart";
import { LineChart } from "./lineChart";
import { AreaChart } from "./areaChart";
import { ComboChart } from "./comboChart";
import { BarChart } from "./barChart";
import { DotChart } from "./dotChart";
import { LollipopChart } from "./lollipopChart";
import { ParsedData } from "../dataParser";

export type ChartType = 
    | "variance" 
    | "waterfall" 
    | "column" 
    | "columnStacked" 
    | "bar" 
    | "line" 
    | "area" 
    | "combo" 
    | "dot"
    | "lollipop";

export function createChart(
    chartType: ChartType,
    container: d3.Selection<SVGGElement, unknown, null, undefined>,
    data: ParsedData,
    settings: ChartSettings,
    dimensions: ChartDimensions
): BaseChart {
    switch (chartType) {
        case "variance":
            return new VarianceChart(container, data, settings, dimensions);
        
        case "waterfall":
            return new WaterfallChart(container, data, settings, dimensions);
        
        case "column":
            return new ColumnChart(container, data, settings, dimensions, false);
        
        case "columnStacked":
            return new ColumnChart(container, data, settings, dimensions, true);
        
        case "bar":
            return new BarChart(container, data, settings, dimensions);
        
        case "line":
            return new LineChart(container, data, settings, dimensions);
        
        case "area":
            return new AreaChart(container, data, settings, dimensions);
        
        case "combo":
            return new ComboChart(container, data, settings, dimensions);

        case "dot":
            return new DotChart(container, data, settings, dimensions);
        
        case "lollipop":
            return new LollipopChart(container, data, settings, dimensions);
        
        default:
            return new VarianceChart(container, data, settings, dimensions);
    }
}

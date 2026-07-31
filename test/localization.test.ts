import { describe, expect, it } from "vitest";
import { VisualLocalizer } from "../src/utils/localization";

describe("VisualLocalizer", () => {
    it("uses host translations and keeps English fallbacks for missing keys", () => {
        const localizer = new VisualLocalizer({
            getDisplayName: key => key === "Label_Actual" ? "Réel" : key
        });

        expect(localizer.get("actual")).toBe("Réel");
        expect(localizer.get("plan")).toBe("Plan");
        expect(localizer.get("dataReducedTitle")).toBe("Data reduction applied");
    });
});

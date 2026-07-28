import powerbiVisualsConfigs from "eslint-plugin-powerbi-visuals";

export default [
    powerbiVisualsConfigs.configs.recommended,
    {
        ignores: [
            "node_modules/**",
            "dist/**",
            ".vscode/**",
            ".tmp/**",
            "coverage/**",
            "test-results/**",
            "e2e/visual-harness-bundle.js",
        ],
    },
    {
        files: ["test/**", "e2e/**", "scripts/**", "*.config.ts"],
        rules: {
            "powerbi-visuals/non-literal-fs-path": "off",
            "powerbi-visuals/insecure-random": "off",
            "powerbi-visuals/no-inner-outer-html": "off",
        },
    },
];
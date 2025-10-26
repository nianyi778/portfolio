Schemas

- config.schema.json — JSON schema for config.json input (baseCurrency, fxRates, assets)
- prices.schema.json — JSON schema for data/prices.json output (prices, fx)

Usage (local validation example)
- With ajv (Node): ajv validate -s schemas/config.schema.json -d data/config.json
- With vscode: install a JSON schema extension and map file to schema id


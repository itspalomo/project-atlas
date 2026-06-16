# Nutrition Integration

Nutrition data enters Atlas through the iOS bridge as structured intake facts.

Atlas intentionally does not run a full food database, recipe planner, or local MCP server. The iOS bridge or another local tool can estimate intake from:

- Manual meal logging.
- A nutrition label scan.
- A photo estimate.
- A third-party food logging app.
- A local USDA FoodData Central lookup.

Atlas stores the result as summaries and optional meal entries:

- Daily calories.
- Protein, carbohydrates, fat, fiber.
- Optional sugar, sodium, and water.
- Source and confidence.

Agents should treat low-confidence or photo-estimated meals as approximate context, not precise measurements.

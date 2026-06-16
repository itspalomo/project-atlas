# Nutrition Model

Atlas stores nutrition intake as structured facts so agents can reason about coaching, training recovery, and habit consistency without needing raw food logs in memory.

## Scope

In v1, Atlas accepts:

- Daily intake summaries.
- Optional meal entries.
- Calories, protein, carbohydrate, fat, fiber, sugar, sodium, and water.
- Source and confidence metadata.

Atlas does not provide medical nutrition therapy, eating-disorder treatment, or disease-specific diet prescriptions. Agents should escalate or recommend professional care when requests involve medical conditions, severe restriction, disordered eating, pregnancy, pediatric nutrition, or medication interactions.

## Science-Backed Defaults

Use simple, stable principles:

- Favor dietary patterns built around nutrient-dense foods.
- Treat calories and protein as useful coaching signals, not moral judgments.
- Prefer trend windows over one-day reactions.
- Ask for user goals and constraints before recommending targets.
- Use confidence metadata. A label scan is usually stronger evidence than a rough photo estimate.

Useful reference anchors:

- [USDA FoodData Central](https://fdc.nal.usda.gov/) for food composition data and local lookup tools.
- [FoodData Central API Guide](https://fdc.nal.usda.gov/api-guide) if a local iOS-side tool needs nutrient lookup.
- [Dietary Guidelines for Americans](https://www.dietaryguidelines.gov/) for broad dietary-pattern guidance.
- [NIH Office of Dietary Supplements nutrient recommendations](https://ods.od.nih.gov/HealthInformation/nutrientrecommendations.aspx) for DRI-based planning references.

## Bridge Payloads

Daily summary:

```json
{
  "userId": "user-one",
  "date": "2026-06-16",
  "source": "ios_bridge",
  "energyKcal": 2150,
  "proteinG": 155,
  "carbsG": 210,
  "fatG": 72,
  "fiberG": 28,
  "waterMl": 2400,
  "mealCount": 4,
  "confidence": 0.85,
  "generatedAt": "2026-06-17T04:00:00.000Z"
}
```

Meal entry:

```json
{
  "userId": "user-one",
  "consumedAt": "2026-06-16T19:30:00.000Z",
  "mealType": "dinner",
  "source": "nutrition_label",
  "description": "Chicken bowl",
  "energyKcal": 620,
  "proteinG": 48,
  "carbsG": 58,
  "fatG": 20,
  "fiberG": 8,
  "confidence": 0.9
}
```

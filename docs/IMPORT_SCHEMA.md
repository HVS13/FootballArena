# Import Schema

This file defines the supported player import formats for the first iteration. The DataImportAgent accepts JSON or CSV files.

## JSON Format

The recommended JSON format uses a top-level `teams` array:

```json
{
  "teams": [
    {
      "name": "Team A",
      "players": [
        {
          "id": "10",
          "name": "Player Name",
          "positions": ["ST", "AM"],
          "attributes": {
            "Finishing": 15,
            "Pace": 14,
            "Stamina": 13
          }
        }
      ]
    }
  ]
}
```

You may also provide a top-level `players` array (single team), but `teams` is preferred.

Attribute values can be on a 1-20 scale or 0-100 scale. Values on 1-20 are scaled to 0-100 automatically.

## CSV Format

The CSV format uses a header row. Minimum columns:

- `team` (optional, defaults to "Team A")
- `name` (required)
- `positions` (required, separated by `|`, `;`, or `/`)
- One column per attribute (use Football Manager attribute names)

Example:

```csv
team,name,positions,Finishing,Pace,Stamina
Team A,Player Name,ST|AM,15,14,13
```

Missing required attributes will trigger validation errors.

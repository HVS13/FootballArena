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
          "shirtNo": 10,
          "age": 27,
          "heightCm": 182,
          "weightKg": 77,
          "leftFoot": 55,
          "rightFoot": 90,
          "nationality": "Indonesia",
          "positions": ["ST", "AM"],
          "playstyles": ["Power Shot", "Rapid"],
          "playstylesPlus": ["Finesse Shot"],
          "playerTraits": ["Shoots From Distance", "Runs With Ball Often"],
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

Playstyles are optional. You can provide a list of EA FC PlayStyle names or ids in `playstyles` and `playstylesPlus`.

Player traits are optional. Use the trait names or ids listed in `src/data/playerTraits.ts`. Provide them as `playerTraits` (JSON) or `playerTraits`/`traits` columns in CSV.

## CSV Format

The CSV format uses a header row. Minimum columns:

- `team` (optional, defaults to "Team A")
- `name` (required)
- `positions` (required, separated by `|`, `;`, or `/`)
- One column per attribute (use Football Manager attribute names)

Optional playstyle columns:

- `playstyles` (separated by `|`, `;`, or `/`)
- `playstylesPlus` (separated by `|`, `;`, or `/`)

Optional player profile columns:

- `shirtNo`
- `age`
- `heightCm`
- `weightKg`
- `leftFoot`
- `rightFoot`
- `nationality`
- `playerTraits` (separated by `|`, `;`, or `/`)

Example:

```csv
team,name,shirtNo,age,heightCm,weightKg,leftFoot,rightFoot,nationality,positions,playstyles,playstylesPlus,playerTraits,Finishing,Pace,Stamina
Team A,Player Name,10,27,182,77,55,90,Indonesia,ST|AM,Power Shot|Rapid,Finesse Shot,Shoots From Distance|Runs With Ball Often,15,14,13
```

Missing required attributes will trigger validation errors.

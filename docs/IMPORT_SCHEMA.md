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

Player profile fields `age`, `heightCm`, `weightKg`, `leftFoot`, `rightFoot`, and `nationality` are required for every player.

Playstyles can be provided as EA FC PlayStyle names or ids in `playstyles` and `playstylesPlus`. If a player has none, omit the fields or use empty arrays.

Player traits use the trait names or ids listed in `src/data/playerTraits.ts`. Provide them as `playerTraits` (JSON) or `playerTraits`/`traits` columns in CSV. If a player has none, omit the fields or leave them blank.

## CSV Format

The CSV format uses a header row. Minimum columns:

- `team` (defaults to "Team A" if omitted)
- `name` (required)
- `positions` (required, separated by `|`, `;`, or `/`)
- `age`
- `heightCm`
- `weightKg`
- `leftFoot`
- `rightFoot`
- `nationality`
- One column per attribute (use Football Manager attribute names)

Playstyle columns (omit if none):

- `playstyles` (separated by `|`, `;`, or `/`)
- `playstylesPlus` (separated by `|`, `;`, or `/`)

Player profile columns:

- `shirtNo`
- `playerTraits` (separated by `|`, `;`, or `/`, omit if none)

Example:

```csv
team,name,shirtNo,age,heightCm,weightKg,leftFoot,rightFoot,nationality,positions,playstyles,playstylesPlus,playerTraits,Finishing,Pace,Stamina
Team A,Player Name,10,27,182,77,55,90,Indonesia,ST|AM,Power Shot|Rapid,Finesse Shot,Shoots From Distance|Runs With Ball Often,15,14,13
```

Missing required attributes will trigger validation errors.

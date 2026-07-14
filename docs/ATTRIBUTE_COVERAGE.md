# Player data coverage

This audit covers the 55 imported player attributes in `src/data/referenceData.json`.

## Gameplay attributes

Forty-eight attributes are read directly by the simulation. They affect passing, shooting, carrying, first touch, positioning, pressing, tackling, aerial play, goalkeeper outcomes, set pieces, movement, fatigue, morale, injuries, discipline, consistency, experience, and physical contests.

The engine reads each attribute once through its decision or execution context. Traits and PlayStyles then apply bounded modifiers to that result. They are not copied into the base attribute value.

## Reserved goalkeeper attributes

These seven imported attributes are validated and retained but do not yet change v0.1 match outcomes:

- `communication`
- `concentration`
- `eccentricity`
- `kicking`
- `rushing_out`
- `tendency_to_punch`
- `throwing`

They are reserved for a later goalkeeper distribution and box-control model. The UI and documentation must not claim that these six fields currently affect results.

## Profile data

Age, height, weight, foot ratings, nationality, shirt number, positions, traits, and PlayStyles are not part of the 55-attribute count. Age, physical profile, foot ratings, traits, and PlayStyles affect simulation behavior. Nationality and shirt number are presentation data. Imported positions support setup and roster review.

## Audit method

Coverage is checked against literal attribute IDs used under `src/agents`. Any new reference attribute must be classified here as gameplay, setup-only, or reserved before release.

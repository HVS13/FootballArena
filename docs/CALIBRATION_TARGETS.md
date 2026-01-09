# Calibration Targets

Use these ranges when tuning match realism. They describe typical totals for a 90-minute match between similar quality teams at default settings.
Treat the ranges as broad guidance, not strict gates. Tactics, match importance, and randomness can push totals outside these bands.

## Match Totals (per team, 90 minutes)

- Passes attempted: 250-750
- Pass accuracy: 55%-95%
- Shots: 4-24
- Shots on target: 1-10
- Goals: 0-6
- xG: 0.3-3.5
- Tackles won: 10-45
- Interceptions: 6-30
- Fouls: 5-28
- Yellow cards: 0-5
- Red cards: 0-1
- Corners: 1-12
- Offsides: 0-8

## Team Balance (match total)

- Possession split: 35%-65% unless tactics are extreme.
- Fatigue (average player): 0.2-0.7 by full time.
- Injury knocks: 0-3 (short-term knocks, not long injuries).

## Notes

- Counter-attacking systems can lower possession and raise directness.
- High press increases fatigue, interceptions, and fouls.
- Heavy pitch or bad weather lowers pass accuracy and shot quality.
- Run a full-match calibration report with `npm run calibrate:full`.

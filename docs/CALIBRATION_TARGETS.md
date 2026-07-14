# Calibration Targets

Use these ranges when tuning match realism. They describe typical totals for a 90-minute match between similar quality teams at default settings.
The full calibration suite requires at least 80% of equal-team samples to fall inside each enforced band. Tactics, match importance, and randomness can still push individual matches outside a band.

## Match Totals (per team, 90 minutes)

- Passes attempted: 300-750
- Pass accuracy: 55%-90%
- Shots: 5-30
- Shots on target: 1-10
- Goals: 0-6
- xG: 0.3-3.5
- Tackles won: 10-45
- Interceptions: 3-30
- Fouls: 5-28
- Yellow cards: 0-5
- Red cards: 0-2
- Corners: 0-12
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
- The release gate uses five fixed seeds, producing ten per-team samples at the production 20 Hz tick rate.

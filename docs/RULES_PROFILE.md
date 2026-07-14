# Standard 90 rules profile

Football Arena v0.1 models a practical subset of association football rules. It does not claim complete IFAB Laws compliance.

## Modeled

- Two 45-minute halves, halftime, stoppage time, and full time.
- Kick-offs, throw-ins, corners, goal kicks, free kicks, and penalties.
- Offside decisions, with exemptions for kick-offs, goal kicks, throw-ins, and corners.
- Fouls, advantage, yellow cards, second-yellow dismissals, and direct red cards.
- Five substitutions in at most three in-play substitution windows. Halftime changes do not consume a window.
- A match is abandoned when a team falls below seven eligible players.
- Match state freezes after full time.

## Simplified

- Contact, handball, deliberate play, goalkeeper handling, and foul severity use simulation probabilities rather than exhaustive law clauses.
- Stoppage time is event-based but uses approximate delay values.
- Free kicks do not expose every direct-versus-indirect technical distinction to the player.
- Offside involvement is evaluated around the intended receiver, not every possible interference case.
- Restart placement is spatially approximate.

## Deferred

- Extra time and penalty shoot-outs.
- Temporary concussion substitutions and competition-specific substitution variants.
- Dropped-ball edge cases, encroachment retakes, goalkeeper time sanctions, and referee review systems.

## Verification sources

The profile was checked against the current IFAB Laws sections for match duration, players, offside, and fouls and misconduct. The implementation remains intentionally narrower than those Laws.

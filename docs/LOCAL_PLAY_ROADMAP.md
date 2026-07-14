# Football Arena Local Play Roadmap

## 1. Product intent

Football Arena v0.1 is a local, manager-style football simulation for one or two people using the same device.

The player does not directly control footballers. Each side configures a team, formation, roles, duties, instructions, set pieces, and match environment. The match engine then resolves play from player data and tactical choices. During the match, users can pause, change speed, review commentary and statistics, and make substitutions.

The first release must prioritize a trustworthy match simulation and a complete local match loop. It should not prioritize online play, 3D graphics, or a complex animated match viewer.

## 2. v0.1 product decisions

These decisions remove ambiguity from the current documentation.

1. The primary match experience is text-based commentary, team condition summaries, and live statistics.
2. The tactics board keeps its pitch visualization because spatial setup requires it.
3. The animated 2D match pitch is not a v0.1 release requirement. It can be reintroduced after the text-first experience is stable.
4. Supported local modes are Human vs Human, Human vs AI, and AI vs AI for testing and spectating.
5. A human-controlled team means the user controls setup, tactics, and substitutions. The simulation still controls individual player actions.
6. The standard rules profile uses two 45-minute halves, event-based stoppage time, a halftime interval, five substitutions in three opportunities, and halftime substitutions that do not consume an opportunity.
7. Extra time, penalty shoot-outs, online multiplayer, tournaments, careers, transfers, and long-term injuries are outside v0.1.
8. Imported teams are optional for a first match. The application must include valid built-in sample teams so a new user can play immediately.
9. Match outcomes must be reproducible from a recorded random seed, match setup, tuning version, and engine version.
10. A production build, automated tests, calibration gates, and a complete full-time summary are release blockers.

## 3. Complete local player journey

### 3.1 Start

The landing route offers:

- Quick Match with built-in teams.
- Import Teams from CSV or JSON.
- Restore Last Setup when a locally saved setup exists.
- A concise explanation that this is a manager simulation, not direct player control.

### 3.2 Team setup

Each side can:

- Select Human or AI control.
- Choose a team and valid starting eleven.
- Select up to nine substitutes.
- Choose a formation.
- Assign players to positions.
- Assign valid roles and duties.
- Apply or edit team instructions.
- Configure set-piece preferences.
- Select primary and secondary kit colors.
- Preview in-possession and out-of-possession shapes.
- Use a tactical preset or randomize a valid tactical plan.

The application prevents the match from starting when:

- A team does not have exactly eleven starters.
- A player appears twice.
- A required position has no player.
- A role or duty is invalid for its slot.
- Both kits are not visually distinguishable.
- Imported player data contains blocking errors.
- A team has fewer than the minimum roster needed for the chosen rules profile.

### 3.3 Match settings

The user selects:

- Weather, pitch condition, temperature, and wind.
- Match importance.
- Standard rules profile.
- Optional visible random seed under an Advanced section.

The setup screen shows a final review for both teams before kick-off.

### 3.4 Match

The match screen shows:

- Match clock, score, current half, and stoppage time.
- Live commentary in chronological order.
- Live team statistics.
- Team fatigue, morale, injuries, and discipline summaries.
- Current restart when play is stopped.
- Pause and x2, x4, x8, and x16 controls.
- Substitution controls for human teams.
- Clear halftime and full-time states.

AI teams manage their substitutions and tactical adaptations. Human teams never receive automatic tactical changes unless Assist Tactics is enabled.

### 3.5 Halftime

At halftime:

- Simulation play is stopped.
- The first-half score and statistics remain visible.
- Commentary announces halftime once.
- Users may make substitutions without consuming a substitution opportunity.
- AI teams evaluate fatigue, injuries, cards, score, and tactical problems.
- The second half starts with the opposite team taking kick-off.

### 3.6 Full time

At full time:

- No further simulation ticks can change the match.
- The final score and complete statistics are frozen.
- Commentary announces full time once.
- The user can choose Rematch, Edit Teams, or New Match.
- Rematch preserves setup but creates a new seed unless the user explicitly repeats the previous seed.
- The final summary can be exported as JSON for debugging and future replay support.

## 4. Engineering principles

### 4.1 Separate simulation from browser timing

Create a headless match runner that can advance by an explicit number of simulation ticks. Browser `requestAnimationFrame` should only schedule work and render snapshots.

Required interfaces:

- `createMatch(config, seed)`
- `stepMatch(tickCount)`
- `getMatchSnapshot()`
- `submitCommand(command)`
- `isMatchComplete()`
- `exportMatchResult()`

This makes tests, calibration, save and restore, and future networking practical.

### 4.2 Make randomness explicit

Replace direct `Math.random()` calls inside simulation code with an injected seeded random generator. UI-only randomization may use a separate generator.

Every result export records:

- Seed.
- Engine version.
- Tuning version.
- Rules profile.
- Team and environment configuration.

### 4.3 Use one event stream

The engine should emit typed match events such as:

- MatchStarted
- PassAttempted
- PassCompleted
- PossessionChanged
- ShotTaken
- SaveMade
- GoalScored
- FoulCommitted
- CardShown
- OffsideCalled
- BallOut
- RestartAwarded
- SubstitutionMade
- InjuryOccurred
- HalfTime
- FullTime

Rules, statistics, commentary, and UI projections must consume the same event. This prevents the score, commentary, and statistics from disagreeing.

### 4.4 Keep configuration separate from live state

Use distinct types for:

- Imported player and team data.
- Validated match configuration.
- Mutable simulation state.
- Read-only UI snapshot.
- Final match result.

Do not mutate setup state to represent live substitutions. Record substitutions as match commands and simulation events.

### 4.5 Centralize tuning

All probability, timing, distance, fatigue, injury, and physics constants belong in versioned tuning data. Tuning changes must not be scattered through agent classes.

## 5. Delivery phases

Each phase has an exit gate. Work should not move to the next phase while its gate is red.

### Phase 0: Repository stabilization

Work:

- Resolve all current TypeScript build errors.
- Correct the Vite and Vitest configuration typing.
- Add missing Node test types.
- Remove dead wrapper methods and unused state.
- Resolve nullable setup access in the match page.
- Preserve the existing local UI and simulation changes intentionally.
- Decide whether to retain or drop the safety autostash after review.
- Add continuous integration for install, type-check, tests, calibration smoke test, and production build.

Exit gate:

- `npm test` passes.
- `npm run build` passes from a clean checkout.
- No conflict markers or generated build files are tracked.
- CI gives the same result on Windows and Linux.

### Phase 1: Lock contracts and rules profile

Work:

- Define `MatchConfig`, `MatchCommand`, `MatchEvent`, `MatchSnapshot`, and `MatchResult`.
- Define the Standard 90 rules profile.
- Document which IFAB rules are modeled, simplified, or deferred.
- Validate formation, lineup, bench, roles, duties, kits, and team-control settings before engine creation.
- Define stable IDs for teams, players, events, and commentary entries.

Rules baseline:

- Two equal 45-minute halves.
- Event-based time allowance for substitutions, injuries, discipline, celebrations, and delayed restarts.
- A penalty awarded before the end of a half is completed before the half ends.
- Five substitutions and three opportunities under the chosen competition profile.
- Halftime substitutions do not consume an opportunity.
- A match cannot continue with fewer than seven eligible players on a team.
- Offside, foul, misconduct, and restart behavior is mapped to explicit test cases.

Reference sources:

- https://www.theifab.com/laws/latest/the-duration-of-the-match/
- https://www.theifab.com/laws/latest/the-players/
- https://www.theifab.com/laws/latest/offside/
- https://www.theifab.com/laws/latest/fouls-and-misconduct/

Exit gate:

- All public engine inputs and outputs are typed and documented.
- Invalid match configurations cannot enter the engine.
- Each supported law has at least one acceptance test.

### Phase 2: Deterministic match lifecycle

Work:

- Extract the fixed-tick simulation core from `requestAnimationFrame`.
- Add an injected seeded random generator.
- Implement pre-kickoff, first half, halftime, second half, stoppage time, and full-time as an explicit state machine.
- Ensure kick-off alternates between halves.
- Freeze the final state at full time.
- Add pause, resume, and speed as scheduling controls that cannot change results.
- Add command validation by phase.
- Make match start, halftime, and full-time events idempotent.

Exit gate:

- The same configuration and seed produce the same final event log at all speeds and supported tick rates.
- A full match always reaches full time without manual browser timing hacks.
- No event occurs after FullTime.
- A 100-seed lifecycle test completes without crashes, infinite loops, or invalid states.

### Phase 3: Possession, movement, and ball-state integrity

Work:

- Establish one authoritative possession state.
- Distinguish controlled possession, contested ball, and loose ball.
- Prevent possession from switching only because the nearest player changes.
- Complete ball-boundary detection and last-touch tracking.
- Keep ball physics and restart decisions consistent.
- Prevent players and the ball from entering invalid coordinates.
- Resolve player overlap enough to stop stacked tokens and impossible contests.
- Make fatigue, injury, and cards affect movement consistently.

Required invariants:

- At most one player controls the ball.
- A sent-off player cannot act or be substituted back on.
- A ball-out event produces exactly one correct restart.
- A goal produces exactly one score change and one kick-off.
- No NaN, Infinity, or out-of-pitch player position enters a UI snapshot.

Exit gate:

- Invariant tests pass across at least 500 seeded matches.
- No unexplained teleporting, duplicate restarts, or double-counted goals appear in event logs.

### Phase 4: Rules and restart completion

Work:

- Test offside at the moment a teammate plays the ball, including exempt restarts.
- Complete foul severity, advantage, yellow cards, second-yellow dismissals, and direct red cards.
- Add direct and indirect free-kick distinctions where simulation behavior requires them.
- Complete throw-ins, goal kicks, corners, kick-offs, free kicks, and penalties.
- Enforce minimum player count and abandonment behavior.
- Enforce substitution count and opportunity rules, including halftime.
- Ensure stoppage time is derived from recorded delays rather than an unrelated random value.

Exit gate:

- A rules test matrix covers normal cases and boundary cases.
- Commentary, statistics, restart placement, and discipline agree with the rule decision.
- No unsupported claim of full Laws compliance remains in product copy.

### Phase 5: Football decision model

Work:

- Stabilize carry, pass, cross, shot, and goalkeeper distribution choices.
- Separate decision quality from execution quality.
- Apply pressure, footedness, fatigue, morale, role, duty, traits, and PlayStyles once per decision.
- Audit every imported attribute and document whether it affects gameplay, setup only, or is reserved.
- Ensure tactical instructions create measurable differences without overriding player ability.
- Complete defensive pressure, marking, tackling, interceptions, aerial contests, shielding, saves, blocks, parries, and rebounds.
- Keep AI tactical adaptations explainable and bounded.

Exit gate:

- Stronger players outperform weaker players over large samples without guaranteeing outcomes.
- Tactical presets produce statistically distinct styles.
- Mirrored equal teams remain close to balanced across many seeds.
- No trait or PlayStyle applies twice through different agents.

### Phase 6: Statistics, xG, and commentary integrity

Work:

- Derive statistics only from typed match events.
- Define every statistic precisely.
- Track team and player totals where useful.
- Replace nearest-player possession accounting with controlled-possession intervals.
- Define a simple, documented xG model using distance, angle, body part, pressure, chance type, and goalkeeper context.
- Make commentary reference real event facts rather than independently sampled facts.
- Add important context such as equalizers, lead changes, late goals, second yellows, and major chances.
- Prevent duplicate, contradictory, or out-of-order commentary.

Exit gate:

- Event-log replay reconstructs the same final score and team statistics.
- Goals never exceed shots on target except where explicitly modeled as own goals.
- Completed passes never exceed attempted passes.
- Commentary names the correct team, player, action, score context, and restart.

### Phase 7: Calibration and balance

Current baseline from seed `20240113` at tick 20 and x16 shows known failures:

- Away passes attempted: 851, above the documented maximum of 750.
- Pass accuracy: roughly 52 to 55 percent, partly below the documented minimum of 55 percent.
- Home yellow cards: 12, far above the target maximum of 5.
- Corners: 17 and 20, above the target maximum of 12.
- The test passes despite these failures because current assertions only require activity.

Work:

- Convert calibration targets into percentile-based gates across many seeds.
- Use several team-strength pairs and tactical matchups.
- Separate correctness gates from realism ranges.
- Report mean, median, standard deviation, and percentile bands.
- Detect home advantage, side bias, formation bias, and seed sensitivity.
- Tune passes, turnovers, shots, fouls, cards, corners, offsides, xG, goals, fatigue, and injuries.
- Store calibration reports as CI artifacts.

Minimum calibration matrix:

- Equal teams, balanced tactics.
- Equal teams, high press vs low block.
- Equal teams, possession vs counterattack.
- Strong team vs weak team, both home and away.
- Clear weather vs heavy pitch and poor weather.
- Human configuration vs AI configuration with identical tactical inputs.

Exit gate:

- At least 80 percent of equal-team match results fall within the documented per-team target bands.
- Aggregate possession for equal teams has no material fixed-side bias.
- Goals broadly follow xG across the full sample.
- Full-match calibration fails when core targets are materially violated.

### Phase 8: Team setup and import completion

Work:

- Add two complete built-in sample teams.
- Provide a one-click Quick Match path.
- Improve import error locations and actionable messages.
- Add import preview before replacing current setup.
- Validate IDs, duplicate players, shirt numbers, required attributes, and roster size.
- Preserve valid imported data when some rows fail.
- Ensure every formation has eleven unique slots.
- Filter roles and duties by valid position.
- Add clear reset, preset, and randomization behavior.
- Save the last valid setup and environment locally with a schema version.

Exit gate:

- A new user reaches kick-off without preparing a file.
- Valid CSV and JSON examples import identically.
- Invalid input never crashes setup or match creation.
- Refreshing the setup page can restore the last valid setup.

### Phase 9: Local match user experience

Work:

- Redirect `/match` to setup when no valid match configuration exists.
- Add pre-match review and explicit Start Match action.
- Make human-vs-human setup workable on one device, including optional pass-device confirmation between teams.
- Show match phase, score, clock, stoppage time, commentary, team summaries, and stats clearly.
- Disable invalid controls by match phase.
- Provide substitution feedback and explain remaining substitutions and opportunities.
- Add halftime controls and full-time summary actions.
- Add Rematch, Edit Teams, and New Match.
- Ensure AI teams make substitutions and human teams do not receive unwanted automatic changes.
- Keep keyboard controls and accessible labels.
- Test narrow screens and keyboard-only use.

Exit gate:

- Human vs Human, Human vs AI, and AI vs AI can each complete a full match.
- No route produces an empty or broken match screen.
- The complete local journey works without opening developer tools.

### Phase 10: Release hardening

Work:

- Add browser-level end-to-end tests for quick match, import, setup, substitutions, halftime, and full time.
- Profile full matches at x2, x4, x8, and x16.
- Bound commentary and event-history memory.
- Test Chrome, Edge, and Firefox on supported desktop sizes.
- Add error boundaries and a recoverable fatal-match error screen.
- Update README claims to match verified behavior.
- Add troubleshooting, import examples, controls, and known limitations.
- Produce a static production build and test it through `npm run preview`.

Exit gate:

- Clean install, tests, calibration gate, and production build pass.
- Critical end-to-end flows pass in supported browsers.
- No known severity-one or severity-two defects remain.
- v0.1 acceptance criteria are demonstrated from a clean checkout.

## 6. Test strategy

### Unit tests

- Attribute normalization and import validation.
- Seeded random generator.
- Tactical modifiers and role behavior.
- Ball movement and boundaries.
- Rule decisions and restart placement.
- Stats reducers and commentary formatters.
- Match lifecycle transitions.

### Integration tests

- Pass to interception to counterattack.
- Shot to save, parry, loose ball, and follow-up.
- Foul to advantage or restart and discipline.
- Goal to score update and kick-off.
- Injury to substitution.
- Halftime substitution opportunity accounting.
- Red card to reduced active lineup.
- Full time to frozen final result.

### Property and invariant tests

- Scores never decrease.
- Event time never moves backward.
- One player cannot play for both teams.
- A dismissed player cannot participate.
- Every restart follows a valid stopping event.
- Every completed pass has an attempted pass.
- Every goal has a valid scoring event.
- All numeric state remains finite.

### End-to-end tests

- Quick Match to full time.
- Imported teams to full time.
- Human vs Human with substitutions.
- Human vs AI with AI adaptation.
- Pause and speed changes during all phases.
- Refresh and restore setup.
- Full-time rematch and edit-team paths.

## 7. Definition of done for local v0.1

Local v0.1 is done only when all statements below are true.

- A new user can start a valid match with built-in teams in under two minutes.
- Two local users can configure independent teams and complete a match on one device.
- A user can import two valid teams through CSV or JSON.
- The match has reliable kickoff, halves, halftime, stoppage time, and full time.
- Pause and all speed settings preserve the same seeded result.
- Substitutions follow the selected competition profile.
- Rules, statistics, score, and commentary remain consistent.
- Full-time state is stable and offers rematch, edit, and new-match actions.
- Production build passes.
- Default tests and full calibration gates pass.
- No network connection is required after the application is loaded.
- Documentation describes actual verified behavior.

## 8. Post-v0.1 roadmap

Only start these after local v0.1 meets its definition of done.

1. Reintroduce the animated 2D match pitch as an optional projection of the same snapshots and events.
2. Save and replay complete matches from seed, commands, and event logs.
3. Add extra time and penalty shoot-outs.
4. Add local competitions, tables, squads, and persistent seasons.
5. Improve AI tactical planning and opposition analysis.
6. Add online multiplayer using the deterministic command and event model.
7. Consider 3D presentation only if it does not compromise simulation correctness.

## 9. Immediate execution order

The next work should be performed in this exact order:

1. Make the TypeScript production build pass.
2. Protect the merged local work and remove ambiguity around the remaining autostash.
3. Add typed match contracts and a seeded random service.
4. Extract a headless simulation runner.
5. Strengthen lifecycle and full-time tests.
6. Build the event stream and move statistics to it.
7. Fix possession and restart invariants.
8. Complete rules-profile tests.
9. Replace the weak single-seed calibration gate with a multi-seed report.
10. Tune the simulation until the calibration gate passes.
11. Complete Quick Match, halftime, full-time, rematch, and setup persistence.
12. Add end-to-end tests and release documentation.

This order deliberately puts correctness, reproducibility, and a complete match loop before additional presentation features.

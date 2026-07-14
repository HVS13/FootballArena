# Football Arena

Football Arena is a commentary-first, local football management simulation. One or two people configure teams and tactics on the same device. The match engine controls individual players and reports the result through commentary, condition summaries, and statistics.

The project does not claim complete IFAB Laws compliance. See [docs/RULES_PROFILE.md](docs/RULES_PROFILE.md) for the modeled, simplified, and deferred rules.

## Local v0.1 features

- One-click Quick Match with two built-in 20-player sample squads.
- Human vs Human, Human vs AI, and AI vs AI team control settings.
- Independent formations, roles, duties, team instructions, set-piece preferences, and kits.
- CSV and JSON player import with field-level validation and a preview before replacing the setup.
- Weather, wind, temperature, pitch condition, and match importance settings.
- Seeded, fixed-tick match simulation with reproducible events and results.
- Commentary-first match view with score, phase, clock, team condition, and live statistics.
- Pause plus x2, x4, x8, and x16 scheduling controls.
- Five substitutions in three in-play windows. Halftime substitutions do not consume a window.
- Explicit halftime review and second-half start.
- Full-time Rematch, Edit Teams, New Match, and JSON export actions.
- Local setup and environment restoration through browser storage.

The tactics board contains a pitch because formation editing is spatial. An animated live-match pitch is deferred until after local v0.1.

## Run locally

Requirements: Node.js 20.19 or later, or Node.js 22.12 or later, plus npm.

```powershell
cd C:\Git\FootballArena
npm ci
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`.

Production preview:

```powershell
npm run build
npm run preview
```

## Verification

```powershell
npm test
npm run test:stability
npm run calibrate:full
npm run calibrate:matrix
npm run build
npm run test:e2e
```

The stability command runs 500 complete seeded matches and checks lifecycle, event ordering, pitch bounds, finite state, and core statistics invariants. The full calibration command runs five deterministic 90-minute matches at the production tick rate. It enforces per-team bands for passing, shooting, fouls, discipline, corners, and offsides. The matrix adds tactical, team-strength, weather, side, and control-mode comparisons.

CI runs the default tests and production build on Windows and Linux. The 500-seed stability gate and full calibration run on Windows. Browser tests cover Chromium and Firefox in CI, with local Microsoft Edge coverage on Windows.

## Player imports

The UI accepts `.csv` and `.json`. Invalid rows are reported without discarding valid parsed rows. Imported teams are previewed before application.

Validate a file without opening the UI:

```powershell
npm run validate:import -- "C:\path\to\team.json"
```

Schemas and examples:

- [Import schema](docs/IMPORT_SCHEMA.md)
- [Import guide](docs/IMPORT_GUIDE.md)
- [Calibration targets](docs/CALIBRATION_TARGETS.md)

## Reproducibility

A full-time JSON export contains:

- Random seed.
- Engine and tuning versions.
- Rules profile.
- Team and environment configuration.
- Final snapshot and statistics.
- Typed match event log.

UI-only randomization uses browser randomness. Match simulation randomness is owned by the seeded engine.

## Known limits

- Extra time and penalty shoot-outs are not supported.
- Online play, competitions, careers, and transfers are not supported.
- Some rule details and restart placement are deliberately simplified.
- Match replays from exported JSON are not yet exposed in the UI.
- The live match is text-based. There is no animated match pitch in v0.1.

The complete delivery plan is in [docs/LOCAL_PLAY_ROADMAP.md](docs/LOCAL_PLAY_ROADMAP.md).
The current requirement-by-requirement status is in [docs/LOCAL_V01_COMPLETION_AUDIT.md](docs/LOCAL_V01_COMPLETION_AUDIT.md).

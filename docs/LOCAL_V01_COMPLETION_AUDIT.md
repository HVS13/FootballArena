# Local v0.1 Completion Audit

Audit date: 2026-07-14

This audit compares the current worktree with every phase gate in `LOCAL_PLAY_ROADMAP.md`. A configured test is not treated as proof unless its assertions cover the stated gate. The current implementation is playable and substantially advanced, but the full roadmap is not yet proven complete.

## Verified now

| Area | Evidence |
| --- | --- |
| Default automated suite | `npm test`: 46 passed, 5 optional tests skipped |
| Production build | `npm run build`: TypeScript and Vite build passed |
| Dependency audit | `npm audit`: 0 known vulnerabilities at the last audit |
| Deterministic lifecycle | Same-seed, playback-control, halftime, full-time freeze, abandonment, and event replay tests pass |
| Large-seed stability | `npm run test:stability`: 500 complete seeded matches passed lifecycle, ordering, finite-state, bounds, and core-stat invariants |
| Equal-team realism | `npm run calibrate:full`: five production-rate matches and ten team samples passed the documented 80% bands |
| Calibration matrix | `npm run calibrate:matrix`: possession/counter, press/low-block, strong/weak on both sides, weather, and control-mode scenarios passed |
| Local control modes | Headless Human vs Human, Human vs AI, and AI vs AI full matches passed |
| Browser journey | Chromium completed a production-rate match; Chromium, Firefox, and Edge passed setup persistence and imported-team keyboard/substitution flows |
| Import parity | Equivalent CSV and JSON normalization tests pass; invalid rows preserve valid parsed players |
| Worktree integrity | `git diff --check` and conflict-marker checks passed before this audit; the existing autostash remains untouched |

## Phase assessment

| Phase | Assessment | Reason |
| --- | --- | --- |
| 0. Repository stabilization | Partial | Local build/tests pass and CI is configured. A clean-checkout CI run on both operating systems has not been observed from this worktree. |
| 1. Contracts and rules profile | Partial | Contracts, validation, and the rules profile exist. The roadmap requires an acceptance test for each supported law. Current rules coverage is not broad enough to prove that statement. |
| 2. Deterministic lifecycle | Mostly verified | Determinism, explicit stepping, lifecycle idempotence, final-state freeze, and 500 complete seeds pass. Cross-tick-rate equality is not directly asserted. |
| 3. Possession, movement, ball integrity | Partial | The 500-seed suite covers final bounds, finite values, event order, and basic statistics. It does not exhaustively prove every restart, dismissed-player, overlap, teleport, and one-controller invariant throughout every tick. |
| 4. Rules and restarts | Partial | Offside, fouls, penalties, cards, set pieces, substitution limits, and abandonment are implemented or documented. The required normal/boundary rules matrix and cross-projection agreement are incomplete. |
| 5. Football decision model | Partial | Attribute use is documented, built-in players now have complete attributes, and the matchup matrix proves aggregate strength and tactical effects. Double application of every trait and PlayStyle has not been exhaustively audited by tests. |
| 6. Statistics, xG, commentary | Partial | Event replay reconstructs score-related statistics and core invariants pass. Commentary fact correctness, ordering, late-game context, second-yellow context, and every restart are not covered by a full acceptance matrix. |
| 7. Calibration and balance | Mostly verified | Equal-team target bands and the minimum matchup categories run as gates. The sample sizes remain small for claiming robust statistical balance, and calibration reports are printed but not uploaded as CI artifacts. |
| 8. Setup and import | Mostly verified | Quick Match, two 20-player teams, preview, validation, presets, randomization, and persistence are present. Browser E2E covers JSON import, while CSV parity is covered below the browser layer. |
| 9. Local match UX | Mostly verified | All control modes finish headlessly, routes recover, substitutions and keyboard pause work, and Chromium completes the journey. Optional pass-device confirmation is not implemented. Keyboard-only coverage is not exhaustive. |
| 10. Release hardening | Partial | Production E2E, error recovery, memory bounds, docs, and three-browser smoke coverage exist. The roadmap also asks for speed profiling, broader critical E2E paths, full supported-browser confidence, severity review, and clean-checkout acceptance evidence. |

## Remaining release blockers

1. Build a rules acceptance matrix for every rule claimed as modeled in `RULES_PROFILE.md`, including boundary cases and agreement between events, restart placement, statistics, discipline, and commentary.
2. Strengthen tick-by-tick property coverage for possession ownership, sent-off players, restart uniqueness, goal uniqueness, and all numeric state across the 500-seed run.
3. Add commentary acceptance tests for factual team/player/action context, score changes, equalizers, lead changes, late goals, second yellows, and restart consistency.
4. Audit trait and PlayStyle application paths so each modifier is applied once, with targeted regression tests.
5. Store calibration output as CI artifacts and increase samples before making strong balance claims.
6. Add the remaining browser-level flows: CSV import, halftime substitution, rematch, same-seed repeat, edit teams, new match, export, and recoverable fatal error.
7. Profile x2, x4, x8, and x16 scheduling and memory behavior over full matches.
8. Run and observe CI from a clean checkout on Windows and Linux, then perform an explicit severity-one/severity-two defect review.

## Review position

The app is playable and the current gates are green. It should be treated as a strong local v0.1 candidate, not as roadmap-complete. The persistent goal should remain active until the blockers above are either implemented and verified or the roadmap scope is explicitly revised.

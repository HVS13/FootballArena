# Task List

This file outlines the implementation tasks required to deliver the first iteration of the web-based football simulation game. Tasks are ordered roughly by dependency; complete higher-priority items first.

## Core Functionality

1. **Set up project scaffolding**
 - Initialise a Node.js project with TypeScript support.
 - Configure a client bundler (e.g., Vite or Webpack) and integrate a testing framework (Jest or Mocha).

2. **Implement DataImportAgent**
 - Define a file format (CSV or JSON) for player lists and team configurations.
 - Parse imported files into structured objects containing all player attributes (technical, mental, physical, goalkeeping, hidden).
 - Validate values and scale them to a 0-100 range.
 - Load tactical lists (team instructions, player roles, duties) from `football_game_reference.md` and expose them as structured data.

3. **Build TeamSetupAgent and UI integration**
 - Design drag-and-drop components for selecting formations and placing players on the pitch.
 - Display lists of roles and duties, allowing users to assign them to players.
 - Capture team instructions selections and store them alongside formation data.
 - Add match environment controls (weather, wind, temperature, pitch condition) with presets and randomize support.

4. **Develop PhysicsAgent**
 - Implement physics models for players and ball. Use player attributes to influence speed, turning, and stamina consumption.
 - Handle collisions with pitch boundaries and other players.
 - Provide an API to compute movement updates given an action (run, pass, shot, tackle).
 - Incorporate weather, wind, and pitch condition modifiers in physics updates.

5. **Create GameEngineAgent**
 - Manage the simulation loop and coordinate with PhysicsAgent and RulesAgent.
 - Support speed multipliers (x2, x4, x8, x16) and pausing.
 - Schedule match events (kick-off, half-time, full-time) and maintain the game clock.
 - Build a possession-driven action loop (carry, pass, shoot) and pause for restarts.
 - Add targeted passing logic with pressure-aware decision making.

6. **Implement RulesAgent**
 - Encode basic FIFA rules: offside detection, fouls, free kicks, penalties, throw-ins, goal kicks, and substitution limits.
 - Integrate with PhysicsAgent to identify rule violations.
 - Provide restart placement data for set pieces and kick-offs.
 - Apply pressure modifiers to pass/shot outcomes.

7. **Create StatsAgent**
 - Record match events and accumulate per-player and team statistics (e.g., passes completed, shots on target, tackles won).
 - Provide an API for retrieving real-time statistics for display.

8. **Build UIAgent**
 - Render the 2D pitch using HTML5 Canvas or an equivalent library.
 - Represent players as coloured circles with foot indicators.
 - Display match commentary and statistics below the pitch.
 - Expose controls for match speed and substitutions; integrate with PlaybackAgent.

9. **Implement PlaybackAgent**
 - Connect UI controls to simulation speed adjustments.
 - Issue pause/resume commands to GameEngineAgent.

10. **Add CommentaryAgent**
 - Generate commentary based on events emitted from GameEngineAgent and RulesAgent.
 - Use simple templates for now; ensure messages are clear and chronological.

11. **Testing**
 - Write unit tests for DataImportAgent, PhysicsAgent, and RulesAgent.
 - Implement integration tests that simulate a short match and verify physics, rule enforcement, and statistics.

## Enhancements (Optional)

* **Refactor for multiplayer.** Design and implement NetworkingAgent to handle remote players.
* **Advanced AI.** Add intelligent behaviours for computer-controlled teams.
* **Procedural commentary.** Enhance CommentaryAgent with richer, more context-aware descriptions.
* **Match environment factors.** Model weather, wind, and pitch conditions that alter ball physics and fatigue.

# Web-Based Football Simulation Game

## Overview

This repository outlines the architecture and requirements for a web-based football simulation game. The goal is to provide a realistic, tactical experience inspired by Football Manager and FIFA. In the first iteration, focus is placed on local "hotseat" matches, where two users can play on the same device. Multiplayer over the network is reserved for future work.

Key features include:

* **Realistic physics:** Player and ball movements adhere to real-world dynamics, influenced by player attributes such as pace, stamina, agility and strength.
* **Comprehensive player data:** Users can import custom player lists with full attribute sets (technical, mental, physical, goalkeeping, hidden) on a 0-100 scale, plus player traits and physical profiles.
* **Detailed tactics:** Football Manager-style team instructions, player roles, and duties now shape positioning, pressing, and decision biases (passing, carrying, shooting).
* **2D match view:** A top-down pitch with circular player icons (and foot indicators) similar to Football Manager. Live commentary and real-time statistics are displayed below the pitch.
* **Adjustable match speed:** Users can toggle simulation speed between x2, x4, x8, and x16, or pause/resume the match at any time.
* **Substitutions and rule enforcement:** The game enforces official FIFA rules and allows in-game substitutions with the correct limits.
* **Contested possession:** The simulation resolves tackles, interceptions, miscontrols, aerial duels, goalkeeper saves, pass/shot variance, and loose-ball rebounds so turnovers feel more realistic.
* **Set-piece routines and discipline:** Corners, free kicks, throw-ins, penalties, and kick-offs are structured; fouls can play advantage and trigger yellow/red cards.
* **Match environment effects:** Weather, wind, temperature, and pitch conditions influence ball physics and player fatigue.
* **Player traits:** FM player preferred moves modify decisions like carrying, passing, and shooting.
* **Match importance, morale, and fatigue:** Match importance scales pressure and morale swings; morale and fatigue evolve over time, impacting decisions and movement, with injuries introducing temporary limitations.
* **Match HUD overlays:** On-pitch overlays summarize fatigue, morale, injuries, and discipline per team.

## v0.1 Scope and Acceptance Criteria

**Scope (in):**
- Local hotseat only (two users on one device).
- Player import with validation and 0-100 scaling.
- Player profiles include shirt number, age, height, weight, foot ratings, nationality, and traits.
- FM26 team instructions, roles, and duties available in UI.
- EA FC 26 PlayStyles available and applied to gameplay (passing, shooting, dribbling, physicality).
- Match environment configuration available in setup (weather, wind, temperature, pitch condition, presets, randomize).
- Match importance, morale shifts, fatigue accumulation, and basic injury knocks impacting performance.
- Structured set pieces (corners, free kicks, throw-ins, penalties, kick-offs) with advantage/card discipline.
- 2D top-down pitch with players as circles + foot indicator, officials visible.
- Real-time simulation with fixed-tick engine, rendering at 60fps.
- Speed controls x2/x4/x8/x16 and pause/resume.
- Substitutions with official limits (5 subs in 3 windows + halftime).
- Live commentary feed and live match stats panel.
- Match HUD overlays for fatigue, morale, injuries, and cards.

**Out of scope (v0.1):**
- Online multiplayer and matchmaking.
- Advanced AI tactics beyond scripted behaviors.
- 3D rendering or broadcast camera.
- Extra time and penalties (plan for later).

**Acceptance criteria:**
- A user can import two teams, set formation/roles/instructions, and start a match.
- The match runs for 90 minutes + stoppage time without errors at any speed.
- Speed changes and pause/resume work instantly and do not desync simulation.
- Substitutions are enforced correctly and reflected in stats and visuals.
- The match ends with a final stats summary and stable game state.

## File Structure

| File | Purpose |
|---|---|
| **AGENTS.md** | Defines the key agents (GameEngineAgent, PhysicsAgent, DataImportAgent, etc.) and their responsibilities in the simulation. |
| **SKILLS.md** | Lists the skills and capabilities required to build this project, including web technologies, physics, and domain expertise. |
| **football_game_reference.md** | Contains detailed lists of player attributes, EA Sports FC PlayStyles with their effects, Football Manager team instructions, roles, and duties. You must consult this file to understand how to implement attributes and tactics. |
| **docs/IMPORT_SCHEMA.md** | Defines the CSV/JSON formats accepted by the DataImportAgent. |
| **docs/IMPORT_GUIDE.md** | Full import reference with every column, options list, and explanations. |
| **scripts/build-reference-data.mjs** | Generates structured reference data from `football_game_reference.md`. |
| **TODO** | A task list guiding the implementation of the game. |
| **README** | Provides an overview of the project and guidance on how to get started. |

## Getting Started

1. **Review the reference file.** Before writing any code, study `football_game_reference.md`. It contains the exact lists of attributes, playstyles, team instructions, roles and duties sourced from authoritative materials. Use these lists to construct your data models and UI options.
2. **Understand the agent architecture.** Read `AGENTS.md` to understand how the system is divided into agents. Each agent has a clear purpose and set of responsibilities. When implementing a feature, ensure that you place the logic in the correct agent.
3. **Assess your skills.** Use `SKILLS.md` to identify the knowledge domains necessary for this project. If your expertise is lacking in a particular area, plan to study or recruit collaborators accordingly.
4. **Plan the tasks.** Refer to `TODO` for a prioritised list of tasks. Start with core functionality: data import, formation setup, physics engine, and match simulation. Leave advanced features (networking, AI opponents) for later iterations.
5. **Set up your development environment.** This project assumes a modern Node.js/TypeScript setup for both server and client code. Use a package manager (npm or yarn) and a bundler (Vite, Webpack) of your choice.

## Run Locally (Step-by-Step)

1. **Install Node.js 18+ (includes npm).**
2. **Open PowerShell or Terminal.**
3. **Go to the project folder:**
   ```bash
   cd C:\Git\FootballArena
   ```
4. **Install dependencies:**
   ```bash
   npm install
   ```
5. **Start the dev server:**
   ```bash
   npm run dev
   ```
6. **Open the URL printed in the terminal** (Vite defaults to `http://localhost:5173`).

Optional commands:

```bash
npm test
npm run build
npm run preview
```

## Reference Data Updates

If you edit `football_game_reference.md`, re-run the generator to refresh the structured data used by the app:

```bash
node scripts/build-reference-data.mjs
```

## Notes and Considerations

* **Do not reinvent the wheel.** Where possible, leverage existing libraries for physics, drag-and-drop UI, and rendering. However, ensure that the chosen tools allow the flexibility required for custom game logic.
* **Performance matters.** Real-time simulation demands efficient code. Profile the physics and rendering loops regularly, especially at higher speed multipliers.
* **Data validation is crucial.** Imported player data may contain errors or out-of-range values. Implement robust validation to avoid simulation glitches.
* **Modular design pays off.** Stick to the agent boundaries described in `AGENTS.md`. Avoid cross-cutting dependencies; agents should communicate via well-defined interfaces.

## Future Work

After the hotseat version is stable, consider adding:

* **Online multiplayer.** Introduce a NetworkingAgent to synchronise state across clients.
* **Artificial intelligence.** Create AI opponents with tactical awareness. This will require more advanced decision making and potentially machine learning.
* **Enhanced commentary.** Replace simple templated commentary with dynamically generated text that reacts to playstyles, player abilities, and match context.

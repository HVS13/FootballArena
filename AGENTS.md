# Agents Overview

This project organizes the simulation game into distinct "agents." Each agent encapsulates a set of responsibilities and communicates with others via explicit APIs or shared data structures. Using agents keeps the code modular and easier to test. The list below outlines the agents you must implement.

## GameEngineAgent

* **Purpose:** Governs the overall flow of the football match. It coordinates time-advancement, event scheduling, and transitions between game states (kick-off, half-time, full-time, substitutions, stoppages).
* **Responsibilities:**
 - Initialize a match with teams, formation data, and player statistics imported by the DataImportAgent.
 - Maintain the clock and process simulation frames at real-time speed, with support for speed multipliers (x2, x4, x8, x16) and pause/resume.
 - Communicate with PhysicsAgent and RulesAgent to handle in-play events and ensure compliance with official FIFA rules.
 - Drive the possession-based action loop (carries, targeted passes, shots) and coordinate restarts (throw-ins, corners, free kicks, penalties, kick-offs).
 - Apply player traits and footedness modifiers to decision making (carry, pass, shoot).
 - Apply role and duty behaviors to positioning, pressing, and decision biases in and out of possession.
 - Maintain tactical shape (line heights, pressing triggers, marking assignments) to drive off-ball movement.
 - Track morale swings, fatigue accumulation, and injury events, adjusting performance based on match importance.
 - Resolve ball contests (tackles, interceptions, miscontrols, aerial duels), goalkeeper saves, pass/shot variance, and loose-ball rebounds to create realistic turnovers.
 - Apply physical contest weighting (age, height, weight, strength, balance) to tackles, shielding, and aerial duels.
 - Execute structured set-piece routines (corners, free kicks, throw-ins, penalties, kick-offs) and apply advantage/card discipline outcomes.
 - Apply AI opponent adaptation logic for AI-controlled teams or when assist tactics are enabled.
 - Trigger commentary updates to UIAgent and record match statistics for StatsAgent.
* **Interactions:** Calls PhysicsAgent for position and movement updates, consults RulesAgent for rule enforcement, notifies UIAgent about state changes, and receives commands from PlaybackAgent (speed changes, pause, resume).

## PhysicsAgent

* **Purpose:** Implements realistic physics for the ball and players. This includes movement, collisions, and ball trajectory.
* **Responsibilities:**
 - Calculate player movements based on acceleration, agility, balance, pace, stamina, and strength attributes.
 - Apply injury penalties and fatigue modifiers to movement speeds.
 - Model ball motion with spin, friction, rebound effects, and environmental factors (wind, weather, pitch condition). Ensure collisions between ball and players, pitch boundaries, and goal posts are realistic.
 - Provide position updates at each simulation frame to GameEngineAgent.
* **Interactions:** Receives target actions from GameEngineAgent (e.g., pass, shot, run) and returns updated positions and velocities. Works closely with RulesAgent to detect offside and fouls.

## DataImportAgent

* **Purpose:** Handles all external data required by the game.
* **Responsibilities:**
 - Parse user-provided lists of players, including their full set of attributes (technical, mental, physical, goalkeeping, hidden). See the reference file for the list of attributes.
 - Validate imported data and map each attribute onto a 0-100 scale.
 - Require player profile data (age, height, weight, foot ratings, nationality) and import shirt numbers plus player traits.
 - Process tactical data (team instructions, roles, duties) defined in Football Manager games.
 - Provide structured data objects to GameEngineAgent and TeamSetupAgent.
* **Interactions:** Reads from external sources (user files) and writes to internal data stores. Communicates with TeamSetupAgent and GameEngineAgent.

## TeamSetupAgent

* **Purpose:** Provides an interface for users to configure teams, formations, roles and duties.
* **Responsibilities:**
 - Expose drag-and-drop UI components for formation selection and player positioning.
 - Present lists of available team instructions, roles, and duties (loaded by DataImportAgent) with concise descriptions.
 - Provide the set-piece wizard so users can define marking, delivery, and transition preferences.
 - Allow each team to pick its own formation independently during setup.
 - Provide tactical presets (formations, instructions, roles/duties) plus randomization for quick starts.
 - Capture user choices and produce a tactical plan that the GameEngineAgent can simulate.
 - Present an FM-style tactics board layout combining formation pitch, lineup table, and instruction cards.
 - Show in-possession and out-of-possession shape previews with player labels on the tactics board.
 - Collect match environment settings (weather, wind, pitch condition) including presets and randomisation options.
 - Expose kit color controls for primary/secondary team colors.
 - Let users choose human vs AI control per team and optionally enable AI tactical assistance.
* **Interactions:** Interacts with UIAgent for front-end elements, obtains lists from DataImportAgent, and passes final tactical configurations to GameEngineAgent.

## RulesAgent

* **Purpose:** Encapsulates the official FIFA rules, ensuring the simulation abides by them.
* **Responsibilities:**
 - Implement rule checks for offside, fouls, free kicks, penalties, throw-ins, goal kicks, and substitutions. Align these checks with team instructions and player roles as needed.
 - Provide restart decisions and placement data for set pieces and kick-offs.
 - Apply pressure modifiers so defenders influence pass/shot outcomes.
 - Decide advantage play and card discipline (yellow/red) based on foul severity and context.
 - Scale pressure effects based on match importance.
 - Enforce substitution limits and stoppage time based on match context.
 - Work with PhysicsAgent to detect rule infractions and with CommentaryAgent to provide context for calls.
* **Interactions:** Receives event data from PhysicsAgent and GameEngineAgent; communicates decisions back to GameEngineAgent and CommentaryAgent.

## StatsAgent

* **Purpose:** Tracks and aggregates match statistics.
* **Responsibilities:**
 - Record events such as shots, passes, tackles, interceptions, fouls, yellow/red cards, offsides, corners, and goals.
 - Generate per-player and team statistics (possession percentages, pass accuracy, shot accuracy, xG, saves, etc.).
 - Provide real-time updates to the UIAgent for display in the text-based match view.
* **Interactions:** Receives updates from GameEngineAgent and PhysicsAgent; sends aggregated metrics to UIAgent.

## UIAgent

* **Purpose:** Handles all visual and interactive elements of the web application.
* **Responsibilities:**
 - Render a text-based match view (commentary + live stats) instead of the 2D pitch for now.
 - Display match commentary text and real-time statistics in the match view.
 - Allow users to change match speed, pause/resume the game, and perform substitutions.
 - Provide drag-and-drop formation tools via TeamSetupAgent.
* **Interactions:** Receives updates from GameEngineAgent, StatsAgent, CommentaryAgent, and TeamSetupAgent. Sends user actions (speed changes, substitutions) to PlaybackAgent and GameEngineAgent.

## PlaybackAgent

* **Purpose:** Manages control of match speed and pause/resume states.
* **Responsibilities:**
 - Expose UI controls to adjust simulation speed among predefined multipliers (x2, x4, x8, x16) and to pause or resume the match.
 - Notify GameEngineAgent of speed changes so that simulation timing adjusts accordingly.
* **Interactions:** Connects UI events with GameEngineAgent and ensures the physics stepping is synchronised with the chosen speed.

## CommentaryAgent

* **Purpose:** Generates text commentary describing the ongoing match.
* **Responsibilities:**
 - Interpret events from GameEngineAgent and RulesAgent to produce play-by-play narrative.
 - Use phrase libraries and context tags (late-game, equalizers, big chances) for varied commentary.
 - Surface action-style cues (shot/pass types, keeper actions, tricks) driven by playstyles and traits.
 - Maintain a buffer of recent commentary lines for display by UIAgent.
* **Interactions:** Receives event notifications from GameEngineAgent and rule outcomes from RulesAgent; outputs commentary messages to UIAgent.

## NetworkingAgent (future work)

* **Purpose:** (For multiplayer version) handle network communication between players for remote matches.
* **Responsibilities:**
 - Manage sockets or web channels to synchronize game state across clients.
 - Authenticate users and handle matchmaking.
* **Interactions:** Works with GameEngineAgent to broadcast game state and with UIAgent to communicate user actions. Note that local hotseat mode in the first iteration does not require this agent.

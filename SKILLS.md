# Required Skills and Capabilities

Implementing a realistic football simulation game demands a wide range of technical and domain-specific skills. This document summarises the core competencies needed by contributors and by any intelligent agent assisting the development.

## Web Development

| Skill | Description |
|---|---|
| **HTML/CSS** | Build responsive web interfaces for the 2D pitch view, match controls, and menu system. Use semantic HTML and modern CSS (including flexbox or grid) to ensure cross-browser compatibility. |
| **JavaScript/TypeScript** | Implement client-side logic for rendering, event handling, and real-time updates. TypeScript's type safety is recommended for maintainability. |
| **WebGL/Canvas** | Render the 2D pitch and moving player markers efficiently. Knowledge of the HTML5 Canvas API or WebGL helps achieve smooth animations. |
| **Node.js & Express** | For any server-side components (e.g., data import, multiplayer networking), implement REST or WebSocket APIs. |
| **Drag-and-Drop UI frameworks** | Use libraries such as React DnD or interact.js to implement formation and player assignment. |

## Physics & Mathematics

| Skill | Description |
|---|---|
| **Kinematics & Dynamics** | Model player and ball movement using velocity, acceleration, momentum, and collision detection. Recognize how player attributes (e.g., acceleration, pace, stamina) influence motion. |
| **Collision Detection and Response** | Detect and handle collisions between ball, players, and boundaries with realistic rebound angles and speeds. |
| **Numerical Integration** | Use stable integration methods (e.g., Euler or Verlet) to update positions at each time step, taking into account simulation speed multipliers. |
| **Environment Modeling** | Apply weather, wind, temperature, and pitch condition effects to physics and fatigue. |

## Domain Knowledge

| Skill | Description |
|---|---|
| **Football Regulations** | Understand FIFA's laws of the game (offsides, fouls, throw-ins, etc.) and apply them via the RulesAgent. |
| **Tactics & Roles** | Familiarity with formations, player roles, and duties from Football Manager. The project uses full lists of roles (sweeper keeper, ball-playing defender, inverted wing-back, etc.) and duties (attack, support, defend, stopper, cover, automatic). |
| **EA Sports FC PlayStyles** | Recognise PlayStyle and PlayStyle+ effects for more immersive commentary and potential player behaviour modifications. |
| **Player Attributes** | Interpret player attributes (technical, mental, physical, goalkeeping, hidden) and map them onto in-game behaviours. |
| **Player Traits** | Translate Football Manager player traits into distinct behavioural modifiers for decision-making and movement. |

## Data Handling

| Skill | Description |
|---|---|
| **Data Parsing** | Import and validate CSV or JSON files containing player stats and team configurations. Ensure values are scaled appropriately (0-100) and handle missing values. |
| **Serialization** | Persist match states for replays or pause/resume features. Use JSON or binary formats to save and restore game state. |
| **API Design** | Define clear interfaces between agents for requesting and transmitting data (e.g., formations, player stats, match events). |

## User Interface & Experience

| Skill | Description |
|---|---|
| **Interaction Design** | Create intuitive controls for match speed, substitutions, and formation editing. Prioritise clarity and minimalism to mirror Football Manager's UI. |
| **Real-Time Rendering** | Achieve smooth animations and updates within the browser. Optimise drawing routines to avoid frame drops, especially when running at high speed multipliers. |
| **Accessibility** | Provide keyboard shortcuts and screen-reader-friendly text for commentary and controls. |
| **Visual Design** | Use appropriate colours and icons to differentiate teams and roles, ensuring readability and consistency. |
| **Tactics UI Layout** | Build FM-style tactics boards with dual shape previews and labeled player tokens that remain clear at multiple screen sizes. |

## Artificial Intelligence & Logic

| Skill | Description |
|---|---|
| **Finite State Machines** | Represent player behaviours (idle, run, dribble, pass, shoot, tackle) and transitions based on game context. |
| **Decision Making** | Implement simple AI for computer-controlled teams in multiplayer or future single-player modes. This may involve heuristics or rule-based systems using player attributes and tactical instructions. |
| **Possession Logic** | Model ball possession, action selection (carry, pass, shoot), and stoppage handling to keep the simulation coherent. |
| **Spatial Evaluation** | Score passing options using distance, pressure, and tactical instructions to create realistic ball progression. |
| **Commentary Generation** | Design templates for commentary that describe events accurately and engagingly. At this stage, simple rule-based phrases are sufficient, but the system should support richer language later. |

## Testing & Deployment

| Skill | Description |
|---|---|
| **Unit Testing** | Write tests for individual modules (physics calculations, rule enforcement, data import) to ensure reliability. |
| **Integration Testing** | Test the complete system by simulating matches and verifying that statistics, commentary, and physics behave as expected. |
| **Continuous Integration** | Use CI pipelines (GitHub Actions, GitLab CI) to run tests automatically upon commits. |
| **Deployment** | Prepare a build process that bundles client-side assets and deploys them to a static hosting provider or Node.js server. |

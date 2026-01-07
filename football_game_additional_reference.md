# Football Manager UI/UX and Additional Reference

This document supplements `football_game_reference.md` with insights into the UI/UX design of Football Manager games and other information useful for implementing a realistic football simulation.

## UI/UX Design References from Football Manager

Football Manager 26 introduced a comprehensive overhaul of its user interface. Understanding its guiding principles and layout will help you design an intuitive interface for your simulation.

### Core Design Principles

* **Efficiency, familiarity, predictability:** The FM26 design team prioritised making information faster to access, keeping the UI familiar to long-time players while ensuring new users can quickly master it. This meant reducing unnecessary clicks and providing quick access to general information.
* **Accessibility:** Font sizes and colour contrasts were improved, ensuring the interface is legible for all users.
* **Tiles and cards:** Every screen is built using a "tile and card" system where high-level information is displayed as tiles. Clicking a tile expands it into a detailed card, allowing users to see more data without leaving the current context.
* **Portal Home Screen:** FM26 merged the Inbox and Home screens into a single Portal that acts as a hub. It provides filters (All, New, Tasks, Unread) and integrates upcoming fixtures and calendar snapshots for quick decision-making.
* **Navigation bar and search:** A top navigation bar consolidates categories and sub-menus for faster access. The search system was overhauled to retrieve entities and contextual information across the game, making it easier to find anything from players to training modules.
* **FMPedia and bookmarks:** An in-game glossary (FMPedia) provides quick guides on tactics, rules, and features. Bookmarks allow users to customise shortcuts to their most-visited screens.

### Match Day Experience

* **Richer on-pitch visuals:** FM26 improved lighting, weather effects, stadium environments and animations to enhance realism. While your project focuses on a 2D view, noting these enhancements emphasises the importance of clarity and immersion.
* **New camera system and dynamic highlights:** A rebuilt camera system offers a wider range of angles, including a broadcast mode inspired by real TV coverage. A Dynamic Highlight mode automatically adjusts the number of highlights based on match context.
* **Match Overview screen:** Between highlights, FM26 introduces a Match Overview screen that embeds the classic 2D pitch view. It provides a clear picture of team performance along with assistant manager advice and expandable data cards, giving users actionable insights.
* **Assistant manager advice and data cards:** Live match information is accompanied by smarter advice from your assistant manager. Advice is contextual (e.g., suggesting lower tempo when leading) and integrates advanced metrics like expected goals (xG) and expected assists (xA). Expandable data cards deliver deeper analytics to inform tactical tweaks.

### Implications for Your Design

1. **Use a modular layout:** Adopt a tile/card pattern or similar to present high-level information at a glance while allowing users to drill down for details. For the 2D match view, a dedicated "Match Overview" panel could display the pitch alongside key statistics and tactical advice.
2. **Streamline navigation:** Incorporate a top navigation bar or side menu that groups related sections (e.g., Team Setup, Match Simulation, Player Data) with clear icons. Implement a search function to quickly find players, tactics, or historical matches.
3. **Contextual advice:** Provide in-match suggestions based on match state and statistics. This could be delivered via a panel below the pitch or as notifications, akin to FM26's assistant manager advice.
4. **Customisable shortcuts:** Allow users to bookmark their preferred screens, such as formation setup or transfer lists, to speed up repetitive tasks.

## Other Key References

### Pitch Dimensions

The Laws of the Game stipulate that the field of play must be rectangular. FIFA's recommended dimensions for professional matches are **105 metres x 68 metres**. The pitch should be level and marked with continuous boundary lines; additional turf beyond the touchlines and goal lines helps ensure player safety.

### Substitution Rules

The International Football Association Board (IFAB) permanently approved the option for competitions to allow up to **five substitutions per team**, with a maximum of **three substitution slots plus half-time** to limit match disruption. The number of named substitutes on the team sheet may be increased to 15 at the competition organiser's discretion. When implementing substitution mechanics, enforce the appropriate limits and ensure substitutions occur during natural stoppages.

### Match Duration

A standard match consists of two halves of 45 minutes plus additional stoppage time. For knockout competitions, extra time (two 15-minute periods) and penalty shoot-outs may apply if the score remains level. While your initial focus is on regulation play, ensure that the simulation engine can support extra time and penalties for future expansions.

### Commentary and Presentation

1. **2D Player Representation:** FM uses circular icons with smaller circles to represent feet; players are coloured differently based on team colours and roles. Maintain clarity by using contrasting colours for each team and legible numbering or identifiers.
2. **Stats Display:** Display match statistics (shots, possession, passes completed, etc.) alongside or below the pitch. Use charts or bars sparingly to avoid clutter.
3. **Event Notifications:** Provide textual commentary that narrates actions (passes, shots, fouls) and highlight key events such as goals, cards and substitutions. Allow users to adjust commentary verbosity (full commentary vs. highlights only).
4. **Speed Controls:** Place speed controls and pause/resume buttons within easy reach, such as above or below the pitch. Display the current speed multiplier clearly.

### Data Scaling and Integrity

Remember to map all imported player attributes onto a 0-100 scale for consistency. Validate input data to prevent unrealistic values. When designing UI elements for attribute display (e.g., radar charts or bar graphs), maintain readability and avoid overcrowding the screen.

### Future Extensions

Additional features such as dynamic weather, crowd noise, or advanced AI opponents can be incorporated in later iterations. Keep the UI design flexible to accommodate new panels or widgets without major restructuring.

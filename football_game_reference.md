# Football Simulation Game Reference Data

This document collects the key data sets that a web-based football simulation game may need. It lists the player attributes used by the Football Manager series, the PlayStyles (and PlayStyle+) available in EA Sports FC, the full set of team instructions introduced in Football Manager 26, the player roles available in FM26, and the duties that modify how roles behave. All facts are supported by citations to official or authoritative sources.

## Football Manager Player Attributes (Stats)

Football Manager games assign numerical ratings to a large set of attributes. When implementing a simulation, scale each attribute between 0 and 100. The attributes fall into several categories:

### Technical attributes

These control how well a player performs on the ball. Each is measured individually:

- **Corners** - quality of corner-kick deliveries.
- **Crossing** - accuracy of crosses from wide areas.
- **Dribbling** - ability to beat opponents with the ball.
- **Finishing** - ability to convert chances into goals.
- **First Touch** - control when receiving the ball.
- **Free Kick Taking** - quality of free-kick deliveries and shooting.
- **Heading** - accuracy and power when heading.
- **Long Shots** - ability to strike accurately from distance.
- **Long Throws** - distance and accuracy of throw-ins.
- **Marking** - ability to track and obstruct opponents.
- **Passing** - accuracy and variety of passes.
- **Penalty Taking** - nerve and accuracy from the penalty spot.
- **Tackling** - technique and timing of tackles.
- **Technique** - general ball-control and flair.

### Goalkeeping attributes

For goalkeepers, specialist attributes govern their ability to stop shots and distribute the ball:

- **Aerial Reach** - ability to claim high balls.
- **Command of Area** - authority in dealing with crosses and organising defence.
- **Communication** - clarity when directing defenders.
- **Eccentricity** - tendency to perform unexpected actions.
- **First Touch** - ball control when receiving passes.
- **Handling** - reliability in catching or parrying shots.
- **Kicking** - accuracy of long kicks.
- **One on Ones** - performance in one-vs-one situations.
- **Passing** - precision when playing short balls from the back.
- **Reflexes** - reaction time to shots.
- **Rushing Out** - willingness to leave the line to intercept through-balls.
- **Tendency to Punch** - preference for punching rather than catching crosses.
- **Throwing** - distance and accuracy of throws.

### Mental attributes

These measure decision-making and psychological traits:

- **Aggression** - willingness to contest for the ball.
- **Anticipation** - ability to read play and react.
- **Bravery** - willingness to put one's body on the line.
- **Composure** - calmness under pressure.
- **Concentration** - focus on tasks throughout a match.
- **Decisions** - quality of decision-making during play.
- **Determination** - desire to overcome adversity.
- **Flair** - tendency to try the unexpected.
- **Leadership** - ability to inspire teammates.
- **Off the Ball** - movement without the ball.
- **Positioning** - ability to be in the right place when defending.
- **Teamwork** - willingness to follow instructions and support colleagues.
- **Vision** - awareness of passing options.
- **Work Rate** - intensity and effort.

### Physical attributes

These determine athletic ability:

- **Acceleration** - how quickly a player reaches top speed.
- **Agility** - ease of changing direction.
- **Balance** - ability to stay on feet under pressure.
- **Jumping Reach** - height of jumps.
- **Natural Fitness** - overall physical resilience.
- **Pace** - maximum running speed.
- **Stamina** - ability to perform for the full match.
- **Strength** - ability to hold off opponents.

### Hidden attributes (intangibles)

These are normally unseen but influence behaviour:

- **Adaptability** - ease of settling in new environments.
- **Consistency** - reliability of performances.
- **Dirtiness** - likelihood of committing fouls.
- **Important Matches** - ability to perform in big games.
- **Injury Proneness** - susceptibility to injuries.
- **Versatility** - ability to play out of position.

## EA Sports FC PlayStyles and PlayStyle+ Effects

PlayStyles are special traits that modify how players perform in EA Sports FC. Each trait can have a **standard** effect and an enhanced **PlayStyle+** effect. Below is a categorized list of all PlayStyles introduced up to EA FC 26, with descriptions extracted from published guides and from official previews of the five new PlayStyles.

### Scoring PlayStyles

- **Power Shot** - Standard: power shots are struck harder and faster; PlayStyle+: shots become significantly more powerful and faster.
- **Dead Ball** - Standard: set-pieces have increased speed, curve and accuracy with a longer trajectory guide; PlayStyle+: deliveries are even faster and more accurate with a maximum-length guide.
- **Chip Shot** - Standard: chip shots travel faster and more accurately; PlayStyle+: chips are significantly faster and exceptionally accurate.
- **Finesse Shot** - Standard: finesse shots are taken faster with additional curve and improved accuracy; PlayStyle+: shots have maximum curve and exceptional accuracy.
- **Power Header** - Standard: headers possess extra power and accuracy; PlayStyle+: headed shots are executed with maximum power and accuracy.
- **Precision Header** (new in EA FC 26) - Standard: attacking headers are more accurate; PlayStyle+: headers deliver lethal power and pinpoint placement.

### Passing PlayStyles

- **Pinged Pass** - Standard: through passes are precise and travel quickly; PlayStyle+: passes are even more accurate with maximum curve and top speed.
- **Incisive Pass** - Standard: flat through-balls are faster; PlayStyle+: the passes are executed even faster.
- **Long Ball Pass** - Standard: lobbed passes travel faster and are harder to intercept; PlayStyle+: they become more accurate and even more difficult to intercept.
- **Tiki Taka** - Standard: first-time ground passes are executed accurately using back-heels when appropriate; short passes are highly accurate.
- **Whipped Pass** - Standard: crosses are delivered with greater pace, curve and accuracy; PlayStyle+: crosses travel even faster with maximum curve and accuracy.
- **Inventive** (new in EA FC 26) - Standard: players can execute trivela and no-look passes with improved accuracy; PlayStyle+: passes under pressure attain perfect accuracy.

### Ball-Control PlayStyles

- **First Touch** - Standard: reduced error when trapping the ball with faster transition to dribbling; PlayStyle+: virtually no error and ultra-fast transition.
- **Flair** - Standard: fancy passes and shots are performed with improved accuracy; PlayStyle+: they become significantly more precise.
- **Press Proven** - Standard: improved close control when dribbling at jogging speed; PlayStyle+: exceptional tight control under pressure.
- **Rapid** - Standard: higher dribbling speed with reduced error; PlayStyle+: even higher speed and lower error.
- **Technical** - Standard: higher speed while performing controlled sprints; PlayStyle+: even greater speed and more precise turns.
- **Trickster** - Standard: grants unique flick skill-moves; PlayStyle+: provides more unique flicks and extra agility.
- **Gamechanger** (new in EA FC 26) - Standard: combines flair and trivela finishing, enabling extraordinary shots; PlayStyle+: increases consistency on fancy shots even from difficult positions.

### Defending PlayStyles

- **Block** - Standard: increases reach when blocking shots; PlayStyle+: further enhances block reach and success.
- **Bruiser** - Standard: grants greater strength in physical tackles; PlayStyle+: makes tackles significantly more forceful.
- **Intercept** - Standard: expands the interception range and improves chances of retaining possession; PlayStyle+: further increases range and retention.
- **Jockey** - Standard: improves speed while jockeying; PlayStyle+: speeds up transition from jockey to sprint.
- **Slide Tackle** - Standard: allows stopping the ball at the tackler's feet when sliding; PlayStyle+: increases the radius of this effect.
- **Anticipate** - Standard: raises likelihood of winning the ball in normal tackles and controlling it; PlayStyle+: greatly increases this chance.
- **Acrobatic** - Standard: volleys are more accurate with special animations; PlayStyle+: even more accurate volleys with additional acrobatic animations.
- **Aerial** - Standard: players jump higher and have improved aerial presence; PlayStyle+: even higher jump and stronger aerial duels.
- **Aerial Fortress** (new in EA FC 26) - Standard: significantly increases jump height and physical presence during defensive headers; PlayStyle+: almost guarantees winning aerial duels in defensive situations.

### Physical and Other PlayStyles

- **Trivela** - Standard: contextually triggers outside-of-the-foot passes and shots; PlayStyle+: same ability with reduced error.
- **Relentless** - Standard: reduces stamina loss and improves recovery at half-time; PlayStyle+: dramatically reduces fatigue and improves recovery.
- **Quick Step** - Standard: faster acceleration during sprints; PlayStyle+: accelerates significantly faster.
- **Long Throw** - Standard: throw-ins have more power and distance; PlayStyle+: throws are significantly more powerful with maximum range.
- **Enforcer** (new in EA FC 26) - Standard: enhances shoulder-to-shoulder challenges and ball shielding; PlayStyle+: allows shielding off multiple defenders at once.

### Goalkeeping PlayStyles

- **Far Throw** - Standard: goalkeepers can throw the ball further to start attacks.
- **Footwork** - Standard: goalkeepers use their feet to make saves more often, aiding in close-range situations.
- **Cross Claimer** - Standard: goalkeepers aggressively intercept crosses when possible.
- **Rush Out** - Standard: goalkeepers leave their goal to challenge through-balls; PlayStyle+: even more aggressive and effective.
- **Far Reach** - Standard: goalkeepers can reach shots further from their body; PlayStyle+: increases reach and reaction time.
- **Quick Reflexes** - Standard: quicker reaction to shots; PlayStyle+: increases reaction time further.

## Football Manager 26 Team Instructions

FM26 introduced context-sensitive team instructions that are shown depending on the phase of play. They are grouped into **In Possession** (when your team has the ball) and **Out of Possession** (when the opponent has the ball). Each instruction offers selectable options and has tactical implications.

### In Possession instructions

- **Passing Directness** - Options: *Much Shorter*, *Shorter*, *Balanced*, *More Direct*, *Much More Direct*. Controls pass length and speed.
- **Tempo** - Options: *Lower*, *Standard*, *Higher*. Determines how quickly the team moves the ball and makes decisions.
- **Time Wasting** - Options: *Less Often*, *Standard*, *More Often*. Governs deliberate time-wasting when ahead.
- **Attacking Transition** - Options: *Counter-Attack*, *Standard*, *Patient Build-Up*. Sets how the team reacts immediately after winning possession.
- **Attacking Width** - Options: *Much Narrower*, *Narrower*, *Standard*, *Wider*, *Much Wider*. Controls how spread out the team becomes in attack.
- **Creative Freedom** - Options: *More Disciplined*, *Balanced*, *More Expressive*. Dictates the amount of risk-taking and flair allowed.
- **Play for Set Pieces** - Options: *Keep Ball in Play*, *Standard*. Chooses whether to deliberately win set-pieces or maintain possession.
- **Build-Up Strategy** - Options: *Play Through Press*, *Mixed*, *Direct*. Determines whether to pass through pressing opponents or bypass them.
- **Goal Kicks** - Options: *Short*, *Mixed*, *Long*. Sets how the goalkeeper restarts play.
- **GK Distribution (Speed)** - Options: *Slower*, *Balanced*, *Faster*. Dictates how quickly the goalkeeper releases the ball after collecting it.
- **GK Distribution (Target)** - Options: *Centre-Backs*, *Full-Backs*, *Midfielders*, *Forwards*. Decides which teammates receive distribution.
- **Pass Reception** - Options: *Balanced*, *Overlapped*. Controls how players position themselves to receive passes; overlapped positions into pockets.
- **Dribbling** - Options: *Reduced*, *Balanced*, *Encouraged*. Regulates how often players attempt to dribble past opponents.
- **Supporting Runs** - Options: *Both Flanks*, *One Flank*, *Balanced*. Specifies where supporting players make runs to aid attacks.
- **Progress Through** - Options: *Left*, *Balanced*, *Right*. Sets the preferred flank for moving the ball forward.
- **Patience** - Options: *Work Ball Into Box*, *Balanced*, *Less Often*. Governs how patiently the team works the ball in the final third.
- **Shots from Distance** - Options: *Reduced*, *Balanced*, *Encouraged*. Adjusts the frequency of long-range shots.
- **Crossing Style** - Options: *Low Crosses*, *Balanced*, *High Crosses*. Chooses the type of crosses delivered into the box.

### Out of Possession instructions

- **Line of Engagement** - Options: *High Press*, *Mid Block*, *Low Block*. Determines where on the pitch pressing begins.
- **Defensive Line** - Options: *Deeper*, *Standard*, *Higher*, *Much Higher*. Sets how high the defensive line holds.
- **Defensive Line Behaviour** - Options: *Balanced*, *Offside Trap*, *Step Up*. Controls how defenders respond to attacking runs.
- **Trigger Press** - Options: *Less Often*, *Balanced*, *More Often*. Determines how frequently players close down opponents.
- **Defensive Transition** - Options: *Counter-Press*, *Standard*, *Regroup*. Sets the team's approach immediately after losing possession.
- **Tackling** - Options: *Ease Off*, *Standard*, *Aggressive*. Adjusts tackling intensity.
- **Pressing Trap** - Options: *Balanced*, *Active*. Configures whether the team sets coordinated pressing traps.
- **Short Goalkeeper Distribution** - Options: *Yes*, *No*. Specifies whether forwards press opposing goalkeepers to force long kicks.
- **Cross Engagement** - Options: *Hold Position*, *Balanced*, *Contest*. Controls how defenders deal with crosses.

## Football Manager 26 Player Roles

FM26 splits many positions into **In Possession** and **Out of Possession** roles, reflecting modern tactical demands. Below is a concise list of roles by position with a brief description and whether the role is new to FM26.

### Goalkeeper roles

- **Goalkeeper** - Balanced role; distributes according to team strategy.
- **Line-Holding Keeper** - New; remains in the box, avoiding sweeper actions.
- **No-Nonsense Goalkeeper** - New; safety-first distribution and risk-averse play.
- **Sweeper Keeper** - Intercepts balls outside the box; proactive in defence.
- **Ball-Playing Goalkeeper** - Joins the build-up phase like an outfield player.

### Centre-Back roles

- **Centre-Back** - Balanced defender who assists in regaining possession.
- **No-Nonsense CB** - Clears danger and avoids risky passes.
- **Covering CB** - Holds the defensive line and reacts to attackers.
- **Stopping CB** - Steps out aggressively to challenge attackers early.
- **Ball-Playing CB** - Plays line-breaking passes and dribbles forward.
- **Overlapping CB** - Moves into wide areas to support attacks.
- **Advanced CB** - New; transitions into a defensive-midfield role during build-up.
- **Wide CB** (and Covering/Stopping variations) - Provides width and recycling options.

### Full-Back roles

- **Full-Back** - Balanced; supports attacks with overlaps.
- **Holding Full-Back** - New; stays deeper when pressing.
- **Inside Full-Back** - New; tucks behind centre-backs for build-up.
- **Inverted Full-Back** - Moves into midfield to create overloads.
- **Pressing Full-Back** - New; supports high press and operates like a defensive winger.

### Wing-Back roles

- **Wing-Back** - Combines full-back and winger duties; overlaps and supports attacks.
- **Holding Wing-Back** - New; stays deeper during pressing phases.
- **Inside Wing-Back** - New; shuttles inside to support central build-up.
- **Inverted Wing-Back** - Plays like a defensive midfielder, moving centrally.
- **Pressing Wing-Back** - New; presses opponents high up the pitch.
- **Playmaking Wing-Back** - New; acts as a central hub of passing, creating chances from deep.
- **Advanced Wing-Back** - New; stays high and wide, similar to a wide midfielder.

### Defensive Midfield roles

- **Defensive Midfielder** - Shields the defence, recycles possession.
- **Dropping DM** - New; drops into the backline when under pressure.
- **Screening DM** - New; holds central zones to cut off passing lanes.
- **Wide Covering DM** - New; shifts wide to help full-backs.
- **Half-Back** - Drops between centre-backs during build-up.
- **Pressing DM** - New; steps forward aggressively to press.
- **Deep-Lying Playmaker** - Sits deep and initiates attacks with precise passes.

### Central Midfield roles

- **Central Midfielder** - Balanced role supporting defence and attack.
- **Screening CM** - New; holds the central zone defensively.
- **Wide Covering CM** - New; shifts wide to cover flanks.
- **Box-to-Box Midfielder** - Covers the entire pitch, contributing in both boxes.
- **Box-to-Box Playmaker** - New; creative variant of the B2B midfielder.
- **Channel Midfielder** - New; makes under-lapping runs into wide channels.
- **Midfield Playmaker** - New; creative link who may move into attacking midfield.
- **Pressing CM** - New; steps up to press opponents high.

### Wide Midfield roles

- **Wide Midfielder** - Plays deeper and delivers crosses from wide areas.
- **Tracking Wide Midfielder** - New; drops deep to defend.
- **Wide Central Midfielder** - New; operates wide within a midfield trio.
- **Wide Outlet Midfielder** - New; stays high to provide an outlet without defensive duties.

### Attacking Midfield roles

- **Attacking Midfielder** - Operates between the lines to create space.
- **Tracking AM** - New; drops deep to help defend.
- **Advanced Playmaker** - Creates chances in advanced central areas.
- **Central Outlet AM** - New; remains high, avoiding defensive work.
- **Splitting Outlet AM** - New; stays high and drifts wide to aid counters.
- **Free Role** - New; roams creatively across the attacking third.

### Winger roles

- **Winger** - Stretches play on the flank and delivers crosses.
- **Half-Space Winger** - New; cuts inside into half-spaces.
- **Inside Winger** - New; similar to half-space winger but with slightly different movement patterns.
- **Inverting Outlet Winger** - New; stays high and moves inside to support counters.
- **Tracking Winger** - New; drops deep to provide defensive cover.
- **Wide Outlet Winger** - New; stays high and wide, avoiding defensive duties.
- **Wide Playmaker** - New; starts wide and drifts inside to create chances.
- **Wide Forward** - New; wide attacker who makes runs into the box.
- **Inside Forward** - Moves inside from the wing to attack central spaces.

### Striker roles

- **False Nine** - Drops deep to create space and play-make.
- **Deep-Lying Forward** - Links midfield and attack, distributing play.
- **Half-Space Forward** - New; wide attacker who cuts inside into channels.
- **Second Striker** - New; drops deep early and then runs forward to score.
- **Channel Forward** - New; runs into wide channels, stretching defences.
- **Centre Forward** - Classic number 9 who leads the line.
- **Central Outlet CF** - New; stays high and central, contributing little defensively.
- **Splitting Outlet CF** - New; stays high and drifts wide to aid counter-attacks.
- **Tracking CF** - New; drops deep to help defend.
- **Target Forward** - Provides a physical presence and aerial threat.
- **Poacher** - Stays central and looks to finish chances.

## Player Duties

Player duties modify how aggressively a role behaves. They range from high-risk attacking roles to more conservative defensive ones. The **Guide to FM** explains that the duties, from higher to lower risk, are Attack, Support and Defend/Stopper/Cover. A fourth duty, Automatic, adjusts based on your team mentality.

- **Attack** - Players on an Attack duty make aggressive forward runs, take risks and prioritise scoring or creating goals. This is the highest-risk duty.
- **Support** - Balances attacking and defensive responsibilities; players contribute to building attacks while retaining positional discipline.
- **Defend** - Players hold position, maintain shape and focus on stopping opponents. Suitable for maintaining solidity.
- **Stopper** - Centre-back-only duty; the defender steps out of the line to engage attackers aggressively, attempting to win the ball early.
- **Cover** - Another centre-back-only duty; the defender stays deeper to sweep up behind the defensive line.
- **Automatic** - Duty that changes based on team mentality: acts like Attack in attacking mentalities and like Defend in defensive ones.

---

This reference should help developers assemble realistic mechanics for a football simulation game. The attribute lists, PlayStyles, team instructions, roles and duties herein are drawn from authoritative Football Manager and EA Sports FC sources to inform implementation.

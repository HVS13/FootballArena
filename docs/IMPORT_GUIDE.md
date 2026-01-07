# Player Import Guide

This guide lists every supported import column, the allowed values, and the available options. It applies to both CSV and JSON imports.

## Required Columns (CSV) / Fields (JSON)

- `name`: Player display name (string).
- `positions`: One or more positions (string list). Separate values with `|`, `;`, or `/` in CSV. No enforced list; use your preferred naming.
- **All Football Manager attributes** listed below (1-20 or 0-100; values on 1-20 scale are converted to 0-100).

## Optional Columns / Fields

- `team`: Team name (string). If omitted, defaults to `Team A`.
- `id`: Player id (string).
- `shirtNo`: 1-99 (integer).
- `age`: 14-45 (number).
- `heightCm`: 140-220 (number).
- `weightKg`: 45-120 (number).
- `leftFoot`: 0-100 or 1-20 (scaled to 0-100).
- `rightFoot`: 0-100 or 1-20 (scaled to 0-100).
- `nationality`: free-form string.
- `playstyles`: EA FC PlayStyle names or ids, separated by `|`, `;`, or `/`.
- `playstylesPlus`: EA FC PlayStyle+ names or ids, separated by `|`, `;`, or `/`.
- `playerTraits`: Football Manager Player Traits, separated by `|`, `;`, or `/`.

## Accepted Column Aliases

- `playstyles`: also accepts `playstyle`, `play_styles`.
- `playstylesPlus`: also accepts `playstyle_plus`, `playstyles_plus`, `playstylePlus`, `playstylesPlus`.
- `playerTraits`: also accepts `player_traits`, `traits`.
- `shirtNo`: also accepts `shirt_no`, `shirt`, `number`, `shirtNumber`.
- `heightCm`: also accepts `height_cm`, `height`, `Height`, `height (cm)`.
- `weightKg`: also accepts `weight_kg`, `weight`, `Weight`, `weight (kg)`.
- `leftFoot`: also accepts `left_foot`, `left foot`, `Left Foot`, `leftfoot`.
- `rightFoot`: also accepts `right_foot`, `right foot`, `Right Foot`, `rightfoot`.
- `nationality`: also accepts `nation`, `country`.

## Attribute Columns (All Required)

Attribute headers are matched case-insensitively by name. Non-alphanumeric characters are ignored, so `Long Shots`, `long_shots`, and `longshots` are treated the same.

### Technical
- `Corners`: quality of corner-kick deliveries.
- `Crossing`: accuracy of crosses from wide areas.
- `Dribbling`: ability to beat opponents with the ball.
- `Finishing`: ability to convert chances into goals.
- `First Touch`: control when receiving the ball.
- `Free Kick Taking`: quality of free-kick deliveries and shooting.
- `Heading`: accuracy and power when heading.
- `Long Shots`: ability to strike accurately from distance.
- `Long Throws`: distance and accuracy of throw-ins.
- `Marking`: ability to track and obstruct opponents.
- `Passing`: accuracy and variety of passes.
- `Penalty Taking`: nerve and accuracy from the penalty spot.
- `Tackling`: technique and timing of tackles.
- `Technique`: general ball-control and flair.

### Goalkeeping
- `Aerial Reach`: ability to claim high balls.
- `Command of Area`: authority in dealing with crosses and organising defence.
- `Communication`: clarity when directing defenders.
- `Eccentricity`: tendency to perform unexpected actions.
- `First Touch`: ball control when receiving passes.
- `Handling`: reliability in catching or parrying shots.
- `Kicking`: accuracy of long kicks.
- `One on Ones`: performance in one-vs-one situations.
- `Passing`: precision when playing short balls from the back.
- `Reflexes`: reaction time to shots.
- `Rushing Out`: willingness to leave the line to intercept through-balls.
- `Tendency to Punch`: preference for punching rather than catching crosses.
- `Throwing`: distance and accuracy of throws.

### Mental
- `Aggression`: willingness to contest for the ball.
- `Anticipation`: ability to read play and react.
- `Bravery`: willingness to put one's body on the line.
- `Composure`: calmness under pressure.
- `Concentration`: focus on tasks throughout a match.
- `Decisions`: quality of decision-making during play.
- `Determination`: desire to overcome adversity.
- `Flair`: tendency to try the unexpected.
- `Leadership`: ability to inspire teammates.
- `Off the Ball`: movement without the ball.
- `Positioning`: ability to be in the right place when defending.
- `Teamwork`: willingness to follow instructions and support colleagues.
- `Vision`: awareness of passing options.
- `Work Rate`: intensity and effort.

### Physical
- `Acceleration`: how quickly a player reaches top speed.
- `Agility`: ease of changing direction.
- `Balance`: ability to stay on feet under pressure.
- `Jumping Reach`: height of jumps.
- `Natural Fitness`: overall physical resilience.
- `Pace`: maximum running speed.
- `Stamina`: ability to perform for the full match.
- `Strength`: ability to hold off opponents.

### Hidden
- `Adaptability`: ease of settling in new environments.
- `Consistency`: reliability of performances.
- `Dirtiness`: likelihood of committing fouls.
- `Important Matches`: ability to perform in big games.
- `Injury Proneness`: susceptibility to injuries.
- `Versatility`: ability to play out of position.

## EA FC PlayStyles (playstyles / playstylesPlus)

Provide any of the names or ids below:

- `Power Shot` (id: power_shot, category: Scoring): Standard: power shots are struck harder and faster; PlayStyle+: shots become significantly more powerful and faster.
- `Dead Ball` (id: dead_ball, category: Scoring): Standard: set-pieces have increased speed, curve and accuracy with a longer trajectory guide; PlayStyle+: deliveries are even faster and more accurate with a maximum-length guide.
- `Chip Shot` (id: chip_shot, category: Scoring): Standard: chip shots travel faster and more accurately; PlayStyle+: chips are significantly faster and exceptionally accurate.
- `Finesse Shot` (id: finesse_shot, category: Scoring): Standard: finesse shots are taken faster with additional curve and improved accuracy; PlayStyle+: shots have maximum curve and exceptional accuracy.
- `Power Header` (id: power_header, category: Scoring): Standard: headers possess extra power and accuracy; PlayStyle+: headed shots are executed with maximum power and accuracy.
- `Precision Header` (id: precision_header, category: Scoring): new in EA FC 26. Standard: attacking headers are more accurate; PlayStyle+: headers deliver lethal power and pinpoint placement.
- `Pinged Pass` (id: pinged_pass, category: Passing): Standard: through passes are precise and travel quickly; PlayStyle+: passes are even more accurate with maximum curve and top speed.
- `Incisive Pass` (id: incisive_pass, category: Passing): Standard: flat through-balls are faster; PlayStyle+: the passes are executed even faster.
- `Long Ball Pass` (id: long_ball_pass, category: Passing): Standard: lobbed passes travel faster and are harder to intercept; PlayStyle+: they become more accurate and even more difficult to intercept.
- `Tiki Taka` (id: tiki_taka, category: Passing): Standard: first-time ground passes are executed accurately using back-heels when appropriate; short passes are highly accurate.
- `Whipped Pass` (id: whipped_pass, category: Passing): Standard: crosses are delivered with greater pace, curve and accuracy; PlayStyle+: crosses travel even faster with maximum curve and accuracy.
- `Inventive` (id: inventive, category: Passing): new in EA FC 26. Standard: players can execute trivela and no-look passes with improved accuracy; PlayStyle+: passes under pressure attain perfect accuracy.
- `First Touch` (id: first_touch, category: Ball-Control): Standard: reduced error when trapping the ball with faster transition to dribbling; PlayStyle+: virtually no error and ultra-fast transition.
- `Flair` (id: flair, category: Ball-Control): Standard: fancy passes and shots are performed with improved accuracy; PlayStyle+: they become significantly more precise.
- `Press Proven` (id: press_proven, category: Ball-Control): Standard: improved close control when dribbling at jogging speed; PlayStyle+: exceptional tight control under pressure.
- `Rapid` (id: rapid, category: Ball-Control): Standard: higher dribbling speed with reduced error; PlayStyle+: even higher speed and lower error.
- `Technical` (id: technical, category: Ball-Control): Standard: higher speed while performing controlled sprints; PlayStyle+: even greater speed and more precise turns.
- `Trickster` (id: trickster, category: Ball-Control): Standard: grants unique flick skill-moves; PlayStyle+: provides more unique flicks and extra agility.
- `Gamechanger` (id: gamechanger, category: Ball-Control): new in EA FC 26. Standard: combines flair and trivela finishing, enabling extraordinary shots; PlayStyle+: increases consistency on fancy shots even from difficult positions.
- `Block` (id: block, category: Defending): Standard: increases reach when blocking shots; PlayStyle+: further enhances block reach and success.
- `Bruiser` (id: bruiser, category: Defending): Standard: grants greater strength in physical tackles; PlayStyle+: makes tackles significantly more forceful.
- `Intercept` (id: intercept, category: Defending): Standard: expands the interception range and improves chances of retaining possession; PlayStyle+: further increases range and retention.
- `Jockey` (id: jockey, category: Defending): Standard: improves speed while jockeying; PlayStyle+: speeds up transition from jockey to sprint.
- `Slide Tackle` (id: slide_tackle, category: Defending): Standard: allows stopping the ball at the tackler's feet when sliding; PlayStyle+: increases the radius of this effect.
- `Anticipate` (id: anticipate, category: Defending): Standard: raises likelihood of winning the ball in normal tackles and controlling it; PlayStyle+: greatly increases this chance.
- `Acrobatic` (id: acrobatic, category: Defending): Standard: volleys are more accurate with special animations; PlayStyle+: even more accurate volleys with additional acrobatic animations.
- `Aerial` (id: aerial, category: Defending): Standard: players jump higher and have improved aerial presence; PlayStyle+: even higher jump and stronger aerial duels.
- `Aerial Fortress` (id: aerial_fortress, category: Defending): new in EA FC 26. Standard: significantly increases jump height and physical presence during defensive headers; PlayStyle+: almost guarantees winning aerial duels in defensive situations.
- `Trivela` (id: trivela, category: Physical and Other): Standard: contextually triggers outside-of-the-foot passes and shots; PlayStyle+: same ability with reduced error.
- `Relentless` (id: relentless, category: Physical and Other): Standard: reduces stamina loss and improves recovery at half-time; PlayStyle+: dramatically reduces fatigue and improves recovery.
- `Quick Step` (id: quick_step, category: Physical and Other): Standard: faster acceleration during sprints; PlayStyle+: accelerates significantly faster.
- `Long Throw` (id: long_throw, category: Physical and Other): Standard: throw-ins have more power and distance; PlayStyle+: throws are significantly more powerful with maximum range.
- `Enforcer` (id: enforcer, category: Physical and Other): new in EA FC 26. Standard: enhances shoulder-to-shoulder challenges and ball shielding; PlayStyle+: allows shielding off multiple defenders at once.
- `Far Throw` (id: far_throw, category: Goalkeeping): Standard: goalkeepers can throw the ball further to start attacks.
- `Footwork` (id: footwork, category: Goalkeeping): Standard: goalkeepers use their feet to make saves more often, aiding in close-range situations.
- `Cross Claimer` (id: cross_claimer, category: Goalkeeping): Standard: goalkeepers aggressively intercept crosses when possible.
- `Rush Out` (id: rush_out, category: Goalkeeping): Standard: goalkeepers leave their goal to challenge through-balls; PlayStyle+: even more aggressive and effective.
- `Far Reach` (id: far_reach, category: Goalkeeping): Standard: goalkeepers can reach shots further from their body; PlayStyle+: increases reach and reaction time.
- `Quick Reflexes` (id: quick_reflexes, category: Goalkeeping): Standard: quicker reaction to shots; PlayStyle+: increases reaction time further.

## Football Manager Player Traits (playerTraits)

Provide any of the names or ids below:

- `Argues with Officials` (id: argues_with_officials)
- `Arrives Late in Opponent's Area` (id: arrives_late_in_opponents_area)
- `Attempts Overhead Kicks` (id: attempts_overhead_kicks)
- `Attempts to Develop Weaker Foot` (id: attempts_to_develop_weaker_foot)
- `Avoids Using Weaker Foot` (id: avoids_using_weaker_foot)
- `Comes Deep to Get Ball` (id: comes_deep_to_get_ball)
- `Curls Ball` (id: curls_ball)
- `Cuts Inside` (id: cuts_inside)
- `Dictates Tempo` (id: dictates_tempo)
- `Dives Into Tackles` (id: dives_into_tackles)
- `Does Not Dive Into Tackles` (id: does_not_dive_into_tackles)
- `Dwells on Ball` (id: dwells_on_ball)
- `Gets Forward Whenever Possible` (id: gets_forward_whenever_possible)
- `Gets Into Opposition Area` (id: gets_into_opposition_area)
- `Hits Free Kicks with Power` (id: hits_free_kicks_with_power)
- `Hugs Line` (id: hugs_line)
- `Knocks Ball Past Opponent` (id: knocks_ball_past_opponent)
- `Likes to Lob Keeper` (id: likes_to_lob_keeper)
- `Likes to Round Keeper` (id: likes_to_round_keeper)
- `Likes to Switch Ball to Other Flank` (id: likes_to_switch_ball_to_other_flank)
- `Likes to Try To Beat Offside Trap` (id: likes_to_try_to_beat_offside_trap)
- `Looks for Pass Rather Than Attempting to Score` (id: looks_for_pass_rather_than_attempting_to_score)
- `Marks Opponent Tightly` (id: marks_opponent_tightly)
- `Moves Into Channels` (id: moves_into_channels)
- `Penalty Box Player` (id: penalty_box_player)
- `Places Shots` (id: places_shots)
- `Plays No Through Balls` (id: plays_no_through_balls)
- `Plays One-Twos` (id: plays_one_twos)
- `Plays Short Simple Passes` (id: plays_short_simple_passes)
- `Plays with Back to Goal` (id: plays_with_back_to_goal)
- `Possesses Long Flat Throw` (id: possesses_long_flat_throw)
- `Refrains From Taking Long Shots` (id: refrains_from_taking_long_shots)
- `Runs With Ball Down Left` (id: runs_with_ball_down_left)
- `Runs With Ball Down Right` (id: runs_with_ball_down_right)
- `Runs With Ball Often` (id: runs_with_ball_often)
- `Runs With Ball Rarely` (id: runs_with_ball_rarely)
- `Runs With Ball Down Centre` (id: runs_with_ball_down_centre)
- `Shoots From Distance` (id: shoots_from_distance)
- `Shoots With Power` (id: shoots_with_power)
- `Stays Back at All Times` (id: stays_back_at_all_times)
- `Stops Play` (id: stops_play)
- `Tries First Time Shots` (id: tries_first_time_shots)
- `Tries Killer Balls Often` (id: tries_killer_balls_often)
- `Tries Long Range Passes` (id: tries_long_range_passes)
- `Tries Long Range Free Kicks` (id: tries_long_range_free_kicks)
- `Tries To Play Way Out Of Trouble` (id: tries_to_play_way_out_of_trouble)
- `Uses Long Throw To Start Counter Attacks` (id: uses_long_throw_to_start_counter_attacks)

## JSON Example

```json
{
  "teams": [
    {
      "name": "Team A",
      "players": [
        {
          "id": "10",
          "name": "Player Name",
          "shirtNo": 10,
          "age": 27,
          "heightCm": 182,
          "weightKg": 77,
          "leftFoot": 55,
          "rightFoot": 90,
          "nationality": "Indonesia",
          "positions": ["ST", "AM"],
          "playstyles": ["Power Shot", "Rapid"],
          "playstylesPlus": ["Finesse Shot"],
          "playerTraits": ["Shoots From Distance", "Runs With Ball Often"],
          "attributes": {
            "Finishing": 15,
            "Pace": 14,
            "Stamina": 13
          }
        }
      ]
    }
  ]
}
```

## CSV Example (Truncated)

```csv
team,name,shirtNo,age,heightCm,weightKg,leftFoot,rightFoot,nationality,positions,playstyles,playstylesPlus,playerTraits,Finishing,Pace,Stamina
Team A,Player Name,10,27,182,77,55,90,Indonesia,ST|AM,Power Shot|Rapid,Finesse Shot,Shoots From Distance|Runs With Ball Often,15,14,13
```
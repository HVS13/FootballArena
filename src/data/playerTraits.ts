import { normalizeKey } from './referenceData';

export type PlayerTrait = {
  id: string;
  name: string;
};

export const PLAYER_TRAITS: PlayerTrait[] = [
  { id: 'argues_with_officials', name: 'Argues with Officials' },
  { id: 'arrives_late_in_opponents_area', name: "Arrives Late in Opponent's Area" },
  { id: 'attempts_overhead_kicks', name: 'Attempts Overhead Kicks' },
  { id: 'attempts_to_develop_weaker_foot', name: 'Attempts to Develop Weaker Foot' },
  { id: 'avoids_using_weaker_foot', name: 'Avoids Using Weaker Foot' },
  { id: 'comes_deep_to_get_ball', name: 'Comes Deep to Get Ball' },
  { id: 'curls_ball', name: 'Curls Ball' },
  { id: 'cuts_inside', name: 'Cuts Inside' },
  { id: 'dictates_tempo', name: 'Dictates Tempo' },
  { id: 'dives_into_tackles', name: 'Dives Into Tackles' },
  { id: 'does_not_dive_into_tackles', name: 'Does Not Dive Into Tackles' },
  { id: 'dwells_on_ball', name: 'Dwells on Ball' },
  { id: 'gets_forward_whenever_possible', name: 'Gets Forward Whenever Possible' },
  { id: 'gets_into_opposition_area', name: 'Gets Into Opposition Area' },
  { id: 'hits_free_kicks_with_power', name: 'Hits Free Kicks with Power' },
  { id: 'hugs_line', name: 'Hugs Line' },
  { id: 'knocks_ball_past_opponent', name: 'Knocks Ball Past Opponent' },
  { id: 'likes_to_lob_keeper', name: 'Likes to Lob Keeper' },
  { id: 'likes_to_round_keeper', name: 'Likes to Round Keeper' },
  { id: 'likes_to_switch_ball_to_other_flank', name: 'Likes to Switch Ball to Other Flank' },
  { id: 'likes_to_try_to_beat_offside_trap', name: 'Likes to Try To Beat Offside Trap' },
  { id: 'looks_for_pass_rather_than_attempting_to_score', name: 'Looks for Pass Rather Than Attempting to Score' },
  { id: 'marks_opponent_tightly', name: 'Marks Opponent Tightly' },
  { id: 'moves_into_channels', name: 'Moves Into Channels' },
  { id: 'penalty_box_player', name: 'Penalty Box Player' },
  { id: 'places_shots', name: 'Places Shots' },
  { id: 'plays_no_through_balls', name: 'Plays No Through Balls' },
  { id: 'plays_one_twos', name: 'Plays One-Twos' },
  { id: 'plays_short_simple_passes', name: 'Plays Short Simple Passes' },
  { id: 'plays_with_back_to_goal', name: 'Plays with Back to Goal' },
  { id: 'possesses_long_flat_throw', name: 'Possesses Long Flat Throw' },
  { id: 'refrains_from_taking_long_shots', name: 'Refrains From Taking Long Shots' },
  { id: 'runs_with_ball_down_left', name: 'Runs With Ball Down Left' },
  { id: 'runs_with_ball_down_right', name: 'Runs With Ball Down Right' },
  { id: 'runs_with_ball_often', name: 'Runs With Ball Often' },
  { id: 'runs_with_ball_rarely', name: 'Runs With Ball Rarely' },
  { id: 'runs_with_ball_down_centre', name: 'Runs With Ball Down Centre' },
  { id: 'shoots_from_distance', name: 'Shoots From Distance' },
  { id: 'shoots_with_power', name: 'Shoots With Power' },
  { id: 'stays_back_at_all_times', name: 'Stays Back at All Times' },
  { id: 'stops_play', name: 'Stops Play' },
  { id: 'tries_first_time_shots', name: 'Tries First Time Shots' },
  { id: 'tries_killer_balls_often', name: 'Tries Killer Balls Often' },
  { id: 'tries_long_range_passes', name: 'Tries Long Range Passes' },
  { id: 'tries_long_range_free_kicks', name: 'Tries Long Range Free Kicks' },
  { id: 'tries_to_play_way_out_of_trouble', name: 'Tries To Play Way Out Of Trouble' },
  { id: 'uses_long_throw_to_start_counter_attacks', name: 'Uses Long Throw To Start Counter Attacks' }
];

export const playerTraitIdMap = new Map(
  PLAYER_TRAITS.flatMap((trait) => [
    [normalizeKey(trait.name), trait.id],
    [normalizeKey(trait.id), trait.id]
  ])
);

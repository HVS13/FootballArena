import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataImportAgent } from '../agents/DataImportAgent';
import FormationPitch from '../components/FormationPitch';
import { ENVIRONMENT_PRESETS } from '../data/environmentPresets';
import { MATCH_IMPORTANCE_LEVELS } from '../data/matchImportance';
import { referenceData } from '../data/referenceData';
import { FORMATIONS, buildLineupSlots } from '../data/formations';
import { DEFAULT_SET_PIECE_SETTINGS, SET_PIECE_WIZARD_QUESTIONS } from '../data/setPieceWizard';
import { TACTICAL_PRESETS } from '../data/tacticalPresets';
import { DEFAULT_ENVIRONMENT, EnvironmentState } from '../domain/environmentTypes';
import { ImportError, TeamImport } from '../domain/types';
import { TeamSetup, TeamSetupState } from '../domain/teamSetupTypes';
import { useAppState } from '../state/appState';

const TEAM_KITS = [
  { primary: '#f43f5e', secondary: '#f8fafc' },
  { primary: '#38bdf8', secondary: '#0f172a' }
];
const WEATHER_OPTIONS = ['clear', 'overcast', 'rain', 'snow', 'storm'] as const;
const PITCH_OPTIONS = ['pristine', 'good', 'worn', 'heavy'] as const;
const CUSTOM_PRESET_ID = 'custom';

const toLabel = (value: string) =>
  value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const buildInstructionDefaults = () => {
  const defaults: Record<string, string> = {};
  const allInstructions = [
    ...referenceData.teamInstructions.inPossession,
    ...referenceData.teamInstructions.outOfPossession
  ];

  allInstructions.forEach((instruction) => {
    defaults[instruction.id] = instruction.options?.[0] ?? '';
  });

  return defaults;
};

const clampValue = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clampPosition = (value: number) => clampValue(value, 0.04, 0.96);

const toRadians = (deg: number) => (deg * Math.PI) / 180;

const buildOutOfPossessionSlots = (team: TeamSetup, teamIndex: number) => {
  const direction = teamIndex === 1 ? -1 : 1;
  const instructions = team.instructions;
  const lineOfEngagement = instructions.line_of_engagement ?? 'Mid Block';
  const defensiveLine = instructions.defensive_line ?? 'Standard';
  const defensiveLineBehavior = instructions.defensive_line_behaviour ?? 'Balanced';
  const defensiveTransition = instructions.defensive_transition ?? 'Standard';

  const engagementShift =
    lineOfEngagement === 'High Press' ? 0.06 : lineOfEngagement === 'Low Block' ? -0.06 : 0.02;
  const lineShift =
    defensiveLine === 'Much Higher'
      ? 0.06
      : defensiveLine === 'Higher'
        ? 0.03
        : defensiveLine === 'Deeper'
          ? -0.04
          : 0;
  const behaviorShift =
    defensiveLineBehavior === 'Step Up' ? 0.02 : defensiveLineBehavior === 'Offside Trap' ? 0.01 : 0;
  const transitionShift = defensiveTransition === 'Regroup' ? -0.03 : defensiveTransition === 'Counter-Press' ? 0.01 : 0;
  const xShift = direction * (engagementShift + lineShift + behaviorShift + transitionShift);

  const baseCompactness =
    lineOfEngagement === 'Low Block' ? 0.9 : lineOfEngagement === 'Mid Block' ? 0.95 : 1;
  const compactness = clampValue(
    baseCompactness - (defensiveTransition === 'Regroup' ? 0.03 : 0),
    0.85,
    1
  );

  return team.slots.map((slot) => ({
    ...slot,
    position: {
      x: clampPosition(slot.position.x + xShift),
      y: clampPosition(0.5 + (slot.position.y - 0.5) * compactness)
    }
  }));
};

const buildRandomEnvironment = (): EnvironmentState => {
  const weather = WEATHER_OPTIONS[Math.floor(Math.random() * WEATHER_OPTIONS.length)];
  const pitch = PITCH_OPTIONS[Math.floor(Math.random() * PITCH_OPTIONS.length)];
  const temperatureC = Math.round(-2 + Math.random() * 34);
  const windSpeed = Math.random() * 7;
  const windDirection = Math.random() * 360;
  const matchImportance =
    MATCH_IMPORTANCE_LEVELS[Math.floor(Math.random() * MATCH_IMPORTANCE_LEVELS.length)].id;
  return {
    weather,
    pitch,
    temperatureC,
    wind: {
      x: Number((windSpeed * Math.cos(toRadians(windDirection))).toFixed(2)),
      y: Number((windSpeed * Math.sin(toRadians(windDirection))).toFixed(2))
    },
    matchImportance
  };
};

const createPlaceholderRoster = (count: number, prefix: string) => {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    name: `${prefix} Player ${index + 1}`,
    positions: [],
    attributes: {},
    playstyles: [],
    playstylesPlus: []
  }));
};

const normalizeRoster = (team: TeamImport | null, fallbackPrefix: string) => {
  const roster = team?.players?.length ? team.players : createPlaceholderRoster(11, fallbackPrefix);
  return roster.map((player, index) => ({
    ...player,
    id: player.id ?? `${fallbackPrefix}-${index + 1}`
  }));
};

const buildTeamSetup = (
  team: TeamImport | null,
  teamId: string,
  kit: { primary: string; secondary: string },
  mirror: boolean
): TeamSetup => {
  const formation = FORMATIONS[0];
  const roster = normalizeRoster(team, teamId.toUpperCase());
  const slots = buildLineupSlots(formation, mirror).map((slot, index) => ({
    ...slot,
    playerId: roster[index]?.id ?? null
  }));

  const bench = roster
    .filter((player) => !slots.some((slot) => slot.playerId === player.id))
    .slice(0, 9)
    .map((player) => player.id as string);

  return {
    id: teamId,
    name: team?.name ?? (teamId === 'home' ? 'Team A' : 'Team B'),
    formationId: formation.id,
    primaryColor: kit.primary,
    secondaryColor: kit.secondary,
    controlType: 'human',
    assistTactics: false,
    roster,
    slots,
    bench,
    instructions: buildInstructionDefaults(),
    setPieces: { ...DEFAULT_SET_PIECE_SETTINGS }
  };
};

const buildSetupFromTeams = (teams: TeamImport[]) => {
  return {
    teams: [
      buildTeamSetup(teams[0] ?? null, 'home', TEAM_KITS[0], false),
      buildTeamSetup(teams[1] ?? null, 'away', TEAM_KITS[1], true)
    ]
  } satisfies TeamSetupState;
};

const canStartMatch = (setup: TeamSetupState | null) => {
  if (!setup) return false;
  return setup.teams.every((team) => team.slots.every((slot) => slot.playerId));
};

const roleGroups = Object.entries(referenceData.roles);
const roleDescriptionMap = new Map(
  Object.values(referenceData.roles)
    .flat()
    .map((role) => [role.id, role.description])
);
const dutyDescriptionMap = new Map(referenceData.duties.map((duty) => [duty.id, duty.description]));
const roleGroupBySlot: Record<string, keyof typeof referenceData.roles> = {
  gk: 'goalkeeper',
  lb: 'full_back',
  rb: 'full_back',
  lcb: 'centre_back',
  rcb: 'centre_back',
  cb: 'centre_back',
  lwb: 'wing_back',
  rwb: 'wing_back',
  dm: 'defensive_midfield',
  ldm: 'defensive_midfield',
  rdm: 'defensive_midfield',
  cm: 'central_midfield',
  lcm: 'central_midfield',
  rcm: 'central_midfield',
  lm: 'wide_midfield',
  rm: 'wide_midfield',
  lam: 'attacking_midfield',
  ram: 'attacking_midfield',
  cam: 'attacking_midfield',
  ss: 'attacking_midfield',
  lw: 'winger',
  rw: 'winger',
  st: 'striker',
  lst: 'striker',
  rst: 'striker'
};

const dutyOptionsByGroup: Record<string, string[]> = {
  goalkeeper: ['defend', 'support'],
  centre_back: ['defend', 'stopper', 'cover'],
  full_back: ['defend', 'support', 'attack'],
  wing_back: ['defend', 'support', 'attack'],
  defensive_midfield: ['defend', 'support'],
  central_midfield: ['defend', 'support', 'attack'],
  wide_midfield: ['support', 'attack'],
  attacking_midfield: ['support', 'attack'],
  winger: ['support', 'attack'],
  striker: ['support', 'attack']
};

const pickRandom = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

const getRoleOptionsForSlot = (slotId: string) => {
  const group = roleGroupBySlot[slotId];
  if (!group) {
    return roleGroups.flatMap(([, roles]) => roles);
  }
  return referenceData.roles[group] ?? [];
};

const getDutyOptionsForSlot = (slotId: string) => {
  const group = roleGroupBySlot[slotId];
  return group ? dutyOptionsByGroup[group] ?? [] : referenceData.duties.map((duty) => duty.id);
};

const getRoleDescription = (roleId?: string | null) =>
  roleId ? roleDescriptionMap.get(roleId) ?? '' : '';
const getDutyDescription = (dutyId?: string | null) =>
  dutyId ? dutyDescriptionMap.get(dutyId) ?? '' : '';

const TeamSetupPage = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useAppState();
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [importSummary, setImportSummary] = useState<{ teams: number; players: number } | null>(null);
  const [teamSetup, setTeamSetup] = useState<TeamSetupState>(() => buildSetupFromTeams([]));
  const [selectedTeamIndex, setSelectedTeamIndex] = useState(0);
  const [selectedPresetId, setSelectedPresetId] = useState(CUSTOM_PRESET_ID);
  const [selectedTacticPresetByTeam, setSelectedTacticPresetByTeam] = useState<Record<string, string>>({
    home: 'custom',
    away: 'custom'
  });
  const [instructionTab, setInstructionTab] = useState<'in' | 'transition' | 'out'>('in');

  const transitionInstructionIds = new Set([
    'attacking_transition',
    'defensive_transition',
    'goal_kicks',
    'gk_distribution_speed',
    'gk_distribution_target'
  ]);

  const instructionGroups = {
    in: referenceData.teamInstructions.inPossession.filter((instruction) => !transitionInstructionIds.has(instruction.id)),
    transition: [
      ...referenceData.teamInstructions.inPossession,
      ...referenceData.teamInstructions.outOfPossession
    ].filter((instruction) => transitionInstructionIds.has(instruction.id)),
    out: referenceData.teamInstructions.outOfPossession.filter(
      (instruction) => !transitionInstructionIds.has(instruction.id)
    )
  };
  const agent = new DataImportAgent();

  const selectedTeam = teamSetup.teams[selectedTeamIndex];
  const selectedTacticPresetId = selectedTacticPresetByTeam[selectedTeam.id] ?? 'custom';
  const selectedPlayersById = useMemo(() => {
    const map: Record<string, { name: string; shirtNo?: number | null }> = {};
    selectedTeam.roster.forEach((player) => {
      if (player.id) {
        map[player.id] = { name: player.name, shirtNo: player.shirtNo };
      }
    });
    return map;
  }, [selectedTeam]);
  const outOfPossessionSlots = useMemo(
    () => buildOutOfPossessionSlots(selectedTeam, selectedTeamIndex),
    [selectedTeam, selectedTeamIndex]
  );

  useEffect(() => {
    setSelectedTacticPresetByTeam((prev) => {
      const next = { ...prev };
      let changed = false;
      teamSetup.teams.forEach((team) => {
        if (!next[team.id]) {
          next[team.id] = 'custom';
          changed = true;
        }
      });
      Object.keys(next).forEach((teamId) => {
        if (!teamSetup.teams.some((team) => team.id === teamId)) {
          delete next[teamId];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [teamSetup.teams]);
  const environment = state.environment ?? DEFAULT_ENVIRONMENT;
  const windSpeed = Math.hypot(environment.wind.x, environment.wind.y);
  const windDirection =
    windSpeed > 0
      ? ((Math.atan2(environment.wind.y, environment.wind.x) * 180) / Math.PI + 360) % 360
      : 0;

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const result = await agent.importFile(file);
    const teamCount = result.teams.length;
    const playerCount = result.teams.reduce((sum, team) => sum + team.players.length, 0);

    setImportErrors(result.errors);
    setImportSummary({ teams: teamCount, players: playerCount });

    if (result.teams.length) {
      setTeamSetup(buildSetupFromTeams(result.teams));
    }
  };

  const updateTeam = (teamId: string, updater: (team: TeamSetup) => TeamSetup) => {
    setTeamSetup((prev) => ({
      ...prev,
      teams: prev.teams.map((team) => (team.id === teamId ? updater(team) : team))
    }));
  };

  const updateControlType = (teamId: string, controlType: TeamSetup['controlType']) => {
    updateTeam(teamId, (team) => ({
      ...team,
      controlType,
      assistTactics: controlType === 'human' ? team.assistTactics : false
    }));
  };

  const updateAssistTactics = (teamId: string, assistTactics: boolean) => {
    updateTeam(teamId, (team) => ({
      ...team,
      assistTactics
    }));
  };

  const handlePositionChange = (slotId: string, x: number, y: number) => {
    updateTeam(selectedTeam.id, (team) => ({
      ...team,
      slots: team.slots.map((slot) => (slot.id === slotId ? { ...slot, position: { x, y } } : slot))
    }));
  };

  const handleSlotPlayerChange = (slotId: string, playerId: string) => {
    updateTeam(selectedTeam.id, (team) => {
      const slots = team.slots.map((slot) => {
        if (slot.id === slotId) {
          return { ...slot, playerId };
        }
        if (slot.playerId === playerId) {
          return { ...slot, playerId: null };
        }
        return slot;
      });
      return { ...team, slots };
    });
  };

  const handleSlotRoleChange = (slotId: string, roleId: string) => {
    updateTeam(selectedTeam.id, (team) => ({
      ...team,
      slots: team.slots.map((slot) => (slot.id === slotId ? { ...slot, roleId } : slot))
    }));
  };

  const handleSlotDutyChange = (slotId: string, dutyId: string) => {
    updateTeam(selectedTeam.id, (team) => ({
      ...team,
      slots: team.slots.map((slot) => (slot.id === slotId ? { ...slot, dutyId } : slot))
    }));
  };

  const toggleBench = (playerId: string) => {
    updateTeam(selectedTeam.id, (team) => {
      const bench = new Set(team.bench);
      if (bench.has(playerId)) {
        bench.delete(playerId);
      } else if (bench.size < 9) {
        bench.add(playerId);
      }
      return { ...team, bench: Array.from(bench) };
    });
  };

  const updateInstruction = (instructionId: string, value: string) => {
    updateTeam(selectedTeam.id, (team) => ({
      ...team,
      instructions: { ...team.instructions, [instructionId]: value }
    }));
  };

  const buildRandomInstructions = (current: Record<string, string>) => {
    const allInstructions = [
      ...referenceData.teamInstructions.inPossession,
      ...referenceData.teamInstructions.outOfPossession
    ];
    const randomized: Record<string, string> = { ...current };
    allInstructions.forEach((instruction) => {
      const options = instruction.options ?? [];
      if (!options.length) return;
      randomized[instruction.id] = options[Math.floor(Math.random() * options.length)];
    });
    return randomized;
  };

  const randomizeInstructions = () => {
    updateTeam(selectedTeam.id, (team) => ({
      ...team,
      instructions: buildRandomInstructions(team.instructions)
    }));
    setSelectedTacticPresetByTeam((prev) => ({ ...prev, [selectedTeam.id]: 'custom' }));
  };

  const randomizeTactics = () => {
    const formation = pickRandom(FORMATIONS);
    const randomInstructions = buildRandomInstructions(selectedTeam.instructions);
    setSelectedTacticPresetByTeam((prev) => ({ ...prev, [selectedTeam.id]: 'custom' }));

    setTeamSetup((prev) => {
      const teams = prev.teams.map((team, index) => {
        if (team.id !== selectedTeam.id) return team;
        const mirror = index === 1;
        let newSlots = buildLineupSlots(formation, mirror).map((slot, slotIndex) => {
          const existing = team.slots[slotIndex];
          return {
            ...slot,
            playerId: existing?.playerId ?? slot.playerId,
            roleId: existing?.roleId ?? slot.roleId,
            dutyId: existing?.dutyId ?? slot.dutyId
          };
        });

        newSlots = newSlots.map((slot) => {
          const roleOptions = getRoleOptionsForSlot(slot.id);
          const dutyOptions = getDutyOptionsForSlot(slot.id);
          const roleId = roleOptions.length ? pickRandom(roleOptions).id : slot.roleId;
          const dutyId = dutyOptions.length ? pickRandom(dutyOptions) : slot.dutyId;
          return { ...slot, roleId, dutyId };
        });

        return {
          ...team,
          formationId: formation.id,
          slots: newSlots,
          instructions: randomInstructions
        };
      });

      return { ...prev, teams };
    });
  };

  const applyFormation = (formationId: string) => {
    const formation = FORMATIONS.find((item) => item.id === formationId);
    if (!formation) return;
    setSelectedTacticPresetByTeam((prev) => ({ ...prev, [selectedTeam.id]: 'custom' }));

    setTeamSetup((prev) => {
      const teams = prev.teams.map((team, index) => {
        if (team.id !== selectedTeam.id) return team;
        const mirror = index === 1;
        const newSlots = buildLineupSlots(formation, mirror).map((slot, slotIndex) => {
          const existing = team.slots[slotIndex];
          return {
            ...slot,
            playerId: existing?.playerId ?? slot.playerId,
            roleId: existing?.roleId ?? slot.roleId,
            dutyId: existing?.dutyId ?? slot.dutyId
          };
        });
        return { ...team, formationId: formation.id, slots: newSlots };
      });
      return { ...prev, teams };
    });
  };

  const applyTacticalPreset = (presetId: string) => {
    const preset = TACTICAL_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;

    const formation = FORMATIONS.find((item) => item.id === preset.formationId);
    if (!formation) return;

    setTeamSetup((prev) => {
      const teams = prev.teams.map((team, index) => {
        if (team.id !== selectedTeam.id) return team;
        const mirror = index === 1;
        let newSlots = buildLineupSlots(formation, mirror).map((slot, slotIndex) => {
          const existing = team.slots[slotIndex];
          return {
            ...slot,
            playerId: existing?.playerId ?? slot.playerId,
            roleId: existing?.roleId ?? slot.roleId,
            dutyId: existing?.dutyId ?? slot.dutyId
          };
        });

        newSlots = newSlots.map((slot) => {
          const role = preset.roles[slot.id];
          if (!role) return slot;
          return { ...slot, roleId: role.roleId, dutyId: role.dutyId };
        });
        return {
          ...team,
          formationId: formation.id,
          slots: newSlots,
          instructions: { ...team.instructions, ...preset.instructions }
        };
      });
      return { ...prev, teams };
    });
  };

  const updateTeamColors = (primaryColor: string, secondaryColor: string) => {
    updateTeam(selectedTeam.id, (team) => ({
      ...team,
      primaryColor,
      secondaryColor
    }));
  };

  const updateSetPieceSetting = (key: string, value: string) => {
    updateTeam(selectedTeam.id, (team) => ({
      ...team,
      setPieces: { ...team.setPieces, [key]: value }
    }));
  };

  const resetSetPieceWizard = () => {
    updateTeam(selectedTeam.id, (team) => ({
      ...team,
      setPieces: { ...DEFAULT_SET_PIECE_SETTINGS }
    }));
  };

  const handleStart = () => {
    dispatch({ type: 'SET_TEAM_SETUP', teamSetup });
    dispatch({ type: 'SET_PHASE', phase: 'match' });
    navigate('/match');
  };

  const updateEnvironment = (partial: Partial<EnvironmentState>) => {
    dispatch({
      type: 'SET_ENVIRONMENT',
      environment: {
        ...environment,
        ...partial,
        wind: partial.wind ? { ...environment.wind, ...partial.wind } : environment.wind
      }
    });
  };

  const handlePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (presetId === CUSTOM_PRESET_ID) return;
    const preset = ENVIRONMENT_PRESETS.find((entry) => entry.id === presetId);
    if (preset) {
      updateEnvironment(preset.environment);
    }
  };

  const handleWeatherChange = (value: EnvironmentState['weather']) => {
    setSelectedPresetId(CUSTOM_PRESET_ID);
    updateEnvironment({ weather: value });
  };

  const handlePitchChange = (value: EnvironmentState['pitch']) => {
    setSelectedPresetId(CUSTOM_PRESET_ID);
    updateEnvironment({ pitch: value });
  };

  const handleTemperatureChange = (value: number) => {
    setSelectedPresetId(CUSTOM_PRESET_ID);
    updateEnvironment({ temperatureC: clampValue(value, -5, 35) });
  };

  const handleWindChange = (nextSpeed: number, nextDirection: number) => {
    const speed = clampValue(nextSpeed, 0, 12);
    const direction = ((nextDirection % 360) + 360) % 360;
    const wind = {
      x: Number((speed * Math.cos(toRadians(direction))).toFixed(2)),
      y: Number((speed * Math.sin(toRadians(direction))).toFixed(2))
    };
    setSelectedPresetId(CUSTOM_PRESET_ID);
    updateEnvironment({ wind });
  };

  const handleMatchImportanceChange = (value: EnvironmentState['matchImportance']) => {
    setSelectedPresetId(CUSTOM_PRESET_ID);
    updateEnvironment({ matchImportance: value });
  };

  const availableBench = useMemo(() => {
    const lineupIds = new Set(selectedTeam.slots.map((slot) => slot.playerId).filter(Boolean));
    return selectedTeam.roster.filter((player) => !lineupIds.has(player.id ?? ''));
  }, [selectedTeam]);

  return (
    <div className="page-grid">
      <section className="card">
        <h2>Team Setup</h2>
        <p>
          Import players, choose formation, assign roles, duties, and team instructions. Drag players to adjust
          positions.
        </p>
        <div className="controls-row">
          <label className="button" htmlFor="import-file">
            Import Players
          </label>
          <input
            id="import-file"
            type="file"
            accept=".json,.csv"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
          <button className="button" onClick={handleStart} disabled={!canStartMatch(teamSetup)}>
            Start Match
          </button>
        </div>
        {!canStartMatch(teamSetup) && (
          <div style={{ marginTop: '12px' }}>
            Assign 11 players for each team to enable Match start.
          </div>
        )}
        {importSummary && (
          <p style={{ marginTop: '16px' }}>
            Imported {importSummary.players} players across {importSummary.teams} teams.
          </p>
        )}
        {importErrors.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <strong>Import Issues</strong>
            <ul>
              {importErrors.slice(0, 5).map((error, index) => (
                <li key={index}>
                  {error.row ? `Row ${error.row}: ` : ''}
                  {error.field ? `${error.field} - ` : ''}
                  {error.message}
                </li>
              ))}
            </ul>
            {importErrors.length > 5 && <div>More issues detected. Please fix the file.</div>}
          </div>
        )}
      </section>

      <section className="card">
        <div className="controls-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Match Environment</h3>
          <button
            className="button secondary"
            onClick={() => {
              setSelectedPresetId(CUSTOM_PRESET_ID);
              updateEnvironment(buildRandomEnvironment());
            }}
          >
            Randomize
          </button>
        </div>
        <p style={{ marginTop: '8px' }}>
          Weather, wind, and pitch conditions affect ball physics and player fatigue.
        </p>
        <div className="field-group">
          <div>
            <div>Preset</div>
            <select
              className="select"
              value={selectedPresetId}
              onChange={(event) => handlePresetChange(event.target.value)}
            >
              <option value={CUSTOM_PRESET_ID}>Custom</option>
              {ENVIRONMENT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            {selectedPresetId !== CUSTOM_PRESET_ID && (
              <div style={{ marginTop: '6px', fontSize: '13px', color: '#6b7280' }}>
                {ENVIRONMENT_PRESETS.find((preset) => preset.id === selectedPresetId)?.description}
              </div>
            )}
          </div>
          <div>
            <div>Match Importance</div>
            <select
              className="select"
              value={environment.matchImportance}
              onChange={(event) =>
                handleMatchImportanceChange(event.target.value as EnvironmentState['matchImportance'])
              }
            >
              {MATCH_IMPORTANCE_LEVELS.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                </option>
              ))}
            </select>
            <div style={{ marginTop: '6px', fontSize: '13px', color: '#6b7280' }}>
              {MATCH_IMPORTANCE_LEVELS.find((level) => level.id === environment.matchImportance)?.description}
            </div>
          </div>
          <div>
            <div>Weather</div>
            <select
              className="select"
              value={environment.weather}
              onChange={(event) => handleWeatherChange(event.target.value as EnvironmentState['weather'])}
            >
              {WEATHER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {toLabel(option)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div>Pitch</div>
            <select
              className="select"
              value={environment.pitch}
              onChange={(event) => handlePitchChange(event.target.value as EnvironmentState['pitch'])}
            >
              {PITCH_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {toLabel(option)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div>Temperature (C)</div>
            <input
              className="select"
              type="number"
              value={environment.temperatureC}
              min={-5}
              max={35}
              step={1}
              onChange={(event) => handleTemperatureChange(Number(event.target.value || 0))}
            />
          </div>
          <div>
            <div>Wind Speed</div>
            <input
              className="select"
              type="number"
              value={windSpeed.toFixed(1)}
              min={0}
              max={12}
              step={0.1}
              onChange={(event) => handleWindChange(Number(event.target.value || 0), windDirection)}
            />
          </div>
          <div>
            <div>Wind Direction</div>
            <input
              className="select"
              type="number"
              value={windDirection.toFixed(0)}
              min={0}
              max={360}
              step={1}
              onChange={(event) => handleWindChange(windSpeed, Number(event.target.value || 0))}
            />
          </div>
        </div>
      </section>

      <section className="card tactics-shell">
        <div className="tactics-header">
          <div className="team-tabs">
            {teamSetup.teams.map((team, index) => (
              <button
                key={team.id}
                className={selectedTeamIndex === index ? 'button' : 'button secondary'}
                onClick={() => setSelectedTeamIndex(index)}
              >
                {team.name}
              </button>
            ))}
          </div>
          <div className="tactics-actions">
            <div className="tactics-control">
              <span className="tactics-label">Formation</span>
              <select
                className="select"
                value={selectedTeam.formationId}
                onChange={(event) => applyFormation(event.target.value)}
                aria-label={`Formation for ${selectedTeam.name}`}
              >
                {FORMATIONS.map((formation) => (
                  <option key={formation.id} value={formation.id}>
                    {formation.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="tactics-control">
              <span className="tactics-label">Control</span>
              <select
                className="select"
                value={selectedTeam.controlType}
                onChange={(event) => updateControlType(selectedTeam.id, event.target.value as TeamSetup['controlType'])}
                aria-label={`Control type for ${selectedTeam.name}`}
              >
                <option value="human">Human</option>
                <option value="ai">AI</option>
              </select>
            </div>
            {selectedTeam.controlType === 'human' && (
              <div className="tactics-control">
                <span className="tactics-label">Assist AI Tactics</span>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={selectedTeam.assistTactics}
                    onChange={(event) => updateAssistTactics(selectedTeam.id, event.target.checked)}
                    aria-label={`Assist AI tactics for ${selectedTeam.name}`}
                  />
                  <span>Enable</span>
                </label>
              </div>
            )}
            <div className="tactics-control">
              <span className="tactics-label">Tactical Preset</span>
              <select
                className="select"
                value={selectedTacticPresetId}
                onChange={(event) =>
                  setSelectedTacticPresetByTeam((prev) => ({
                    ...prev,
                    [selectedTeam.id]: event.target.value
                  }))
                }
                aria-label={`Tactical preset for ${selectedTeam.name}`}
              >
                <option value="custom">Custom</option>
                {TACTICAL_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="button secondary"
              onClick={() => applyTacticalPreset(selectedTacticPresetId)}
              disabled={selectedTacticPresetId === 'custom'}
            >
              Apply Preset
            </button>
            <button className="button secondary" onClick={randomizeTactics}>
              Randomize Tactics
            </button>
          </div>
        </div>
        {selectedTacticPresetId !== 'custom' && (
          <div className="tactics-hint">
            {TACTICAL_PRESETS.find((preset) => preset.id === selectedTacticPresetId)?.description}
          </div>
        )}

        <div className="tactics-body">
          <div className="tactics-column tactics-left">
            <div className="tactics-card">
              <div className="tactics-card-header">
                <div>
                  <div className="tactics-title">Team Shape</div>
                  <div className="tactics-subtitle">Drag to adjust roles and spacing.</div>
                </div>
                <span className="tactics-chip">{selectedTeam.formationId}</span>
              </div>
              <div className="shape-grid">
                <div className="shape-panel">
                  <div className="shape-label">In Possession</div>
                  <FormationPitch
                    slots={selectedTeam.slots}
                    playersById={selectedPlayersById}
                    primaryColor={selectedTeam.primaryColor}
                    secondaryColor={selectedTeam.secondaryColor}
                    onPositionChange={handlePositionChange}
                  />
                </div>
                <div className="shape-panel">
                  <div className="shape-label">Out of Possession</div>
                  <FormationPitch
                    slots={outOfPossessionSlots}
                    playersById={selectedPlayersById}
                    primaryColor={selectedTeam.primaryColor}
                    secondaryColor={selectedTeam.secondaryColor}
                    interactive={false}
                  />
                </div>
              </div>
              <div className="kit-controls">
                <label className="kit-control">
                  <span>Primary Kit</span>
                  <input
                    type="color"
                    value={selectedTeam.primaryColor}
                    onChange={(event) => updateTeamColors(event.target.value, selectedTeam.secondaryColor)}
                    aria-label={`Primary kit color for ${selectedTeam.name}`}
                  />
                </label>
                <label className="kit-control">
                  <span>Secondary Kit</span>
                  <input
                    type="color"
                    value={selectedTeam.secondaryColor}
                    onChange={(event) => updateTeamColors(selectedTeam.primaryColor, event.target.value)}
                    aria-label={`Secondary kit color for ${selectedTeam.name}`}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="tactics-column tactics-center">
            <div className="tactics-card">
              <div className="tactics-toolbar">
                <div className="tactics-tabs">
                  <button
                    className={instructionTab === 'in' ? 'button' : 'button secondary'}
                    onClick={() => setInstructionTab('in')}
                  >
                    In Possession
                  </button>
                  <button
                    className={instructionTab === 'transition' ? 'button' : 'button secondary'}
                    onClick={() => setInstructionTab('transition')}
                  >
                    In Transition
                  </button>
                  <button
                    className={instructionTab === 'out' ? 'button' : 'button secondary'}
                    onClick={() => setInstructionTab('out')}
                  >
                    Out of Possession
                  </button>
                </div>
                <button className="button secondary" onClick={randomizeInstructions}>
                  Randomize Instructions
                </button>
              </div>
              <div className="instruction-grid">
                {instructionGroups[instructionTab].map((instruction) => (
                  <div key={instruction.id} className="instruction-card" title={instruction.description}>
                    <div className="instruction-title">{instruction.name}</div>
                    <select
                      className="select compact"
                      value={selectedTeam.instructions[instruction.id] ?? ''}
                      onChange={(event) => updateInstruction(instruction.id, event.target.value)}
                      title={instruction.description}
                      aria-label={`${instruction.name} instruction`}
                    >
                      {instruction.options?.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="tactics-column tactics-right">
            <div className="tactics-card lineup-card">
              <div className="lineup-title">Lineup</div>
              <div className="lineup-header">
                <span>Pos</span>
                <span>Player</span>
                <span>Role</span>
                <span>Duty</span>
              </div>
              <div className="lineup-grid">
                {selectedTeam.slots.map((slot) => {
                  const roleDescription = getRoleDescription(slot.roleId);
                  const dutyDescription = getDutyDescription(slot.dutyId);
                  return (
                    <div key={slot.id} className="lineup-row">
                    <div className="lineup-cell lineup-pos">{slot.label}</div>
                    <div className="lineup-cell">
                      <select
                        className="select compact"
                        value={slot.playerId ?? ''}
                        onChange={(event) => handleSlotPlayerChange(slot.id, event.target.value)}
                        aria-label={`Player for ${slot.label}`}
                      >
                        <option value="">Select</option>
                        {selectedTeam.roster.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="lineup-cell">
                      <select
                        className="select compact"
                        value={slot.roleId ?? ''}
                        onChange={(event) => handleSlotRoleChange(slot.id, event.target.value)}
                        title={roleDescription || 'Select a role'}
                        aria-label={`Role for ${slot.label}${roleDescription ? `: ${roleDescription}` : ''}`}
                      >
                        <option value="">Select</option>
                        {roleGroups.map(([groupKey, roles]) => (
                          <optgroup key={groupKey} label={toLabel(groupKey)}>
                            {roles.map((role) => (
                              <option key={role.id} value={role.id}>
                                {role.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div className="lineup-cell">
                      <select
                        className="select compact"
                        value={slot.dutyId ?? ''}
                        onChange={(event) => handleSlotDutyChange(slot.id, event.target.value)}
                        title={dutyDescription || 'Select a duty'}
                        aria-label={`Duty for ${slot.label}${dutyDescription ? `: ${dutyDescription}` : ''}`}
                      >
                        <option value="">Select</option>
                        {referenceData.duties.map((duty) => (
                          <option key={duty.id} value={duty.id}>
                            {duty.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <h3>Bench (select up to 9)</h3>
        <div className="field-group">
          {availableBench.map((player) => (
            <label key={player.id}>
              <input
                type="checkbox"
                checked={selectedTeam.bench.includes(player.id ?? '')}
                onChange={() => toggleBench(player.id ?? '')}
              />{' '}
              {player.name}
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="controls-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Set Piece Wizard</h3>
          <button className="button secondary" onClick={resetSetPieceWizard}>
            Reset Wizard
          </button>
        </div>
        <p style={{ marginTop: '8px' }}>
          Answer the six questions to shape your corner, free kick, and throw-in routines. You can tweak these
          later.
        </p>
        <div className="field-group">
          {SET_PIECE_WIZARD_QUESTIONS.map((question) => (
            <div key={question.id}>
              <div>{question.name}</div>
              <select
                className="select"
                value={(selectedTeam.setPieces as Record<string, string>)[question.id]}
                onChange={(event) => updateSetPieceSetting(question.id, event.target.value)}
                title={question.description}
                aria-label={`${question.name} setting`}
              >
                {question.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              <div style={{ marginTop: '6px', fontSize: '13px', color: '#6b7280' }}>
                {question.description}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default TeamSetupPage;

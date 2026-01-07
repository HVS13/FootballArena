import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataImportAgent } from '../agents/DataImportAgent';
import FormationPitch from '../components/FormationPitch';
import { ENVIRONMENT_PRESETS } from '../data/environmentPresets';
import { referenceData } from '../data/referenceData';
import { FORMATIONS, buildLineupSlots } from '../data/formations';
import { DEFAULT_ENVIRONMENT, EnvironmentState } from '../domain/environmentTypes';
import { ImportError, TeamImport } from '../domain/types';
import { TeamSetup, TeamSetupState } from '../domain/teamSetupTypes';
import { useAppState } from '../state/appState';

const TEAM_COLORS = ['#f43f5e', '#38bdf8'];
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

const toRadians = (deg: number) => (deg * Math.PI) / 180;

const buildRandomEnvironment = (): EnvironmentState => {
  const weather = WEATHER_OPTIONS[Math.floor(Math.random() * WEATHER_OPTIONS.length)];
  const pitch = PITCH_OPTIONS[Math.floor(Math.random() * PITCH_OPTIONS.length)];
  const temperatureC = Math.round(-2 + Math.random() * 34);
  const windSpeed = Math.random() * 7;
  const windDirection = Math.random() * 360;
  return {
    weather,
    pitch,
    temperatureC,
    wind: {
      x: Number((windSpeed * Math.cos(toRadians(windDirection))).toFixed(2)),
      y: Number((windSpeed * Math.sin(toRadians(windDirection))).toFixed(2))
    }
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
  color: string,
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
    color,
    roster,
    slots,
    bench,
    instructions: buildInstructionDefaults()
  };
};

const buildSetupFromTeams = (teams: TeamImport[]) => {
  return {
    formationId: FORMATIONS[0].id,
    teams: [
      buildTeamSetup(teams[0] ?? null, 'home', TEAM_COLORS[0], false),
      buildTeamSetup(teams[1] ?? null, 'away', TEAM_COLORS[1], true)
    ]
  } satisfies TeamSetupState;
};

const canStartMatch = (setup: TeamSetupState | null) => {
  if (!setup) return false;
  return setup.teams.every((team) => team.slots.every((slot) => slot.playerId));
};

const roleGroups = Object.entries(referenceData.roles);

const TeamSetupPage = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useAppState();
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [importSummary, setImportSummary] = useState<{ teams: number; players: number } | null>(null);
  const [teamSetup, setTeamSetup] = useState<TeamSetupState>(() => buildSetupFromTeams([]));
  const [selectedTeamIndex, setSelectedTeamIndex] = useState(0);
  const [selectedPresetId, setSelectedPresetId] = useState(CUSTOM_PRESET_ID);
  const agent = new DataImportAgent();

  const selectedTeam = teamSetup.teams[selectedTeamIndex];
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

      <section className="card">
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

        <div className="controls-row" style={{ marginBottom: '16px' }}>
          <div>
            Formation
            <select className="select" value={teamSetup.formationId} disabled>
              {FORMATIONS.map((formation) => (
                <option key={formation.id} value={formation.id}>
                  {formation.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <FormationPitch slots={selectedTeam.slots} color={selectedTeam.color} onPositionChange={handlePositionChange} />

        <h3 style={{ marginTop: '20px' }}>Lineup</h3>
        <div className="field-group">
          {selectedTeam.slots.map((slot) => (
            <div key={slot.id}>
              <strong>{slot.label}</strong>
              <div>
                <select
                  className="select"
                  value={slot.playerId ?? ''}
                  onChange={(event) => handleSlotPlayerChange(slot.id, event.target.value)}
                >
                  <option value="">Select player</option>
                  {selectedTeam.roster.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <select
                  className="select"
                  value={slot.roleId ?? ''}
                  onChange={(event) => handleSlotRoleChange(slot.id, event.target.value)}
                >
                  <option value="">Select role</option>
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
              <div>
                <select
                  className="select"
                  value={slot.dutyId ?? ''}
                  onChange={(event) => handleSlotDutyChange(slot.id, event.target.value)}
                >
                  <option value="">Select duty</option>
                  {referenceData.duties.map((duty) => (
                    <option key={duty.id} value={duty.id}>
                      {duty.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
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
        <h3>Team Instructions</h3>
        <h4>In Possession</h4>
        <div className="field-group">
          {referenceData.teamInstructions.inPossession.map((instruction) => (
            <div key={instruction.id}>
              <div>{instruction.name}</div>
              <select
                className="select"
                value={selectedTeam.instructions[instruction.id] ?? ''}
                onChange={(event) => updateInstruction(instruction.id, event.target.value)}
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

        <h4 style={{ marginTop: '16px' }}>Out of Possession</h4>
        <div className="field-group">
          {referenceData.teamInstructions.outOfPossession.map((instruction) => (
            <div key={instruction.id}>
              <div>{instruction.name}</div>
              <select
                className="select"
                value={selectedTeam.instructions[instruction.id] ?? ''}
                onChange={(event) => updateInstruction(instruction.id, event.target.value)}
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
      </section>
    </div>
  );
};

export default TeamSetupPage;

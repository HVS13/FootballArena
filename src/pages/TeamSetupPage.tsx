import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataImportAgent } from '../agents/DataImportAgent';
import FormationPitch from '../components/FormationPitch';
import { referenceData } from '../data/referenceData';
import { FORMATIONS, buildLineupSlots } from '../data/formations';
import { ImportError, TeamImport } from '../domain/types';
import { TeamSetup, TeamSetupState } from '../domain/teamSetupTypes';
import { useAppState } from '../state/appState';

const TEAM_COLORS = ['#f43f5e', '#38bdf8'];

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

const createPlaceholderRoster = (count: number, prefix: string) => {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    name: `${prefix} Player ${index + 1}`,
    positions: [],
    attributes: {}
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
  const { dispatch } = useAppState();
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [importSummary, setImportSummary] = useState<{ teams: number; players: number } | null>(null);
  const [teamSetup, setTeamSetup] = useState<TeamSetupState>(() => buildSetupFromTeams([]));
  const [selectedTeamIndex, setSelectedTeamIndex] = useState(0);
  const agent = new DataImportAgent();

  const selectedTeam = teamSetup.teams[selectedTeamIndex];

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

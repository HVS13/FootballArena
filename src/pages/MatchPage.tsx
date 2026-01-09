import { useEffect, useMemo, useRef, useState } from 'react';
import { GameEngineAgent, RestartInfo, SubstitutionStatus } from '../agents/GameEngineAgent';
import PitchCanvas from '../components/PitchCanvas';
import { CommentaryLine, MatchStats } from '../domain/matchTypes';
import { RenderState, TeamState } from '../domain/simulationTypes';
import { TeamSetupState } from '../domain/teamSetupTypes';
import { referenceData } from '../data/referenceData';
import { useAppState } from '../state/appState';

type SubSelection = {
  offId: string;
  onId: string;
};

const formatClock = (timeSeconds: number) => {
  const minutes = Math.floor(timeSeconds / 60);
  const seconds = Math.floor(timeSeconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const formatRatio = (value: number, total: number) =>
  total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '0.0%';

const formatRestartLabel = (value: RestartInfo['type']) =>
  value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const toLabel = (value: string) =>
  value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const roleNameMap = new Map<string, string>(
  Object.values(referenceData.roles)
    .flat()
    .map((role) => [role.id, role.name])
);

const dutyNameMap = new Map<string, string>(referenceData.duties.map((duty) => [duty.id, duty.name]));

const formatRoleDuty = (roleId?: string | null, dutyId?: string | null) => {
  const roleLabel = roleId ? roleNameMap.get(roleId) ?? toLabel(roleId) : '';
  const dutyLabel = dutyId ? dutyNameMap.get(dutyId) ?? toLabel(dutyId) : '';
  if (roleLabel && dutyLabel) return `${roleLabel} (${dutyLabel})`;
  return roleLabel || dutyLabel;
};

const buildRosterNameMap = (setup: TeamSetupState | null) => {
  const map: Record<string, Record<string, string>> = {};
  setup?.teams.forEach((team) => {
    const teamMap: Record<string, string> = {};
    team.roster.forEach((player) => {
      if (player.id) teamMap[player.id] = player.name;
    });
    map[team.id] = teamMap;
  });
  return map;
};

const applySubstitutionToSetup = (
  setup: TeamSetupState,
  teamId: string,
  offId: string,
  onId: string
): TeamSetupState => {
  return {
    ...setup,
    teams: setup.teams.map((team) => {
      if (team.id !== teamId) return team;
      const slots = team.slots.map((slot) =>
        slot.playerId === offId ? { ...slot, playerId: onId } : slot
      );
      const bench = team.bench.filter((playerId) => playerId !== onId);
      if (!bench.includes(offId)) {
        bench.push(offId);
      }
      return { ...team, slots, bench };
    })
  };
};

const MatchPage = () => {
  const { state, dispatch } = useAppState();
  const [renderState, setRenderState] = useState<RenderState | null>(null);
  const [matchStats, setMatchStats] = useState<MatchStats | null>(null);
  const [commentary, setCommentary] = useState<CommentaryLine[]>([]);
  const [subStatus, setSubStatus] = useState<SubstitutionStatus | null>(null);
  const [restartInfo, setRestartInfo] = useState<RestartInfo | null>(null);
  const [subSelections, setSubSelections] = useState<Record<string, SubSelection>>({});
  const [subErrors, setSubErrors] = useState<Record<string, string>>({});
  const engineRef = useRef<GameEngineAgent | null>(null);
  const initialSetupRef = useRef<TeamSetupState | null>(state.teamSetup);
  const initialEnvironmentRef = useRef(state.environment);

  const rosterNameMap = useMemo(() => buildRosterNameMap(state.teamSetup), [state.teamSetup]);

  const teamList = useMemo<TeamState[]>(() => {
    if (renderState?.teams?.length) return renderState.teams;
    if (state.teamSetup?.teams?.length) {
      return state.teamSetup.teams.map((team) => ({
        id: team.id,
        name: team.name,
        primaryColor: team.primaryColor,
        secondaryColor: team.secondaryColor
      }));
    }
    return [];
  }, [renderState, state.teamSetup]);

  const hudData = useMemo(() => {
    if (!renderState || teamList.length === 0) return [];
    return teamList.map((team) => {
      const players = renderState.players.filter((player) => player.teamId === team.id);
      const count = players.length || 1;
      const avgFatigue = players.reduce((sum, player) => sum + (player.fatigue ?? 0), 0) / count;
      const avgMorale = players.reduce((sum, player) => sum + (player.morale ?? 60), 0) / count;
      const injuries = players.filter((player) => player.injury).length;
      const yellowCards =
        matchStats?.byTeam[team.id]?.yellowCards ??
        players.reduce((sum, player) => sum + (player.discipline?.yellow ?? 0), 0);
      const redCards =
        matchStats?.byTeam[team.id]?.redCards ??
        players.filter((player) => player.discipline?.red).length;

      const alerts: Array<{ id: string; label: string; detail: string }> = [];
      const fatigued = players
        .filter((player) => (player.fatigue ?? 0) > 0.7)
        .sort((a, b) => (b.fatigue ?? 0) - (a.fatigue ?? 0));

      fatigued.slice(0, 2).forEach((player) => {
        const roleDuty = formatRoleDuty(player.roleId, player.dutyId);
        alerts.push({
          id: `fatigue-${player.id}`,
          label: player.name,
          detail: `Fatigue ${Math.round((player.fatigue ?? 0) * 100)}%${roleDuty ? ` - ${roleDuty}` : ''}`
        });
      });

      players
        .filter((player) => player.injury)
        .slice(0, 2)
        .forEach((player) => {
          if (alerts.length >= 3) return;
          const roleDuty = formatRoleDuty(player.roleId, player.dutyId);
          alerts.push({
            id: `injury-${player.id}`,
            label: player.name,
            detail: `Injured${roleDuty ? ` - ${roleDuty}` : ''}`
          });
        });

      players
        .filter((player) => player.discipline?.red)
        .slice(0, 1)
        .forEach((player) => {
          if (alerts.length >= 3) return;
          const roleDuty = formatRoleDuty(player.roleId, player.dutyId);
          alerts.push({
            id: `red-${player.id}`,
            label: player.name,
            detail: `Sent off${roleDuty ? ` - ${roleDuty}` : ''}`
          });
        });

      return {
        team,
        avgFatigue,
        avgMorale,
        injuries,
        yellowCards,
        redCards,
        alerts
      };
    });
  }, [renderState, teamList, matchStats]);

  useEffect(() => {
    const engine = new GameEngineAgent({
      onRender: setRenderState,
      onMatchUpdate: (stats, lines, restart) => {
        setMatchStats(stats);
        setCommentary(lines);
        setSubStatus(engine.getSubstitutionStatus());
        setRestartInfo(restart);
      },
      teamSetup: initialSetupRef.current ?? undefined,
      environment: initialEnvironmentRef.current
    });
    engineRef.current = engine;
    engine.start();

    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setSpeed(state.simSpeed);
  }, [state.simSpeed]);

  useEffect(() => {
    engineRef.current?.setPaused(state.isPaused);
  }, [state.isPaused]);

  useEffect(() => {
    if (!state.teamSetup) return;

    setSubSelections((prev) => {
      const next: Record<string, SubSelection> = { ...prev };
      state.teamSetup.teams.forEach((team) => {
        const lineupIds = team.slots
          .map((slot) => slot.playerId)
          .filter((value): value is string => Boolean(value));
        const benchIds = team.bench;
        const previous = prev[team.id];
        const offId = lineupIds.includes(previous?.offId ?? '')
          ? previous.offId
          : lineupIds[0] ?? '';
        const onId = benchIds.includes(previous?.onId ?? '') ? previous.onId : benchIds[0] ?? '';
        next[team.id] = { offId, onId };
      });
      return next;
    });
  }, [state.teamSetup]);

  const handleSubSelection = (teamId: string, field: keyof SubSelection, value: string) => {
    setSubSelections((prev) => ({
      ...prev,
      [teamId]: {
        offId: field === 'offId' ? value : prev[teamId]?.offId ?? '',
        onId: field === 'onId' ? value : prev[teamId]?.onId ?? ''
      }
    }));
  };

  const handleApplySubstitution = (teamId: string) => {
    const selection = subSelections[teamId];
    if (!selection?.offId || !selection?.onId) {
      setSubErrors((prev) => ({ ...prev, [teamId]: 'Select both players before substituting.' }));
      return;
    }

    const result = engineRef.current?.applySubstitution(teamId, selection.offId, selection.onId);
    if (!result || !result.ok) {
      setSubErrors((prev) => ({
        ...prev,
        [teamId]: result?.error ?? 'Substitution failed.'
      }));
      return;
    }

    if (state.teamSetup) {
      const updated = applySubstitutionToSetup(state.teamSetup, teamId, selection.offId, selection.onId);
      dispatch({ type: 'SET_TEAM_SETUP', teamSetup: updated });
    }

    setSubErrors((prev) => ({ ...prev, [teamId]: '' }));
  };

  const getStatValue = (teamId: string, field: keyof MatchStats['byTeam'][string]) => {
    return matchStats?.byTeam[teamId]?.[field] ?? 0;
  };

  const totalPossession = matchStats
    ? Object.values(matchStats.byTeam).reduce((sum, team) => sum + team.possessionSeconds, 0)
    : 0;

  const getPossessionPercent = (teamId: string) => {
    if (!matchStats || totalPossession === 0) return 0;
    return (matchStats.byTeam[teamId]?.possessionSeconds ?? 0) / totalPossession * 100;
  };

  const [homeTeam, awayTeam] = teamList;
  const homeGoals = homeTeam ? getStatValue(homeTeam.id, 'goals') : 0;
  const awayGoals = awayTeam ? getStatValue(awayTeam.id, 'goals') : 0;

  return (
    <div className="page-grid">
      <section className="card">
        <div className="controls-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Match View</h2>
          <div>
            {homeTeam?.name ?? 'Home'} {homeGoals} - {awayGoals} {awayTeam?.name ?? 'Away'}
          </div>
        </div>
        <div className="controls-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>Match Time: {renderState ? formatClock(renderState.time) : '00:00'}</div>
          <div>Speed: x{state.simSpeed}</div>
        </div>
        {restartInfo && (
          <div className="restart-banner">
            <strong>{formatRestartLabel(restartInfo.type)}</strong> for {restartInfo.teamName} 
            {restartInfo.remaining.toFixed(1)}s
          </div>
        )}
        <div className="pitch-wrapper">
          <PitchCanvas renderState={renderState} />
          {hudData.length > 0 && (
            <div className="match-hud">
              {hudData.map((entry) => (
                <div key={entry.team.id} className="hud-card">
                  <div className="hud-header">
                    <span style={{ color: entry.team.primaryColor }}>{entry.team.name}</span>
                    <span>
                      YC {entry.yellowCards} | RC {entry.redCards}
                    </span>
                  </div>
                  <div className="hud-metrics">
                    <div className="hud-metric">
                      <span>Avg Fatigue</span>
                      <strong>{Math.round(entry.avgFatigue * 100)}%</strong>
                    </div>
                    <div className="hud-metric">
                      <span>Avg Morale</span>
                      <strong>{Math.round(entry.avgMorale)}</strong>
                    </div>
                    <div className="hud-metric">
                      <span>Injuries</span>
                      <strong>{entry.injuries}</strong>
                    </div>
                  </div>
                  <div className="hud-alerts">
                    {entry.alerts.length === 0 && <div className="hud-muted">No alerts</div>}
                    {entry.alerts.map((alert) => (
                      <div key={alert.id} className="hud-alert">
                        <span>{alert.label}</span>
                        <span>{alert.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="controls-row" style={{ marginTop: '16px' }}>
          {[2, 4, 8, 16].map((speed) => (
            <button
              key={speed}
              className={state.simSpeed === speed ? 'button' : 'button secondary'}
              onClick={() => dispatch({ type: 'SET_SPEED', speed })}
            >
              x{speed}
            </button>
          ))}
          <button
            className="button"
            onClick={() => dispatch({ type: 'SET_PAUSED', paused: !state.isPaused })}
          >
            {state.isPaused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </section>

      <section className="card">
        <h3>Substitutions</h3>
        {!state.teamSetup && <p>Import teams to enable substitutions.</p>}
        {state.teamSetup && (
          <div className="substitution-grid">
            {state.teamSetup.teams.map((team) => {
              const lineupIds = team.slots
                .map((slot) => slot.playerId)
                .filter((value): value is string => Boolean(value));
              const benchIds = team.bench;
              const status = subStatus?.[team.id];
              const teamRoster = rosterNameMap[team.id] ?? {};
              const selection = subSelections[team.id] ?? { offId: '', onId: '' };

              return (
                <div key={team.id} className="substitution-card">
                  <div className="controls-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{team.name}</strong>
                    {status && (
                      <span>
                        Subs: {status.used}/{status.maxSubs} | Windows: {status.windowsUsed}/{status.maxWindows}
                      </span>
                    )}
                  </div>
                  <div className="controls-row">
                    <div>
                      <label className="sub-label">
                        Off
                        <select
                          className="select"
                          value={selection.offId}
                          onChange={(event) => handleSubSelection(team.id, 'offId', event.target.value)}
                        >
                          <option value="">Select player</option>
                          {lineupIds.map((playerId) => (
                            <option key={playerId} value={playerId}>
                              {teamRoster[playerId] ?? playerId}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div>
                      <label className="sub-label">
                        On
                        <select
                          className="select"
                          value={selection.onId}
                          onChange={(event) => handleSubSelection(team.id, 'onId', event.target.value)}
                        >
                          <option value="">Select player</option>
                          {benchIds.map((playerId) => (
                            <option key={playerId} value={playerId}>
                              {teamRoster[playerId] ?? playerId}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button className="button" onClick={() => handleApplySubstitution(team.id)}>
                      Make Substitution
                    </button>
                  </div>
                  {subErrors[team.id] && <div className="sub-error">{subErrors[team.id]}</div>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <h3>Commentary</h3>
        {commentary.length === 0 && <p>Commentary feed will appear as the match unfolds.</p>}
        {commentary.length > 0 && (
          <ul className="commentary-list">
            {commentary.slice(0, 12).map((line) => (
              <li key={line.id}>
                <span className="commentary-time">{formatClock(line.timeSeconds)}</span>
                <span>{line.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h3>Match Stats</h3>
        {!matchStats && <p>Live stats panel will appear here.</p>}
        {matchStats && homeTeam && awayTeam && (
          <div className="stats-table">
            <div className="stats-row stats-header">
              <span>Stat</span>
              <span>{homeTeam.name}</span>
              <span>{awayTeam.name}</span>
            </div>
            <div className="stats-row">
              <span>Possession</span>
              <span>{formatPercent(getPossessionPercent(homeTeam.id))}</span>
              <span>{formatPercent(getPossessionPercent(awayTeam.id))}</span>
            </div>
            <div className="stats-row">
              <span>Passes</span>
              <span>{getStatValue(homeTeam.id, 'passes')}</span>
              <span>{getStatValue(awayTeam.id, 'passes')}</span>
            </div>
            <div className="stats-row">
              <span>Pass Accuracy</span>
              <span>
                {formatRatio(
                  getStatValue(homeTeam.id, 'passes'),
                  getStatValue(homeTeam.id, 'passesAttempted')
                )}
              </span>
              <span>
                {formatRatio(
                  getStatValue(awayTeam.id, 'passes'),
                  getStatValue(awayTeam.id, 'passesAttempted')
                )}
              </span>
            </div>
            <div className="stats-row">
              <span>Shots</span>
              <span>{getStatValue(homeTeam.id, 'shots')}</span>
              <span>{getStatValue(awayTeam.id, 'shots')}</span>
            </div>
            <div className="stats-row">
              <span>Shots On Target</span>
              <span>{getStatValue(homeTeam.id, 'shotsOnTarget')}</span>
              <span>{getStatValue(awayTeam.id, 'shotsOnTarget')}</span>
            </div>
            <div className="stats-row">
              <span>Shots Off Target</span>
              <span>{getStatValue(homeTeam.id, 'shotsOffTarget')}</span>
              <span>{getStatValue(awayTeam.id, 'shotsOffTarget')}</span>
            </div>
            <div className="stats-row">
              <span>Shots Blocked</span>
              <span>{getStatValue(homeTeam.id, 'shotsBlocked')}</span>
              <span>{getStatValue(awayTeam.id, 'shotsBlocked')}</span>
            </div>
            <div className="stats-row">
              <span>Goals</span>
              <span>{getStatValue(homeTeam.id, 'goals')}</span>
              <span>{getStatValue(awayTeam.id, 'goals')}</span>
            </div>
            <div className="stats-row">
              <span>xG</span>
              <span>{getStatValue(homeTeam.id, 'xg').toFixed(2)}</span>
              <span>{getStatValue(awayTeam.id, 'xg').toFixed(2)}</span>
            </div>
            <div className="stats-row">
              <span>Yellow Cards</span>
              <span>{getStatValue(homeTeam.id, 'yellowCards')}</span>
              <span>{getStatValue(awayTeam.id, 'yellowCards')}</span>
            </div>
            <div className="stats-row">
              <span>Red Cards</span>
              <span>{getStatValue(homeTeam.id, 'redCards')}</span>
              <span>{getStatValue(awayTeam.id, 'redCards')}</span>
            </div>
            <div className="stats-row">
              <span>Fouls</span>
              <span>{getStatValue(homeTeam.id, 'fouls')}</span>
              <span>{getStatValue(awayTeam.id, 'fouls')}</span>
            </div>
            <div className="stats-row">
              <span>Corners</span>
              <span>{getStatValue(homeTeam.id, 'corners')}</span>
              <span>{getStatValue(awayTeam.id, 'corners')}</span>
            </div>
            <div className="stats-row">
              <span>Offsides</span>
              <span>{getStatValue(homeTeam.id, 'offsides')}</span>
              <span>{getStatValue(awayTeam.id, 'offsides')}</span>
            </div>
            <div className="stats-row">
              <span>Tackles Won</span>
              <span>{getStatValue(homeTeam.id, 'tacklesWon')}</span>
              <span>{getStatValue(awayTeam.id, 'tacklesWon')}</span>
            </div>
            <div className="stats-row">
              <span>Interceptions</span>
              <span>{getStatValue(homeTeam.id, 'interceptions')}</span>
              <span>{getStatValue(awayTeam.id, 'interceptions')}</span>
            </div>
            <div className="stats-row">
              <span>Saves</span>
              <span>{getStatValue(homeTeam.id, 'saves')}</span>
              <span>{getStatValue(awayTeam.id, 'saves')}</span>
            </div>
            <div className="stats-row">
              <span>Subs</span>
              <span>{getStatValue(homeTeam.id, 'substitutions')}</span>
              <span>{getStatValue(awayTeam.id, 'substitutions')}</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default MatchPage;

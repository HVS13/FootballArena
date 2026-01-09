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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (target.isContentEditable || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') {
        return;
      }

      const speedKeys: Record<string, number> = { '1': 2, '2': 4, '3': 8, '4': 16 };
      if (speedKeys[event.key]) {
        event.preventDefault();
        dispatch({ type: 'SET_SPEED', speed: speedKeys[event.key] });
        return;
      }

      if (event.key === ' ' || event.key.toLowerCase() === 'p') {
        event.preventDefault();
        dispatch({ type: 'SET_PAUSED', paused: !state.isPaused });
        return;
      }

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        const speeds = [2, 4, 8, 16];
        const index = speeds.indexOf(state.simSpeed);
        const next = speeds[Math.min(speeds.length - 1, index + 1)];
        dispatch({ type: 'SET_SPEED', speed: next });
        return;
      }

      if (event.key === '-') {
        event.preventDefault();
        const speeds = [2, 4, 8, 16];
        const index = speeds.indexOf(state.simSpeed);
        const next = speeds[Math.max(0, index - 1)];
        dispatch({ type: 'SET_SPEED', speed: next });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch, state.isPaused, state.simSpeed]);

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

  const buildStatRows = () => {
    if (!homeTeam || !awayTeam) return [];
    const statValue = (teamId: string, field: keyof MatchStats['byTeam'][string]) =>
      getStatValue(teamId, field);

    const passAccuracyHome = Number(
      formatRatio(statValue(homeTeam.id, 'passes'), statValue(homeTeam.id, 'passesAttempted')).replace('%', '')
    );
    const passAccuracyAway = Number(
      formatRatio(statValue(awayTeam.id, 'passes'), statValue(awayTeam.id, 'passesAttempted')).replace('%', '')
    );

    return [
      {
        id: 'possession',
        label: 'Possession',
        home: getPossessionPercent(homeTeam.id),
        away: getPossessionPercent(awayTeam.id),
        format: formatPercent,
        max: 100
      },
      {
        id: 'passes',
        label: 'Passes',
        home: statValue(homeTeam.id, 'passes'),
        away: statValue(awayTeam.id, 'passes'),
        format: (value: number) => value.toString()
      },
      {
        id: 'passAccuracy',
        label: 'Pass Accuracy',
        home: passAccuracyHome,
        away: passAccuracyAway,
        format: formatPercent,
        max: 100
      },
      {
        id: 'shots',
        label: 'Shots',
        home: statValue(homeTeam.id, 'shots'),
        away: statValue(awayTeam.id, 'shots'),
        format: (value: number) => value.toString()
      },
      {
        id: 'shotsOnTarget',
        label: 'Shots On Target',
        home: statValue(homeTeam.id, 'shotsOnTarget'),
        away: statValue(awayTeam.id, 'shotsOnTarget'),
        format: (value: number) => value.toString()
      },
      {
        id: 'shotsOffTarget',
        label: 'Shots Off Target',
        home: statValue(homeTeam.id, 'shotsOffTarget'),
        away: statValue(awayTeam.id, 'shotsOffTarget'),
        format: (value: number) => value.toString()
      },
      {
        id: 'shotsBlocked',
        label: 'Shots Blocked',
        home: statValue(homeTeam.id, 'shotsBlocked'),
        away: statValue(awayTeam.id, 'shotsBlocked'),
        format: (value: number) => value.toString()
      },
      {
        id: 'goals',
        label: 'Goals',
        home: statValue(homeTeam.id, 'goals'),
        away: statValue(awayTeam.id, 'goals'),
        format: (value: number) => value.toString()
      },
      {
        id: 'xg',
        label: 'xG',
        home: statValue(homeTeam.id, 'xg'),
        away: statValue(awayTeam.id, 'xg'),
        format: (value: number) => value.toFixed(2)
      },
      {
        id: 'yellowCards',
        label: 'Yellow Cards',
        home: statValue(homeTeam.id, 'yellowCards'),
        away: statValue(awayTeam.id, 'yellowCards'),
        format: (value: number) => value.toString()
      },
      {
        id: 'redCards',
        label: 'Red Cards',
        home: statValue(homeTeam.id, 'redCards'),
        away: statValue(awayTeam.id, 'redCards'),
        format: (value: number) => value.toString()
      },
      {
        id: 'fouls',
        label: 'Fouls',
        home: statValue(homeTeam.id, 'fouls'),
        away: statValue(awayTeam.id, 'fouls'),
        format: (value: number) => value.toString()
      },
      {
        id: 'corners',
        label: 'Corners',
        home: statValue(homeTeam.id, 'corners'),
        away: statValue(awayTeam.id, 'corners'),
        format: (value: number) => value.toString()
      },
      {
        id: 'offsides',
        label: 'Offsides',
        home: statValue(homeTeam.id, 'offsides'),
        away: statValue(awayTeam.id, 'offsides'),
        format: (value: number) => value.toString()
      },
      {
        id: 'tackles',
        label: 'Tackles Won',
        home: statValue(homeTeam.id, 'tacklesWon'),
        away: statValue(awayTeam.id, 'tacklesWon'),
        format: (value: number) => value.toString()
      },
      {
        id: 'interceptions',
        label: 'Interceptions',
        home: statValue(homeTeam.id, 'interceptions'),
        away: statValue(awayTeam.id, 'interceptions'),
        format: (value: number) => value.toString()
      },
      {
        id: 'saves',
        label: 'Saves',
        home: statValue(homeTeam.id, 'saves'),
        away: statValue(awayTeam.id, 'saves'),
        format: (value: number) => value.toString()
      },
      {
        id: 'subs',
        label: 'Subs',
        home: statValue(homeTeam.id, 'substitutions'),
        away: statValue(awayTeam.id, 'substitutions'),
        format: (value: number) => value.toString()
      }
    ];
  };

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
          <div role="status" aria-live="polite">
            Match Time: {renderState ? formatClock(renderState.time) : '00:00'}
          </div>
          <div aria-live="polite">Speed: x{state.simSpeed}</div>
        </div>
        {restartInfo && (
          <div className="restart-banner" role="status" aria-live="assertive">
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
              aria-label={`Set speed to ${speed}x`}
              aria-pressed={state.simSpeed === speed}
              aria-keyshortcuts={String([2, 4, 8, 16].indexOf(speed) + 1)}
            >
              x{speed}
            </button>
          ))}
          <button
            className="button"
            onClick={() => dispatch({ type: 'SET_PAUSED', paused: !state.isPaused })}
            aria-label={state.isPaused ? 'Resume match' : 'Pause match'}
            aria-pressed={state.isPaused}
            aria-keyshortcuts="Space P"
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
                          aria-label={`Sub off player for ${team.name}`}
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
                          aria-label={`Sub on player for ${team.name}`}
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
          <ul className="commentary-list" aria-live="polite" aria-relevant="additions text">
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
          <div className="stats-grid">
            {buildStatRows().map((row) => {
              const max = row.max ?? Math.max(row.home, row.away, 1);
              const homeWidth = Math.min(100, (row.home / max) * 100);
              const awayWidth = Math.min(100, (row.away / max) * 100);
              return (
                <div key={row.id} className="stats-item">
                  <div className="stats-label">{row.label}</div>
                  <div className="stats-values">
                    <span>{row.format(row.home)}</span>
                    <div className="stats-bars" role="group" aria-label={`${row.label} comparison`}>
                      <div
                        className="stats-bar home"
                        style={{ width: `${homeWidth}%`, background: homeTeam.primaryColor }}
                        aria-label={`${homeTeam.name} ${row.format(row.home)}`}
                      />
                      <div
                        className="stats-bar away"
                        style={{ width: `${awayWidth}%`, background: awayTeam.primaryColor }}
                        aria-label={`${awayTeam.name} ${row.format(row.away)}`}
                      />
                    </div>
                    <span>{row.format(row.away)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default MatchPage;

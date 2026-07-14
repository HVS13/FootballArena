import { useNavigate } from 'react-router-dom';
import { buildSetupFromTeams } from './TeamSetupPage';
import { useAppState } from '../state/appState';

const HomePage = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useAppState();

  const quickMatch = () => {
    dispatch({ type: 'SET_TEAM_SETUP', teamSetup: buildSetupFromTeams([]) });
    dispatch({ type: 'SET_PAUSED', paused: false });
    dispatch({ type: 'SET_MATCH_SEED', seed: null });
    navigate('/match');
  };

  return (
    <div className="page-grid">
      <section className="card">
        <h1>Football Arena</h1>
        <p>Configure the teams and tactics. The simulation controls each player and reports the match through commentary and statistics.</p>
        <div className="controls-row">
          <button className="button" onClick={quickMatch}>Quick Match</button>
          <button className="button secondary" onClick={() => navigate('/setup')}>Configure or Import Teams</button>
          {state.teamSetup && (
            <button className="button secondary" onClick={() => navigate('/setup')}>Restore Last Setup</button>
          )}
        </div>
      </section>
    </div>
  );
};

export default HomePage;

import { NavLink, Route, Routes } from 'react-router-dom';
import { AppStateProvider } from './state/appState';
import TeamSetupPage from './pages/TeamSetupPage';
import MatchPage from './pages/MatchPage';

const App = () => {
  return (
    <AppStateProvider>
      <div className="app-shell">
        <header className="app-header">
          <div className="app-title">Football Arena</div>
          <nav className="app-nav">
            <NavLink to="/setup">Team Setup</NavLink>
            <NavLink to="/match">Match</NavLink>
          </nav>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<TeamSetupPage />} />
            <Route path="/setup" element={<TeamSetupPage />} />
            <Route path="/match" element={<MatchPage />} />
          </Routes>
        </main>
      </div>
    </AppStateProvider>
  );
};

export default App;

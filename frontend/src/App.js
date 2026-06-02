// frontend/src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import Avatars from './pages/Avatars';
import AvatarDetail from './pages/AvatarDetail';
import Channels from './pages/Channels';
import MusicLibrary from './pages/MusicLibrary';
import NewsSources from './pages/NewsSources';
import Scripts from './pages/Scripts';
import Audios from './pages/Audios';
import Videos from './pages/Videos';
import PublishLogs from './pages/PublishLogs';
import Metrics from './pages/Metrics';
import './styles/App.css';

const ROUTE_TITLES = {
  '/': 'Dashboard',
  '/avatars': 'Avatar Lab',
  '/channels': 'Channel Manager',
  '/music': 'Music Library',
  '/news-sources': 'News Sources',
  '/scripts': 'Script Studio',
  '/audios': 'Audio Outputs',
  '/videos': 'Video Forge',
  '/publish-logs': 'Publishing Hub',
  '/metrics': 'Metrics'
};

function AppFrame() {
  const { pathname } = useLocation();
  const title = ROUTE_TITLES[pathname] || 'Media Control Center';
  const [theme, setTheme] = React.useState(() => {
    const saved = window.localStorage.getItem('mcc-theme');
    return saved || 'light';
  });

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('mcc-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === 'light' ? 'dark' : 'light'));
  };

  return (
    <div className="app-shell">
      <div className="atmo atmo-one" />
      <div className="atmo atmo-two" />

      <div className="layout-frame">
        <Sidebar />

        <div className="content-panel">
          <header className="topbar">
            <div>
              <p className="eyebrow">Media Automation Studio</p>
              <h1>{title}</h1>
            </div>

            <div className="topbar-meta">
              <span className="pulse-dot" aria-hidden="true" />
              <span>Local Runtime Active</span>
              <button className="theme-toggle" onClick={toggleTheme} type="button">
                {theme === 'light' ? 'Light' : 'Dark'}
              </button>
            </div>
          </header>

          <main className="page-container">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/avatars" element={<Avatars />} />
              <Route path="/avatars/:id" element={<AvatarDetail />} />
              <Route path="/channels" element={<Channels />} />
              <Route path="/music" element={<MusicLibrary />} />
              <Route path="/news-sources" element={<NewsSources />} />
              <Route path="/scripts" element={<Scripts />} />
              <Route path="/audios" element={<Audios />} />
              <Route path="/videos" element={<Videos />} />
              <Route path="/publish-logs" element={<PublishLogs />} />
              <Route path="/metrics" element={<Metrics />} />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppFrame />
    </Router>
  );
}

export default App;
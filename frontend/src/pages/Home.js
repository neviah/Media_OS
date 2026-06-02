// frontend/src/pages/Home.js
import React from 'react';
import { apiGet } from '../lib/api';

const Home = () => {
  const [stats, setStats] = React.useState({
    workspaces: 0,
    channels: 0,
    avatars: 0,
    videos: 0
  });
  const [apiReady, setApiReady] = React.useState(true);

  React.useEffect(() => {
    const endpointMap = {
      workspaces: '/api/workspaces/',
      channels: '/api/channels/',
      avatars: '/api/avatars/',
      videos: '/api/videos/'
    };

    const loadStats = async () => {
      try {
        const entries = await Promise.all(
          Object.entries(endpointMap).map(async ([key, path]) => {
            const data = await apiGet(path);
            return [key, Array.isArray(data) ? data.length : 0];
          })
        );

        setStats(Object.fromEntries(entries));
        setApiReady(true);
      } catch {
        setApiReady(false);
      }
    };

    loadStats();
    const intervalId = window.setInterval(loadStats, 20000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <div className="dashboard-root">
      <section className="hero-card reveal-up">
        <div className="hero-content">
          <p className="hero-tag">Automation Center</p>
          <h2>Build, voice, animate, and publish from one control panel.</h2>
          <p>
            Media Control Center is your local command bridge for the full content pipeline,
            from news intake and script generation to avatar delivery and social publishing.
          </p>
        </div>

        <div className="hero-grid" aria-label="Pipeline overview">
          <div className="metric-chip">
            <span>Workspaces</span>
            <strong>{stats.workspaces}</strong>
          </div>
          <div className="metric-chip">
            <span>Channels</span>
            <strong>{stats.channels}</strong>
          </div>
          <div className="metric-chip">
            <span>Avatars</span>
            <strong>{stats.avatars}</strong>
          </div>
          <div className="metric-chip">
            <span>Videos</span>
            <strong>{stats.videos}</strong>
          </div>
        </div>
      </section>

      <section className="feature-grid reveal-up delay-1">
        <article className="feature-card">
          <h3>Avatar Lab</h3>
          <p>Create host personas, voice profiles, and multi-angle reference sets for production use.</p>
        </article>

        <article className="feature-card">
          <h3>Channel Control</h3>
          <p>Map each channel to brand voice, schedule cadence, music policy, and publishing destinations.</p>
        </article>

        <article className="feature-card">
          <h3>Music Curation</h3>
          <p>Generate and approve tracks by mood and tempo, then auto-match them during final assembly.</p>
        </article>
      </section>

      <section className="pipeline-strip reveal-up delay-2">
        <h3>Pipeline Stages</h3>
        <div className="stage-list">
          <span>{apiReady ? 'Fetch' : 'API Down'}</span>
          <span>{apiReady ? 'Write' : 'Reconnect'}</span>
          <span>{apiReady ? 'Voice' : 'Pending'}</span>
          <span>{apiReady ? 'Animate' : 'Pending'}</span>
          <span>{apiReady ? 'Assemble' : 'Pending'}</span>
          <span>{apiReady ? 'Publish' : 'Pending'}</span>
        </div>
      </section>
    </div>
  );
};

export default Home;
// frontend/src/components/Sidebar.js
import React from 'react';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', prefix: 'DB' },
  { to: '/workspaces', label: 'Workspaces', prefix: 'WS' },
  { to: '/avatars', label: 'Avatars', prefix: 'AV' },
  { to: '/channels', label: 'Channels', prefix: 'CH' },
  { to: '/music', label: 'Music Library', prefix: 'MU' },
  { to: '/news-sources', label: 'News Sources', prefix: 'NS' },
  { to: '/scripts', label: 'Scripts', prefix: 'SC' },
  { to: '/audios', label: 'Audios', prefix: 'AU' },
  { to: '/videos', label: 'Videos', prefix: 'VI' },
  { to: '/publish-logs', label: 'Publish Logs', prefix: 'PL' },
  { to: '/metrics', label: 'Metrics', prefix: 'MT' }
];

const Sidebar = () => {
  return (
    <aside className="sidebar-shell">
      <div className="sidebar-header">
        <p className="sidebar-brand-mark">MCC</p>
        <h2>Media Control</h2>
        <p>Production cockpit</p>
      </div>

      <nav className="sidebar-nav" aria-label="Main">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span className="nav-prefix" aria-hidden="true">{item.prefix}</span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
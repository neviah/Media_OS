# Media Control Center

A full-stack local application that automates news ingestion, script generation, avatar creation, voice synthesis, talking-head video generation, video assembly, and social-media publishing.

## Features

- **Backend**: FastAPI with SQLAlchemy ORM, modular architecture
- **Frontend**: React with Tailwind CSS (via CDN for development)
- **Workspaces & Channels**: Support for unlimited workspaces and channels
- **Avatar Lab**: Create avatars with base portraits and reference sheets
- **Music Library**: Generate and approve music tracks
- **News → Script Pipeline**: Fetch news, summarize, generate scripts
- **Script → Voice Pipeline**: Generate narration audio with OpenVoice
- **Voice → Avatar Video Pipeline**: Create talking-head videos with LivePortrait
- **Video Assembly Pipeline**: Add music, B-roll, captions, compose final video
- **Publishing Pipeline**: Upload to YouTube, TikTok, Instagram, X
- **Metrics Pipeline** (Phase 2): Track views, likes, comments, watch time, etc.
- **Account Factory** (Phase 3): Future module for auto-creating accounts

## Project Structure

```
media-control-center/
├── backend/
│   ├── api/
│   │   ├── main.py
│   │   └── routers/
│   │       ├── workspaces.py
│   │       ├── avatars.py
│   │       ├── channels.py
│   │       ├── music.py
│   │       ├── news_sources.py
│   │       ├── scripts.py
│   │       ├── audios.py
│   │       ├── videos.py
│   │       ├── publish_logs.py
│   │       └── metrics.py
│   ├── models/
│   │   ├── __init__.py
│   │   └── database.py
│   ├── schemas/
│   │   ├── workspace.py
│   │   └── avatar.py
│   ├── database.py
│   ├── requirements.txt
│   └── main.py
├── frontend/
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── index.js
│       ├── App.js
│       ├── components/
│       │   └── Sidebar.js
│       ├── pages/
│       │   ├── Home.js
│       │   ├── Avatars.js
│       │   ├── Channels.js
│       │   ├── MusicLibrary.js
│       │   ├── NewsSources.js
│       │   ├── Scripts.js
│       │   ├── Audios.js
│       │   ├── Videos.js
│       │   ├── PublishLogs.js
│       │   └── Metrics.js
│       ├── layouts/
│       ├── hooks/
│       ├── context/
│       └── styles/
└── workspaces/
    └── {workspace_id}/
        ├── avatars/
        ├── music/
        ├── videos/
        ├── scripts/
        └── logs/
```

## Setup Instructions

### Quick Start (Windows)

From the project root, fastest option is:

- `powershell -ExecutionPolicy Bypass -File start_all.ps1`

This starts backend and frontend, then waits until both health checks pass.

Manual option (two terminals):

1. Backend:
   - `powershell -ExecutionPolicy Bypass -File backend/start.ps1`
2. Frontend:
   - `powershell -ExecutionPolicy Bypass -File frontend/start.ps1`

Then open:
- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:8000/api/health`

Notes:
- The backend startup script installs a lightweight runtime dependency set from `backend/requirements.dev.txt` so API bring-up is fast and reliable.
- Full AI model dependencies remain in `backend/requirements.txt` for later GPU/model setup.
- Use `powershell -ExecutionPolicy Bypass -File stop_all.ps1` to stop both services launched by `start_all.ps1`.

### Pinokio Scaffold (Starter)

Starter launcher files are included in `pinokio_scaffold/`:
- `pinokio.json` and `pinokio.js` metadata/menu
- `install.js`, `start.js`, `reset.js`, `update.js` for lifecycle commands

This is a scaffold to accelerate packaging into a final Pinokio app folder.

### Pinokio Launcher (Active)

A ready-to-run launcher has also been created in your Pinokio home:
- `D:\pinokio\api\mediaos`

It includes:
- Dynamic menu (`pinokio.js`) with install/start/update/reset flows
- URL capture from startup logs for Open Web UI actions
- Platform-aware install/start/reset scripting

### Dashboard Runtime Data + Theme

- Dashboard cards now pull live counts from backend APIs (`/api/workspaces/`, `/api/channels/`, `/api/avatars/`, `/api/videos/`)
- Top bar includes a persisted Light/Dark theme toggle stored in browser localStorage

### Prerequisites

- Python 3.12+
- Node.js 18+ (for frontend development)
- Git

### Backend Setup

1. Clone the repository
2. Navigate to the backend directory:
   ```bash
   cd backend
   ```
3. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
5. Set up environment variables (create a `.env` file):
   ```env
   DATABASE_URL=sqlite:///./media_control_center.db
   ```
6. Run the database migrations (if using Alembic):
   ```bash
   alembic upgrade head
   ```
7. Start the server:
   ```bash
   uvicorn main:app --reload
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies (if using npm/yarn):
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm start
   ```
   Note: For simplicity, the current frontend uses CDN links for React and Tailwind CSS. To use a full React setup with build tools, you would need to set up a proper React project (e.g., using Create React App or Vite) and install the dependencies listed in the package.json.

## API Endpoints

The backend provides RESTful API endpoints for all entities:

- Workspaces: `/api/workspaces/`
- Avatars: `/api/avatars/`
- Channels: `/api/channels/`
- Music: `/api/music/`
- News Sources: `/api/news-sources/`
- Scripts: `/api/scripts/`
- Audios: `/api/audios/`
- Videos: `/api/videos/`
- Publish Logs: `/api/publish-logs/`
- Metrics: `/api/metrics/`

Each endpoint supports standard CRUD operations.

## Pipeline Orchestration

The Hermes Agent (not included in this skeleton) acts as the director, controlling the pipelines, validating scripts, choosing music, handling retries, managing workspaces, and coordinating all modules.

## Future Work

- Implement the actual AI/ML model integrations (Flux, OpenVoice, LivePortrait, MusicGen, etc.)
- Add WebSocket support for real-time pipeline status
- Implement the task queue system (using Redis/RQ or Celery)
- Add GPU job scheduler
- Complete the frontend with all necessary components and pages
- Implement authentication and authorization
- Add comprehensive testing

## License

This project is licensed under the MIT License.
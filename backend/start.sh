# Backend Startup Script
#!/bin/bash

set -e

echo "Starting Media Control Center Backend..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Check if virtual environment exists, if not create it
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r backend/requirements.dev.txt

# Run database migrations (if using Alembic)
# alembic upgrade head

# Start the server
echo "Starting FastAPI server..."
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
# Frontend Startup Script
#!/bin/bash

set -e

echo "Starting Media Control Center Frontend..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# For development with CDN links, we can serve with a simple HTTP server
# Install serve if not available
if ! command -v serve &> /dev/null
then
    echo "Installing serve..."
    npm install -g serve
fi

# Serve the frontend
echo "Serving frontend on http://localhost:3000"
npm install
npm start
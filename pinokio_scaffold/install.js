module.exports = {
  run: [
    {
      method: "shell.run",
      params: {
        message: [
          "if command -v python3 >/dev/null 2>&1; then python3 -m venv .venv; else py -3 -m venv .venv; fi",
          "if [ -f .venv/bin/python ]; then .venv/bin/python -m pip install -r backend/requirements.dev.txt; else .venv/Scripts/python.exe -m pip install -r backend/requirements.dev.txt; fi"
        ]
      }
    },
    {
      method: "shell.run",
      params: {
        path: "frontend",
        message: "npm install"
      }
    }
  ]
};

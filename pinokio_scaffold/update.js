module.exports = {
  run: [
    {
      method: "shell.run",
      params: {
        message: [
          "git pull --ff-only",
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

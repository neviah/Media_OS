module.exports = {
  run: [
    {
      method: "shell.run",
      params: {
        message: [
          "rm -rf .venv .run frontend/node_modules frontend/package-lock.json",
          "if exist .venv rmdir /s /q .venv",
          "if exist .run rmdir /s /q .run",
          "if exist frontend\\node_modules rmdir /s /q frontend\\node_modules",
          "if exist frontend\\package-lock.json del /q frontend\\package-lock.json"
        ]
      }
    }
  ]
};

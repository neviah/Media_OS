module.exports = {
  daemon: true,
  run: [
    {
      method: "shell.run",
      params: {
        message: [
          "if [ -f start_all.ps1 ]; then powershell -ExecutionPolicy Bypass -File start_all.ps1; else pwsh -ExecutionPolicy Bypass -File start_all.ps1; fi"
        ],
        on: [
          {
            event: "/(http:\\/\\/127.0.0.1:3000)/",
            done: true
          }
        ]
      }
    },
    {
      method: "local.set",
      params: {
        url: "{{input.event[1]}}"
      }
    }
  ]
};

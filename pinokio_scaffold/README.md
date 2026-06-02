# MediaOS Pinokio Scaffold

This folder is a starter launcher scaffold for packaging MediaOS as a Pinokio app.

## Included files

- `pinokio.json`: app metadata
- `pinokio.js`: launcher menu
- `install.js`: installs backend runtime dependencies and frontend packages
- `start.js`: starts the local stack through `start_all.ps1`
- `reset.js`: removes local env/runtime artifacts
- `update.js`: updates repository deps and frontend packages

## Notes

- This scaffold is intentionally lightweight and references the local workspace scripts.
- Before publishing, validate script behavior in your target Pinokio environment and adjust command paths as needed.

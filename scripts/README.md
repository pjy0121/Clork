# Clork Startup Scripts

These scripts help you quickly start Clork with a single command.

## Usage

### Windows

#### Using Command Prompt or File Explorer:
```cmd
scripts\run-clork.bat
```
Or simply double-click `run-clork.bat` in File Explorer.

#### Using PowerShell:
```powershell
.\scripts\run-clork.ps1
```

Note: If you get an execution policy error in PowerShell, run:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### macOS / Linux

```bash
./scripts/run-clork.sh
```

## What the scripts do

1. **Check Prerequisites**: Verify Node.js and npm are installed
2. **Install Dependencies**: Automatically install missing dependencies
3. **Start Servers**: Launch both backend (port 3001) and frontend (port 5173)
4. **Open Browser**: Automatically open http://localhost:5173 in your default browser
5. **Display Status**: Show server URLs and status information

## Features

- ✅ Automatic dependency installation
- ✅ Cross-platform support (Windows, macOS, Linux)
- ✅ Automatic browser opening
- ✅ Colorful output (PowerShell)
- ✅ Error handling and helpful messages

## Stopping Clork

Press `Ctrl+C` in the terminal to stop both servers.

## Troubleshooting

If the scripts don't work:

1. Make sure you run them from the project root directory
2. Ensure Node.js is installed: `node --version`
3. Ensure npm is installed: `npm --version`
4. Try running `npm install` manually in the root, backend, and frontend directories
@echo off
echo ========================================
echo   Starting Clork - Claude + Work
echo ========================================
echo.

REM Check if node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

REM Check if npm is installed
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: npm is not installed or not in PATH
    pause
    exit /b 1
)

REM Check if dependencies are installed
if not exist "node_modules" (
    echo Installing root dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo Failed to install root dependencies
        pause
        exit /b 1
    )
)

if not exist "backend\node_modules" (
    echo Installing backend dependencies...
    cd backend
    call npm install
    cd ..
    if %errorlevel% neq 0 (
        echo Failed to install backend dependencies
        pause
        exit /b 1
    )
)

if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
    if %errorlevel% neq 0 (
        echo Failed to install frontend dependencies
        pause
        exit /b 1
    )
)

echo.
echo Starting Clork servers...
echo   Backend:  http://localhost:3001
echo   Frontend: http://localhost:5173
echo.
echo Press Ctrl+C to stop the servers
echo.

REM Wait a moment before opening browser
timeout /t 3 /nobreak >nul 2>nul

REM Open browser
start http://localhost:5173

REM Start the dev servers
call npm run dev
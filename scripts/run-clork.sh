#!/bin/bash

echo "========================================"
echo "  Starting Clork - Claude + Work"
echo "========================================"
echo ""

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    echo "Please install Node.js from https://nodejs.org"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed"
    exit 1
fi

# Check and install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing root dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "Failed to install root dependencies"
        exit 1
    fi
fi

if [ ! -d "backend/node_modules" ]; then
    echo "Installing backend dependencies..."
    cd backend && npm install && cd ..
    if [ $? -ne 0 ]; then
        echo "Failed to install backend dependencies"
        exit 1
    fi
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend && npm install && cd ..
    if [ $? -ne 0 ]; then
        echo "Failed to install frontend dependencies"
        exit 1
    fi
fi

echo ""
echo "Starting Clork servers..."
echo "  Backend:  http://localhost:3001"
echo "  Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop the servers"
echo ""

# Function to open browser based on OS
open_browser() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        open http://localhost:5173
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v xdg-open &> /dev/null; then
            xdg-open http://localhost:5173
        elif command -v gnome-open &> /dev/null; then
            gnome-open http://localhost:5173
        fi
    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
        # Windows (Git Bash / Cygwin)
        start http://localhost:5173
    fi
}

# Open browser after 3 seconds
(sleep 3 && open_browser) &

# Start the dev servers
npm run dev
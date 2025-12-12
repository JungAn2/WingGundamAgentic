#!/bin/bash

echo -e "\033[0;32mEngaging Zero System...\033[0m"

# Start Backend
cd backend
./.venv/bin/python3 -m uvicorn app:app --reload --port 5501 &
BACKEND_PID=$!
cd ..

# Start Frontend
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo "System Operational. Press Ctrl+C to shutdown."
wait $BACKEND_PID $FRONTEND_PID

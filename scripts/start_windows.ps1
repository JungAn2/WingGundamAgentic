# Start Wing Gundam System (Windows)

Write-Host "Engaging Zero System..." -ForegroundColor Green

# Start Backend
Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "cd backend; .\.venv\Scripts\python -m uvicorn app:app --reload --port 8000"

# Start Frontend
Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

Write-Host "System Operational." -ForegroundColor Green

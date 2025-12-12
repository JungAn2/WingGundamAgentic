# Wing Gundam Agentic Installer (Windows)

Write-Host "Initializing Wing Gundam System Installer..." -ForegroundColor Green

# Check Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Python is not installed." -ForegroundColor Red
    exit 1
}

# Check Node
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js is not installed." -ForegroundColor Red
    exit 1
}

# Backend Setup
Write-Host "Setting up Backend..." -ForegroundColor Green
cd backend
uv venv --python 3.12 .venv --allow-existing
uv pip install -p .venv -r requirements.txt
# Create default .env if not exists
if (-not (Test-Path .env)) {
    Copy-Item .env.example .env -ErrorAction SilentlyContinue
    Write-Host "Created .env file. Please configure it." -ForegroundColor Yellow
}
cd ..

# Frontend Setup
Write-Host "Setting up Frontend..." -ForegroundColor Green
cd frontend
npm install
npm run build
cd ..

Write-Host "Installation Complete. Run scripts/start_windows.ps1 to engage." -ForegroundColor Green

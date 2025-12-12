#!/bin/bash

echo -e "\033[0;32mInitializing Wing Gundam System Installer...\033[0m"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "\033[0;31mERROR: Python3 is not installed.\033[0m"
    exit 1
fi

# Check Node
if ! command -v node &> /dev/null; then
    echo -e "\033[0;31mERROR: Node.js is not installed.\033[0m"
    exit 1
fi

# Backend Setup
echo -e "\033[0;32mSetting up Backend...\033[0m"
cd backend
uv venv --python 3.12 .venv --allow-existing
source .venv/bin/activate
uv pip install -r requirements.txt
# Create default .env if not exists
if [ ! -f .env ]; then
    touch .env
    echo "DEEPSEEK_API_KEY=your_key" >> .env
    echo "EMAIL_USER=your_email" >> .env
    echo "Created .env file. Please configure it."
fi
deactivate
cd ..

# Frontend Setup
echo -e "\033[0;32mSetting up Frontend...\033[0m"
cd frontend
npm install
npm run build
cd ..

echo -e "\033[0;32mInstallation Complete. Run scripts/start.sh to engage.\033[0m"

# Wing Gundam Agentic

Wing Gundam Agentic is a custom operating system for the Wing Gundam Agentic. It is based on the Wing Gundam Agentic and is designed to be like Gundam system. Mostly for OS security and performance checker. This should be like Gundam system ![alt text](image.png) also it should be able to be installed on all linux, mac, and windows. linux will be through apt, dnf, and zypper. mac will be through homebrew. windows will be through winget.

## backend
This is LLM agentic that will do tasks either from scheduled or from user request from frontend. The llm will be deepseek-chat by default and will be in fast mode by default. Thinking mode will be for agentic mode. All the scheduled tasks will be deepseek-chat. This will use rag system to store the information. and sql database for time and command used and information and summary for scheduled tasks.If it flags as unsafe, it will send an email notification to the user with the detailed information.

## frontend
This is the frontend that will be used to interact with the backend. It will be a web application that will be used to interact with the backend. It will be a simple web application that will be used to interact with the backend. It will be a simple web application that will be used to interact with the backend. It will be made using nextjs and tailwindcss. Will be running locally on port 3000. The theme is Gundam wing which means it should be like the wing system ![alt text](image.png)

This program can only be access by third party through ssh with localforwarding for both the backend port and frontend port.
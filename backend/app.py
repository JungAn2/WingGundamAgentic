from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from database import init_db, SessionLocal, TaskLog, Issue
from agent import agent
from scheduler import start_scheduler
from sqlalchemy.orm import Session
import json
import traceback

app = FastAPI(title="Wing Gundam Agentic Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5000", "http://localhost:5500", "http://127.0.0.1:5500"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize DB and Scheduler
init_db()
start_scheduler()

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    response: str

class IssueCreate(BaseModel):
    title: str
    description: str

class CommandRequest(BaseModel):
    command: str

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
def read_root():
    return {"status": "Wing Gundam System Online", "mode": "Agentic"}

@app.post("/chat")
def chat(request: ChatRequest):
    try:
        response = agent.chat(request.message)
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/logs")
def get_logs(db: Session = Depends(get_db)):
    logs = db.query(TaskLog).order_by(TaskLog.timestamp.desc()).limit(50).all()
    return logs

@app.get("/scheduled-tasks")
def get_scheduled_tasks(db: Session = Depends(get_db)):
    from database import ScheduledTask
    tasks = db.query(ScheduledTask).all()
    return tasks

# Zero System v2.0 Endpoints

@app.get("/issues")
def get_issues(db: Session = Depends(get_db)):
    return db.query(Issue).order_by(Issue.timestamp.desc()).limit(50).all()

@app.post("/issues")
def create_issue(issue: IssueCreate, db: Session = Depends(get_db)):
    new_issue = Issue(title=issue.title, description=issue.description)
    db.add(new_issue)
    db.commit()
    db.refresh(new_issue)
    return new_issue

@app.put("/issues/{issue_id}/resolve")
def resolve_issue(issue_id: int, db: Session = Depends(get_db)):
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    issue.status = "RESOLVED"
    db.commit()
    return {"status": "resolved"}

# Global process tracker
import subprocess
import threading
import uuid
import signal
import os

active_processes = {}
process_lock = threading.Lock()

@app.post("/execute-command")
def execute_command(request: CommandRequest):
    # Store process to allow cancellation
    proc_id = str(uuid.uuid4())
    
    try:
        # Popen allows us to keep the process object
        process = subprocess.Popen(
            request.command, 
            shell=True, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE,
            text=True,
            start_new_session=True # Key for killing execution groups later
        )
        
        with process_lock:
            active_processes[proc_id] = process

        # Wait for result
        stdout, stderr = process.communicate()
        
        return {
            "stdout": stdout,
            "stderr": stderr,
            "returncode": process.returncode
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        with process_lock:
            if proc_id in active_processes:
                del active_processes[proc_id]

@app.post("/kill-all-processes")
def kill_all_processes():
    count = 0
    with process_lock:
        for pid, process in list(active_processes.items()):
            try:
                # Terminate properly
                process.terminate()
                # If using start_new_session=True, we can kill the group (Linux/Mac)
                # os.killpg(os.getpgid(process.pid), signal.SIGTERM) 
                # But simple terminate() is often enough for simple commands
                process.kill() 
                del active_processes[pid]
                count += 1
            except Exception as e:
                print(f"Error killing process {pid}: {e}")
    return {"status": "success", "killed_count": count}

class ScheduleCreate(BaseModel):
    name: str
    cron_expression: str
    description: str
    prompt: Optional[str] = None
    input_command: Optional[str] = None
    follow_up_command: Optional[str] = None
    is_agentic: bool = False

class HostCreate(BaseModel):
    hostname: str
    ip_address: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = "UNKNOWN"

class RunTaskRequest(BaseModel):
    name: str

class TaskValidationRequest(BaseModel):
    name: str
    cron_expression: str
    description: str
    prompt: Optional[str] = None
    input_command: Optional[str] = None
    follow_up_command: Optional[str] = None

class ConfigRequest(BaseModel):
    provider: str # deepseek | ollama
    model: str # deepseek-chat | mistral | generic

@app.get("/config/llm")
def get_llm_config():
    return {
        "provider": agent.provider,
        "model": agent.model
    }

@app.post("/config/llm")
def set_llm_config(config: ConfigRequest):
    try:
        agent.update_config(config.provider, config.model)
        return {"status": "success", "provider": agent.provider, "model": agent.model}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/validate-task")
def validate_task(task: TaskValidationRequest):
    # Ask the Agent to validate the task configuration
    system_prompt = """
    You are a Configuration Validator.
    Your job is to check the following Scheduled Task configuration for errors.
    
    Checks:
    1. Cron Expression Syntax (standard 5-field cron).
    2. Command Safety/Syntax (PowerShell/CMD).
    3. Name/Description Clarity.
    4. Spelling errors in Prompt/Description.
    
    Return JSON:
    {
        "isValid": boolean,
        "corrections": {
            "name": "Suggested Name (if missing/invalid)",
            "cron_expression": "Corrected Cron (default 0 0 * * * if invalid)",
            "description": "Suggested Description (if missing)",
            "prompt": "Refined Prompt",
            "input_command": "Corrected Input Cmd", 
            "follow_up_command": "Corrected Follow Up Cmd"
        },
        "analysis": "Explanation of issues found. If auto-correcting, explain what was changed."
    }
    
    CRITICAL: If a required field (Name, Description, Prompt) is empty, you MUST provide a valid placeholder or suggestion in 'corrections'. Do not just say it is invalid.
    """
    
    user_input = f"Task Configuration:\n{task.json()}"
    
    try:
        response = agent.client.chat.completions.create(
            model=agent.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_input}
            ],
            response_format={"type": "json_object"}
        )
        content = response.choices[0].message.content
        print(f"DEBUG: Validation Raw Output: {content}") # Log raw output
        return json.loads(content)
    except Exception as e:
        print("ERROR in validate_task:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/scheduled-tasks")
def create_schedule(task: ScheduleCreate, db: Session = Depends(get_db)):
    from database import ScheduledTask
    from scheduler import add_job_from_db
    try:
        new_task = ScheduledTask(
            name=task.name,
            cron_expression=task.cron_expression,
            description=task.description,
            prompt=task.prompt,
            input_command=task.input_command,
            follow_up_command=task.follow_up_command,
            is_agentic=task.is_agentic
        )
        db.add(new_task)
        db.commit()
        db.refresh(new_task)
        
        # Add to running scheduler
        add_job_from_db(new_task)
        
        return {"status": "success", "task_id": new_task.id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/scheduled-tasks/{task_id}")
def update_schedule(task_id: int, task: ScheduleCreate, db: Session = Depends(get_db)):
    from database import ScheduledTask
    from scheduler import add_job_from_db
    
    db_task = db.query(ScheduledTask).filter(ScheduledTask.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    try:
        db_task.name = task.name
        db_task.cron_expression = task.cron_expression
        db_task.description = task.description
        db_task.prompt = task.prompt
        db_task.input_command = task.input_command
        db_task.follow_up_command = task.follow_up_command
        db_task.is_agentic = task.is_agentic
        
        db.commit()
        db.refresh(db_task)
        
        # Update running scheduler (add_job replaces existing by ID)
        add_job_from_db(db_task)
        
        return {"status": "success", "message": "Task updated"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/scheduled-tasks/{task_id}")

@app.delete("/scheduled-tasks/{task_id}")
def delete_schedule(task_id: int, db: Session = Depends(get_db)):
    from database import ScheduledTask
    from scheduler import remove_job_from_scheduler
    
    task = db.query(ScheduledTask).filter(ScheduledTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    try:
        # Remove from scheduler
        remove_job_from_scheduler(task_id)
        
        # Remove from DB
        db.delete(task)
        db.commit()
        return {"status": "success", "message": "Task removed"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/run-task")
def run_task(request: RunTaskRequest, db: Session = Depends(get_db)):
    from database import ScheduledTask
    task = db.query(ScheduledTask).filter(ScheduledTask.name == request.name).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    try:
        # Execute the task's prompt via the Agent
        response = agent.chat(f"Execute scheduled task: {task.name}. Instructions: {task.prompt}")
        
        # Log the run
        new_log = TaskLog(
            command=f"RUN_TASK: {task.name}",
            status="SUCCESS",
            output=response,
            summary="Manual Run"
        )
        db.add(new_log)
        db.commit()
        
        return {"status": "success", "output": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# -- Host Management Endpoints --

@app.get("/hosts")
def get_hosts(db: Session = Depends(get_db)):
    from database import Host
    return db.query(Host).all()

@app.post("/hosts")
def create_host(host: HostCreate, db: Session = Depends(get_db)):
    from database import Host
    try:
        new_host = Host(
            hostname=host.hostname,
            ip_address=host.ip_address,
            description=host.description,
            status=host.status
        )
        db.add(new_host)
        db.commit()
        db.refresh(new_host)
        return new_host
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/hosts/{host_id}")
def update_host(host_id: int, host: HostCreate, db: Session = Depends(get_db)):
    from database import Host
    db_host = db.query(Host).filter(Host.id == host_id).first()
    if not db_host:
        raise HTTPException(status_code=404, detail="Host not found")
    
    db_host.hostname = host.hostname
    db_host.ip_address = host.ip_address
    db_host.description = host.description
    db_host.status = host.status
    
    db.commit()
    return db_host

@app.delete("/hosts/{host_id}")
def delete_host(host_id: int, db: Session = Depends(get_db)):
    from database import Host
    db_host = db.query(Host).filter(Host.id == host_id).first()
    if not db_host:
        raise HTTPException(status_code=404, detail="Host not found")
    
    db.delete(db_host)
    db.commit()
    return {"status": "success"}

@app.post("/hosts/upload")
def upload_hosts(file: dict, db: Session = Depends(get_db)):
    # Note: In a real FastAPI app, use UploadFile. Simple JSON for now or text parsing manually.
    # The user asked for "upload a host file". Let's assume sending text content for simplicity,
    # or I will modify this to accept a FileUpload if I can.
    # But `BaseModel` approach is clearer for now given the agent status.
    # Let's try standard file upload signature.
    pass 

from fastapi import UploadFile, File

@app.post("/hosts/upload-file")
async def upload_hosts_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    from database import Host
    content = await file.read()
    text = content.decode("utf-8")
    
    added_count = 0
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        
        # Simple hosts parsing: IP HOSTNAME [ALIASES]
        parts = line.split()
        if len(parts) >= 2:
            ip = parts[0]
            hostname = parts[1]
            
            # Check if exists
            exists = db.query(Host).filter(Host.hostname == hostname).first()
            if not exists:
                new_host = Host(hostname=hostname, ip_address=ip, status="UNKNOWN")
                db.add(new_host)
                added_count += 1
    
    db.commit()
    db.commit()
    return {"status": "success", "added": added_count}

@app.post("/hosts/ping-all")
def ping_all_hosts(db: Session = Depends(get_db)):
    from database import Host
    import subprocess
    import platform
    
    hosts = db.query(Host).all()
    results = []
    
    # Determine ping command flag for timeout
    # Linux/Mac uses -W (seconds), Windows uses -w (milliseconds)
    param = '-n' if platform.system().lower()=='windows' else '-c'
    timeout_param = '-w' if platform.system().lower()=='windows' else '-W'
    timeout_val = '1000' if platform.system().lower()=='windows' else '1'
    
    for host in hosts:
        if not host.ip_address:
            continue
            
        command = ['ping', param, '1', timeout_param, timeout_val, host.ip_address]
        
        try:
            # We don't want to use the global tracker for this internal utility
            # Just run it quickly
            code = subprocess.call(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            new_status = "ONLINE" if code == 0 else "OFFLINE"
        except:
            new_status = "OFFLINE"
            
        if host.status != new_status:
            host.status = new_status
            host.last_seen = datetime.utcnow()
            
        results.append({"hostname": host.hostname, "ip": host.ip_address, "status": new_status})
    
    db.commit()
    return {"status": "success", "results": results}

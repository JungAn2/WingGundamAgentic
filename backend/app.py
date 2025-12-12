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
    allow_origins=["http://localhost:3000"],
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

@app.post("/execute-command")
def execute_command(request: CommandRequest):
    import subprocess
    try:
        # Security Warning: In a real production system, arbitrary command execution is dangerous.
        # This is a demo agentic system running with user permission.
        result = subprocess.run(request.command, shell=True, capture_output=True, text=True)
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ScheduleCreate(BaseModel):
    name: str
    cron_expression: str
    description: str
    prompt: Optional[str] = None
    input_command: Optional[str] = None
    follow_up_command: Optional[str] = None
    is_agentic: bool = False

class RunTaskRequest(BaseModel):
    name: str

class TaskValidationRequest(BaseModel):
    name: str
    cron_expression: str
    description: str
    prompt: Optional[str] = None
    input_command: Optional[str] = None
    follow_up_command: Optional[str] = None

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

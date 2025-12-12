from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from database import SessionLocal, TaskLog, Issue
from datetime import datetime
import random

scheduler = BackgroundScheduler()

def execute_scheduled_task(task_id, task_name, task_prompt, input_cmd=None, follow_up_cmd=None):
    # This function is called by the scheduler when the cron trigger fires
    from agent import agent
    import subprocess
    
    print(f"Executing Scheduled Task: {task_name}")
    
    execution_log = []
    
    try:
        # Step 1: Input Command
        context = ""
        if input_cmd:
            print(f"Running Input Command: {input_cmd}")
            proc = subprocess.run(input_cmd, shell=True, capture_output=True, text=True)
            output = proc.stdout + proc.stderr
            execution_log.append(f"INPUT_CMD: {input_cmd}\nOUTPUT: {output}")
            context = f"\n\nContext from Input Command:\n{output}"

        # Step 2: Agent Execution
        full_prompt = f"SYSTEM AUTO-RUN: Execute scheduled task '{task_name}'. Instructions: {task_prompt}{context}"
        response = agent.chat(full_prompt)
        execution_log.append(f"AGENT_RESPONSE: {response}")
        
        status = "SUCCESS"
        if "ERROR" in response.upper() or "FAIL" in response.upper():
            status = "FAILED"
            
        # Step 3: Follow-Up Command
        if follow_up_cmd:
            print(f"Running Follow-Up Command: {follow_up_cmd}")
            proc = subprocess.run(follow_up_cmd, shell=True, capture_output=True, text=True)
            output = proc.stdout + proc.stderr
            execution_log.append(f"FOLLOW_UP_CMD: {follow_up_cmd}\nOUTPUT: {output}")

        log_task_execution(task_name, status, "\n---\n".join(execution_log))
        
        # Update last_run time
        db = SessionLocal()
        try:
            from database import ScheduledTask
            task = db.query(ScheduledTask).filter(ScheduledTask.id == task_id).first()
            if task:
                task.last_run = datetime.utcnow()
                db.commit()
        finally:
            db.close()
            
    except Exception as e:
        log_task_execution(task_name, "ERROR", str(e))

def log_task_execution(task_name, status, output):
    db = SessionLocal()
    try:
        log = TaskLog(
            command=task_name,
            status=status,
            output=output,
            timestamp=datetime.utcnow()
        )
        db.add(log)
        
        # Auto-create Issue if task failed
        if status == "FAILED" or "ERROR" in output.upper():
            issue = Issue(
                title=f"Task Failure: {task_name}",
                description=f"Automated system task failed.\nOutput: {output}",
                status="OPEN",
                timestamp=datetime.utcnow()
            )
            db.add(issue)
            
        db.commit()
    finally:
        db.close()

def add_job_from_db(task):
    # task is a ScheduledTask model instance
    if not task.is_active:
        return

    try:
        scheduler.add_job(
            execute_scheduled_task, 
            CronTrigger.from_crontab(task.cron_expression), 
            args=[task.id, task.name, task.prompt, task.input_command, task.follow_up_command],
            id=str(task.id),
            replace_existing=True
        )
        print(f"Scheduled job added: {task.name} ({task.cron_expression})")
    except Exception as e:
        print(f"Failed to schedule {task.name}: {e}")

def remove_job_from_scheduler(task_id):
    try:
        scheduler.remove_job(str(task_id))
        print(f"Scheduled job removed: {task_id}")
    except Exception as e:
        print(f"Failed to remove job {task_id}: {e}")

def start_scheduler():
    db = SessionLocal()
    try:
        from database import ScheduledTask
        tasks = db.query(ScheduledTask).all()
        for task in tasks:
            add_job_from_db(task)
    finally:
        db.close()
        
    scheduler.start()

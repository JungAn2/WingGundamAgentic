from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./wing_gundam.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class ScheduledTask(Base):
    __tablename__ = "scheduled_tasks"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    cron_expression = Column(String)
    description = Column(Text)
    prompt = Column(Text)
    input_command = Column(String, nullable=True)
    follow_up_command = Column(String, nullable=True)
    is_agentic = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    last_run = Column(DateTime, nullable=True)

class TaskLog(Base):
    __tablename__ = "task_logs"
    id = Column(Integer, primary_key=True, index=True)
    command = Column(String, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    status = Column(String) # SUCCESS, FAILED, PENDING
    output = Column(Text)
    summary = Column(Text)

class Issue(Base):
    __tablename__ = "issues"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(Text)
    status = Column(String, default="OPEN") # OPEN, RESOLVED
    timestamp = Column(DateTime, default=datetime.utcnow)

class Host(Base):
    __tablename__ = "hosts"
    id = Column(Integer, primary_key=True, index=True)
    hostname = Column(String, unique=True, index=True)
    ip_address = Column(String, nullable=True)
    status = Column(String, default="UNKNOWN") # ONLINE, OFFLINE, UNKNOWN
    last_seen = Column(DateTime, default=datetime.utcnow)
    description = Column(Text, nullable=True)

class SystemSetting(Base):
    __tablename__ = "system_settings"
    key = Column(String, primary_key=True, index=True)
    value = Column(String)
    updated_at = Column(DateTime, default=datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)

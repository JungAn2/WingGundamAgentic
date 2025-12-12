from dotenv import load_dotenv
load_dotenv()

from openai import OpenAI
import os
from rag import rag_system

class WingAgent:
    def __init__(self):
        self.history = []
        self.load_config()

    def load_config(self):
        # Load from DB or default
        try:
            from database import SessionLocal, SystemSetting
            db = SessionLocal()
            provider_setting = db.query(SystemSetting).filter(SystemSetting.key == "llm_provider").first()
            model_setting = db.query(SystemSetting).filter(SystemSetting.key == "llm_model").first()
            
            provider = provider_setting.value if provider_setting else "deepseek"
            model = model_setting.value if model_setting else "deepseek-chat"
            db.close()
        except Exception as e:
            print(f"Config Load Error: {e}, defaulting to deepseek")
            provider = "deepseek"
            model = "deepseek-chat"

        self.provider = provider
        self.model = model
        
        if provider == "ollama":
            self.client = OpenAI(
                api_key="ollama", # Dummy key
                base_url="http://localhost:11434/v1"
            )
        else:
            self.client = OpenAI(
                api_key=os.getenv("DEEPSEEK_API_KEY"),
                base_url="https://api.deepseek.com/v1"
            )
        
        print(f"Agent Configured: [{provider.upper()}] Model: {model}")

    def update_config(self, provider, model):
        # Save to DB
        from database import SessionLocal, SystemSetting
        db = SessionLocal()
        
        # Helper to upsert
        def upsert(key, val):
            setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
            if not setting:
                setting = SystemSetting(key=key, value=val)
                db.add(setting)
            else:
                setting.value = val
        
        upsert("llm_provider", provider)
        upsert("llm_model", model)
        db.commit()
        db.close()
        
        # Reload
        self.load_config()

    def chat(self, user_input):
        # Retrieve context from RAG
        context = ""
        try:

             context_results = rag_system.query(user_input, n_results=3)
             if context_results and context_results.get('documents') and context_results['documents'][0]:
                 context = "\n".join(context_results['documents'][0])
        except Exception as e:
             print(f"RAG Retrieval warning: {e}")

        # Inject Database State (Hosts) - Conditional
        known_hosts_str = ""
        host_keywords = ["host", "server", "network", "ip", "machine", "node", "connection", "status", "ping"]
        if any(keyword in user_input.lower() for keyword in host_keywords):
            try:
                from database import SessionLocal, Host
                db = SessionLocal()
                hosts = db.query(Host).all()
                if hosts:
                    host_list = [f"- {h.hostname} ({h.ip_address}) [Status: {h.status}]" for h in hosts]
                    known_hosts_str = "\nKNOWN NETWORK HOSTS (Database):\n" + "\n".join(host_list)
                else:
                    known_hosts_str = "\nKNOWN NETWORK HOSTS (Database):\nNo hosts configured."
                db.close()
            except Exception as e:
                known_hosts_str = f"\nError retrieving hosts: {str(e)}"

        system_prompt = f"""You are the Wing Gundam Zero System (Agentic Mode). 
        You are a highly advanced operating system monitor and assistant.
        Your goal is to ensure system stability and security.
        
        RESPONSE FORMAT:
        You must return your response in strictly parseable JSON format.
        
        Type 1: General Response
        {{
            "type": "response",
            "content": "Your markdown message here"
        }}
        
        Type 2: Command Proposal (Use when user asks to perform an OS/Shell action)
        {{
            "type": "command_proposal",
            "command": "The exact shell command to run",
            "reason": "Why this command is necessary"
        }}
        
        Type 3: Server Action (Use for internal system operations)
        {{
            "type": "server_action",
            "action": "create_schedule" | "remove_schedule" | "run_task" | "resolve_issue" | "ping_hosts",
            "data": {{
                // For create_schedule:
                "name": "Task Name",
                "cron_expression": "CRON string",
                "description": "Short desc",
                "prompt": "Instructions for the agent when runs"
                
                // For remove_schedule:
                "task_id": 123
                
                // For run_task:
                "name": "Task Name"
                
                // For resolve_issue:
                "issue_id": 123
            }},
            "reason": "Why this action is taken"
        }}

        Context from knowledge base:
        {context}

        {known_hosts_str}
        """

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_input}
        ]

        # Adjust parameters for small local models that dislike json_object enforcement or strict schemas
        start_time = datetime.datetime.now()
        
        try:
            # Only use json_object for DeepSeek/OpenAI compatible advanced mode
            if self.provider == 'ollama':
                 response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=0.7 
                    # Local models often fail with response_format={"type": "json_object"}
                )
            else:
                 response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    response_format={"type": "json_object"}
                )
            
            content = response.choices[0].message.content
            
            # Sanitization if local model outputs markdown blocks
            if "```json" in content:
                import re
                match = re.search(r'```json\s*(\{.*?\})\s*```', content, re.DOTALL)
                if match:
                    content = match.group(1)
            elif "```" in content:
                 content = content.replace("```", "").strip()
                 
        except Exception as e:
            # Fallback
            import json
            content = json.dumps({
                "type": "response", 
                "content": f"System Error communicating with Agent Core: {str(e)}"
            })
        
        # Short-Term Memory Append (Assistant) - DISABLED to save tokens
        # self.history.append({"role": "assistant", "content": content})

        # Basic security check on raw content if needed, though structure is now JSON
        if "UNSAFE" in content.upper() or "SECURITY ALERT" in content.upper():
            from notifications import send_alert_email
            # We might want to parse it first, but for safety, alert on raw text
            send_alert_email("Security Flag Detected", f"The system flagged the following activity as potential risk:\n\n{content}")
            
        # Long-Term Memory (RAG Ingestion)
        # We store the user input and the agent's response
        import datetime
        timestamp = datetime.datetime.now().isoformat()
        try:
            rag_system.add_document(
                doc_id=f"chat_{timestamp}",
                text=f"User: {user_input}\nAssistant: {content}",
                metadata={"type": "chat_log", "timestamp": timestamp}
            )
        except Exception as e:
            print(f"RAG Ingestion Failed: {e}")

        return content

agent = WingAgent()

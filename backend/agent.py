from openai import OpenAI
import os
from rag import rag_system
from dotenv import load_dotenv

load_dotenv()

class WingAgent:
    def __init__(self):
        self.client = OpenAI(
            api_key=os.getenv("DEEPSEEK_API_KEY"),
            base_url="https://api.deepseek.com/v1"
        )
        self.model = "deepseek-chat"
        self.history = []

    def chat(self, user_input):
        # Retrieve context from RAG
        if context_results['documents']:
             context = "\n".join(context_results['documents'][0])

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
            "action": "create_schedule" | "remove_schedule" | "run_task" | "resolve_issue",
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
        """

        # Short-Term Memory Append
        self.history.append({"role": "user", "content": user_input})
        
        # Keep last 10 turns (20 messages)
        if len(self.history) > 20:
            self.history = self.history[-20:]

        messages = [{"role": "system", "content": system_prompt}] + self.history

        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            response_format={"type": "json_object"}
        )
        content = response.choices[0].message.content
        
        # Short-Term Memory Append (Assistant)
        self.history.append({"role": "assistant", "content": content})

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

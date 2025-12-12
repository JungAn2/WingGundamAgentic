import smtplib
from email.mime.text import MIMEText
import os

def send_alert_email(subject, body):
    sender = os.getenv("EMAIL_USER")
    password = os.getenv("EMAIL_PASS")
    receiver = os.getenv("EMAIL_RECEIVER", sender)
    host = os.getenv("EMAIL_HOST", "smtp.gmail.com")
    port = int(os.getenv("EMAIL_PORT", 587))

    if not sender or not password:
        print("Email configuration missing, skipping alert.")
        return

    msg = MIMEText(body)
    msg["Subject"] = f"[WING GUNDAM ALERT] {subject}"
    msg["From"] = sender
    msg["To"] = receiver

    try:
        with smtplib.SMTP(host, port) as server:
            server.starttls()
            server.login(sender, password)
            server.send_message(msg)
        print("Alert email sent successfully.")
    except Exception as e:
        print(f"Failed to send email: {e}")

import json
import logging
import os
import smtplib
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any, Dict, List, Optional

from config import get_settings

logger = logging.getLogger(__name__)


class EmailService:
    @staticmethod
    def _create_html_template(
        conversation_title: str,
        recipient_email: str,
        summary_points: List[str],
        action_items: List[str],
        files_created: List[str],
        custom_notes: Optional[str] = None,
        transcript_preview: Optional[str] = None,
    ) -> str:
        date_str = datetime.now(timezone.utc).strftime("%B %d, %Y at %H:%M UTC")

        summary_li = "".join(f"<li style='margin-bottom: 8px;'>{pt}</li>" for pt in summary_points)
        actions_li = (
            "".join(f"<li style='margin-bottom: 8px;'>{act}</li>" for act in action_items)
            if action_items
            else "<li>No outstanding action items detected.</li>"
        )
        files_html = (
            "".join(
                f"<div style='background: #1e1e1e; padding: 8px 12px; border-radius: 6px; margin-bottom: 6px; border: 1px solid #333; font-family: monospace; font-size: 13px; color: #93c5fd;'>📄 {f}</div>"
                for f in files_created
            )
            if files_created
            else "<div style='color: #888; font-size: 13px;'>No generated files attached to this session.</div>"
        )

        notes_section = ""
        if custom_notes:
            notes_section = f"""
            <div style="background: #232018; border-left: 4px solid #eab308; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
                <div style="font-weight: 600; color: #fde047; margin-bottom: 4px; font-size: 13px;">Author Notes:</div>
                <div style="color: #fef08a; font-size: 14px; line-height: 1.5;">{custom_notes}</div>
            </div>
            """

        transcript_section = ""
        if transcript_preview:
            transcript_section = f"""
            <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #333;">
                <h3 style="color: #e5e5e5; font-size: 15px; margin-bottom: 10px;">Discussion Excerpt</h3>
                <div style="background: #141414; padding: 14px; border-radius: 8px; font-family: Georgia, serif; font-size: 13px; line-height: 1.6; color: #a3a3a3; white-space: pre-wrap; border: 1px solid #262626; max-height: 350px; overflow-y: auto;">{transcript_preview}</div>
            </div>
            """

        return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Conversation Summary: {conversation_title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f0f11; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e5e5e5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0f0f11; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 100%; background-color: #17171a; border-radius: 12px; border: 1px solid #2a2a30; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding: 24px 30px; background: linear-gradient(135deg, #1f1f26 0%, #17171a 100%); border-bottom: 1px solid #2a2a30;">
              <table width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <div style="display: inline-block; font-size: 18px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">
                      ✦ UNIFIED AI ASSISTANT
                    </div>
                  </td>
                  <td align="right">
                    <span style="font-size: 12px; color: #888899;">Executive Follow-up</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 30px;">
              <h1 style="margin: 0 0 10px 0; font-size: 22px; font-weight: 700; color: #ffffff; line-height: 1.3;">
                {conversation_title}
              </h1>
              <div style="font-size: 13px; color: #888899; margin-bottom: 24px;">
                Generated on {date_str} for <strong style="color: #cbd5e1;">{recipient_email}</strong>
              </div>

              {notes_section}

              <!-- Key Takeaways -->
              <div style="margin-bottom: 24px;">
                <h3 style="color: #60a5fa; font-size: 15px; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                  Key Discussion & Findings
                </h3>
                <ul style="margin: 0; padding-left: 20px; color: #d4d4d8; font-size: 14px; line-height: 1.6;">
                  {summary_li}
                </ul>
              </div>

              <!-- Action Items -->
              <div style="margin-bottom: 24px;">
                <h3 style="color: #34d399; font-size: 15px; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                  Action Items & Recommendations
                </h3>
                <ul style="margin: 0; padding-left: 20px; color: #d4d4d8; font-size: 14px; line-height: 1.6;">
                  {actions_li}
                </ul>
              </div>

              <!-- Shared / Created Files -->
              <div style="margin-bottom: 24px;">
                <h3 style="color: #a78bfa; font-size: 15px; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                  Generated Files & Artifacts
                </h3>
                {files_html}
              </div>

              {transcript_section}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; background-color: #121214; border-top: 1px solid #26262a; font-size: 12px; color: #71717a; text-align: center;">
              This recap was generated by Unified AI Assistant. Reply to this email or resume your chat directly in the web app.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        """

    @classmethod
    async def send_followup_email(
        cls,
        recipient_email: str,
        conversation_title: str,
        messages: List[Dict[str, Any]],
        subject: Optional[str] = None,
        custom_notes: Optional[str] = None,
        include_transcript: bool = True,
    ) -> Dict[str, Any]:
        """Synthesizes conversation highlights and dispatches a follow-up email."""
        if not recipient_email or "@" not in recipient_email:
            raise ValueError("A valid recipient email address is required.")

        email_subject = subject or f"Follow-up: {conversation_title} — Unified AI"

        # Extract summary points and artifacts from messages
        summary_points: List[str] = []
        action_items: List[str] = []
        files_created: List[str] = []
        transcript_lines: List[str] = []

        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "").strip()
            if not content:
                continue

            # Check for files
            import re
            files = re.findall(r"\b([a-zA-Z0-9_\-\.]+\.(?:md|pdf|docx|csv|xlsx|py|json|html))\b", content)
            for f in files:
                if f not in files_created and not f.startswith("http"):
                    files_created.append(f)

            if role == "user":
                transcript_lines.append(f"User: {content}")
                if len(summary_points) < 4:
                    summary_points.append(f"Inquiry: {content[:140]}...")
            elif role == "assistant":
                clean_snippet = re.sub(r"<!--[\s\S]*?-->", "", content)
                clean_snippet = re.sub(r"```[\s\S]*?```", "[Code block]", clean_snippet).strip()
                transcript_lines.append(f"AI: {clean_snippet}")

                lines = [l.strip() for l in clean_snippet.split("\n") if l.strip()]
                for l in lines:
                    if l.startswith("- ") or l.startswith("* "):
                        if len(action_items) < 4:
                            action_items.append(l[2:].strip())

        if not summary_points:
            summary_points = [
                f"Completed interactive session discussing '{conversation_title}'.",
                "Processed model reasoning, analysis, and generation queries.",
            ]
        if not action_items:
            action_items = [
                "Review findings and exported files.",
                "Continue follow-up queries in Unified AI Assistant workspace.",
            ]

        transcript_preview = "\n\n".join(transcript_lines[-8:]) if include_transcript else None

        html_content = cls._create_html_template(
            conversation_title=conversation_title,
            recipient_email=recipient_email,
            summary_points=summary_points,
            action_items=action_items,
            files_created=files_created,
            custom_notes=custom_notes,
            transcript_preview=transcript_preview,
        )

        plain_text = f"Conversation Follow-up: {conversation_title}\n\n"
        plain_text += f"Recipient: {recipient_email}\n"
        if custom_notes:
            plain_text += f"\nAuthor Notes:\n{custom_notes}\n"
        plain_text += "\nKey Findings:\n" + "\n".join(f"- {p}" for p in summary_points) + "\n"
        plain_text += "\nAction Items:\n" + "\n".join(f"- {a}" for a in action_items) + "\n"
        if files_created:
            plain_text += "\nFiles:\n" + "\n".join(f"- {f}" for f in files_created) + "\n"

        # Check SMTP configuration
        smtp_host = os.environ.get("SMTP_HOST")
        smtp_port = int(os.environ.get("SMTP_PORT", "587"))
        smtp_user = os.environ.get("SMTP_USER")
        smtp_password = os.environ.get("SMTP_PASSWORD")
        sender_email = os.environ.get("SMTP_FROM", "assistant@unified-ai.local")

        sent_via_smtp = False
        smtp_error = None

        if smtp_host and smtp_user and smtp_password:
            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = email_subject
                msg["From"] = sender_email
                msg["To"] = recipient_email

                part1 = MIMEText(plain_text, "plain")
                part2 = MIMEText(html_content, "html")
                msg.attach(part1)
                msg.attach(part2)

                server = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
                server.starttls()
                server.login(smtp_user, smtp_password)
                server.sendmail(sender_email, [recipient_email], msg.as_string())
                server.quit()
                sent_via_smtp = True
                logger.info(f"Sent follow-up email to {recipient_email} via SMTP ({smtp_host})")
            except Exception as e:
                smtp_error = str(e)
                logger.error(f"Failed to send email via SMTP: {e}")

        # Always persist outbox record for audit and offline reliability
        outbox_dir = Path("data/sent_emails")
        outbox_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        safe_recip = recipient_email.replace("@", "_at_").replace(".", "_")
        filename_base = f"{timestamp}_{safe_recip}"

        with open(outbox_dir / f"{filename_base}.html", "w", encoding="utf-8") as f:
            f.write(html_content)

        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "recipient_email": recipient_email,
            "subject": email_subject,
            "conversation_title": conversation_title,
            "sent_via_smtp": sent_via_smtp,
            "smtp_error": smtp_error,
            "summary_points": summary_points,
            "files_created": files_created,
            "html_path": str(outbox_dir / f"{filename_base}.html"),
        }
        with open(outbox_dir / f"{filename_base}.json", "w", encoding="utf-8") as f:
            json.dump(record, f, indent=2)

        return {
            "status": "sent",
            "delivered": sent_via_smtp,
            "delivery_mode": "smtp" if sent_via_smtp else "outbox_persisted",
            "recipient": recipient_email,
            "subject": email_subject,
            "summary_points_count": len(summary_points),
            "files_referenced": files_created,
            "html_preview_url": f"/data/sent_emails/{filename_base}.html",
            "message": f"Follow-up email successfully {'dispatched via SMTP' if sent_via_smtp else 'recorded to mail outbox'} for {recipient_email}.",
        }

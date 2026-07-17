import smtplib
import os
import asyncio
from email.message import EmailMessage

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.blueline.mg")
SMTP_PORT = int(os.getenv("SMTP_PORT", "25"))
SMTP_USER = os.getenv("SMTP_USER", "zato@staff.blueline.mg")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "GlpK@-5F")
FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "bpm@si.blueline.mg")
FROM_NAME = os.getenv("SMTP_FROM_NAME", "BPM | Gestion de Prime")
TEST_MODE = os.getenv("TEST_MODE", "true").lower() == "true"
TEST_EMAIL = os.getenv("TEST_EMAIL", "nambinintsoa.rakotoarivelo@staff.blueline.mg")


def _resolve_email(to_email: str) -> str:
    if TEST_MODE:
        print(f"[EMAIL TEST] Redirecting {to_email} → {TEST_EMAIL}")
        return TEST_EMAIL
    return to_email


async def send_reset_email(to_email: str, reset_link: str) -> bool:
    return await asyncio.to_thread(_send_reset_email_sync, to_email, reset_link)


def _send_reset_email_sync(to_email: str, reset_link: str) -> bool:
    try:
        msg = EmailMessage()
        msg["Subject"] = "Réinitialisation de votre mot de passe - BPM Primes"
        msg["From"] = f"{FROM_NAME} <{FROM_EMAIL}>"
        msg["To"] = _resolve_email(to_email)
        msg.set_content(
            f"Bonjour,\n\n"
            f"Vous avez demandé la réinitialisation de votre mot de passe.\n\n"
            f"Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe :\n"
            f"{reset_link}\n\n"
            f"Ce lien est valable 15 minutes.\n\n"
            f"Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.\n\n"
            f"---\n"
            f"BPM | Gestion de Prime"
        )

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)

        return True
    except Exception as e:
        print(f"SMTP error: {e}")
        return False


async def send_bonus_notification_email(to_email: str, to_name: str, sender_name: str,
                                  employee_name: str, changes_summary: str,
                                  bonus_url: str) -> bool:
    return await asyncio.to_thread(_send_bonus_notification_email_sync, to_email, to_name, sender_name,
                                   employee_name, changes_summary, bonus_url)


def _send_bonus_notification_email_sync(to_email: str, to_name: str, sender_name: str,
                                  employee_name: str, changes_summary: str,
                                  bonus_url: str) -> bool:
    try:
        is_rejet = "rejetée" in changes_summary.lower() or "rejet" in changes_summary.lower()
        is_validation = "validée" in changes_summary.lower()

        if is_rejet:
            subject = f"Prime rejetée — {employee_name} | BPM"
            accent_color = "#dc2626"
            accent_bg = "#fef2f2"
            icon_color = "#dc2626"
            badge_text = "Rejet"
            badge_bg = "#fee2e2"
            badge_color = "#dc2626"
            action_text = f"a rejeté la prime de"
        elif is_validation:
            subject = f"Prime validée — {employee_name} | BPM"
            accent_color = "#16a34a"
            accent_bg = "#f0fdf4"
            icon_color = "#16a34a"
            badge_text = "Validée"
            badge_bg = "#dcfce7"
            badge_color = "#16a34a"
            action_text = f"a validé la prime de"
        else:
            subject = f"Prime modifiée — {employee_name} | BPM"
            accent_color = "#2563eb"
            accent_bg = "#eff6ff"
            icon_color = "#2563eb"
            badge_text = "Modifiée"
            badge_bg = "#dbeafe"
            badge_color = "#2563eb"
            action_text = f"a modifié la prime de"

        icon_path = (
            '<circle cx="12" cy="12" r="10" stroke="{ic}" stroke-width="1.5" fill="none"/>'
            '<path d="M8 12l3 3 5-5" stroke="{ic}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
        ).format(ic=icon_color) if is_validation else (
            '<circle cx="12" cy="12" r="10" stroke="{ic}" stroke-width="1.5" fill="none"/>'
            '<path d="M15 9l-6 6M9 9l6 6" stroke="{ic}" stroke-width="1.5" fill="none" stroke-linecap="round"/>'
        ).format(ic=icon_color) if is_rejet else (
            '<circle cx="12" cy="12" r="10" stroke="{ic}" stroke-width="1.5" fill="none"/>'
            '<path d="M8 16l3.5-5L14 14l3.5-5" stroke="{ic}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
        ).format(ic=icon_color)

        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = f"{FROM_NAME} <{FROM_EMAIL}>"
        msg["To"] = f"{to_name} <{_resolve_email(to_email)}>"
        msg.set_content(
            f"Bonjour {to_name},\n\n"
            f"{sender_name} {action_text} {employee_name}.\n\n"
            f"{changes_summary}\n\n"
            f"Consultez la prime ici :\n{bonus_url}\n\n"
            f"---\nBPM | Gestion de Prime"
        )
        msg.add_alternative(
            f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1e40af,#2563eb);padding:28px 32px;border-radius:16px 16px 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <div style="font-size:13px;color:rgba(255,255,255,0.7);letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">BPM</div>
              <div style="font-size:20px;color:#fff;font-weight:700;margin-top:2px;">Gestion de Prime</div>
            </td>
            <td align="right" style="vertical-align:top;">
              <div style="background:rgba(255,255,255,0.15);border-radius:10px;padding:8px 14px;display:inline-block;">
                <span style="font-size:12px;font-weight:600;color:{badge_color};background:{badge_bg};padding:4px 12px;border-radius:20px;">{badge_text}</span>
              </div>
            </td>
          </tr></table>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">

          <!-- Greeting -->
          <p style="margin:0 0 20px;font-size:15px;color:#334155;">Bonjour <strong style="color:#0f172a;">{to_name}</strong>,</p>

          <!-- Action card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background:{accent_bg};border-radius:12px;padding:20px 24px;border-left:4px solid {accent_color};">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="vertical-align:top;padding-right:14px;">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;">
                    {icon_path}
                  </svg>
                </td>
                <td style="vertical-align:top;">
                  <p style="margin:0;font-size:14px;color:#475569;">
                    <strong style="color:#0f172a;">{sender_name}</strong> {action_text}
                  </p>
                  <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#0f172a;">{employee_name}</p>
                </td>
              </tr></table>
            </td></tr>
          </table>

          <!-- Changes detail -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background:#f8fafc;border-radius:10px;padding:16px 20px;">
              <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">Détails</p>
              <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">{changes_summary}</p>
            </td></tr>
          </table>

          <!-- CTA button -->
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 24px;">
            <a href="{bonus_url}" style="display:inline-block;background:{accent_color};color:#fff;padding:12px 32px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.3px;">
              Voir la prime &rarr;
            </a>
          </td></tr></table>

          <!-- Divider -->
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 20px;">

          <!-- Footer -->
          <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
            Ceci est un email automatique envoyé par le système BPM | Gestion de Prime.<br>
            Si vous pensez avoir reçu cet email par erreur, vous pouvez l'ignorer.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>""",
            subtype="html",
        )

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)

        return True
    except Exception as e:
        print(f"SMTP error (bonus notification): {e}")
        return False

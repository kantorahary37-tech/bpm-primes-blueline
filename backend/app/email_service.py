import smtplib
import asyncio
from datetime import date
from email.message import EmailMessage
from app.config import get_config


def _smtp_config():
    return {
        "host": get_config("SMTP_HOST"),
        "port": int(get_config("SMTP_PORT") or "25"),
        "user": get_config("SMTP_USER"),
        "password": get_config("SMTP_PASSWORD"),
        "from_email": get_config("SMTP_FROM_EMAIL"),
        "from_name": get_config("SMTP_FROM_NAME"),
        "test_mode": get_config("TEST_MODE").lower() == "true",
        "test_email": get_config("TEST_EMAIL"),
        "user_mail_test_mode": get_config("USER_MAIL_TEST_MODE").lower() == "true",
    }


def _resolve_email(to_email: str) -> str:
    """Résout l'adresse de destination.

    TEST_MODE actif :
      - USER_MAIL_TEST_MODE=FASLE → redirection vers TEST_EMAIL (mode test pur)
      - USER_MAIL_TEST_MODE=TRUE  → envoi au destinataire réel (contenu test
        préservé : bandeau, badge, préfixe [TEST]) + copie aux adresses
        TEST_EMAIL
    """
    cfg = _smtp_config()
    if not cfg["test_mode"]:
        return to_email

    if cfg["user_mail_test_mode"]:
        print(f"[EMAIL TEST] Mail test vers l'adresse réelle {to_email} (USER_MAIL_TEST_MODE)")
        return to_email

    print(f"[EMAIL TEST] Redirecting {to_email} -> {cfg['test_email']}")
    return cfg["test_email"]


def _env_label(cfg: dict) -> str:
    return "Mode Test" if cfg["test_mode"] else "Production"


def _test_banner_html(cfg: dict) -> str:
    if not cfg["test_mode"]:
        return ""
    return (
        '<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">'
        '<tr><td style="background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;padding:14px 18px;">'
        '<p style="margin:0;font-size:13px;color:#92400e;line-height:1.5;">'
        '<strong>[MODE TEST]</strong> Cet email est envoyé depuis un environnement de test. '
        'Les données affichées ne reflètent pas la production.</p>'
        '</td></tr></table>'
    )


def _test_footer_html(cfg: dict) -> str:
    if not cfg["test_mode"]:
        return (
            '<p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">'
            'Ceci est un email automatique envoyé par le système BPM | Gestion de Prime.<br>'
            'Si vous pensez avoir reçu cet email par erreur, vous pouvez l\'ignorer.</p>'
        )
    return (
        '<p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">'
        'Ceci est un email automatique envoyé par le système BPM | Gestion de Prime.<br>'
        '<strong style="color:#d97706;">Environnement : Test</strong><br>'
        'Si vous pensez avoir reçu cet email par erreur, vous pouvez l\'ignorer.</p>'
    )


def _test_subject_prefix(cfg: dict) -> str:
    return "[TEST] " if cfg["test_mode"] else ""


async def send_reset_email(to_email: str, reset_link: str) -> bool:
    return await asyncio.to_thread(_send_reset_email_sync, to_email, reset_link)


def _send_reset_email_sync(to_email: str, reset_link: str) -> bool:
    try:
        cfg = _smtp_config()
        env_label = _env_label(cfg)
        prefix = _test_subject_prefix(cfg)
        msg = EmailMessage()
        msg["Subject"] = f"{prefix}Réinitialisation de votre mot de passe - BPM Primes"
        msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
        msg["To"] = _resolve_email(to_email)

        plain_env = f"\n[{env_label}]\n" if cfg["test_mode"] else ""
        msg.set_content(
            f"{plain_env}"
            f"Bonjour,\n\n"
            f"Vous avez demandé la réinitialisation de votre mot de passe.\n\n"
            f"Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe :\n"
            f"{reset_link}\n\n"
            f"Ce lien est valable 15 minutes.\n\n"
            f"Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.\n\n"
            f"---\n"
            f"BPM | Gestion de Prime"
        )

        banner = _test_banner_html(cfg)
        footer = _test_footer_html(cfg)
        env_badge = (
            f'<span style="font-size:11px;font-weight:600;color:#d97706;background:#fef3c7;'
            f'padding:3px 10px;border-radius:12px;">{env_label}</span>'
            if cfg["test_mode"] else ""
        )
        msg.add_alternative(
            f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:linear-gradient(135deg,#1e40af,#2563eb);padding:24px 32px;border-radius:16px 16px 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <div style="font-size:12px;color:rgba(255,255,255,0.7);letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">BPM</div>
              <div style="font-size:20px;color:#fff;font-weight:700;margin-top:2px;">Gestion de Prime</div>
            </td>
            <td align="right">{env_badge}</td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">
          {banner}
          <p style="margin:0 0 20px;font-size:15px;color:#334155;">Bonjour,</p>
          <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.7;">
            Vous avez demandé la réinitialisation de votre mot de passe.<br>
            Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe :
          </p>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 24px;">
            <a href="{reset_link}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 32px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">
              Réinitialiser mon mot de passe &rarr;
            </a>
          </td></tr></table>
          <p style="margin:0 0 20px;font-size:13px;color:#94a3b8;">Ce lien est valable 15 minutes.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 20px;">
          {footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>""",
            subtype="html",
        )

        with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
            server.starttls()
            server.login(cfg["user"], cfg["password"])
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
        cfg = _smtp_config()
        env_label = _env_label(cfg)
        prefix = _test_subject_prefix(cfg)
        is_rejet = "rejetée" in changes_summary.lower() or "rejet" in changes_summary.lower()
        is_validation = "validée" in changes_summary.lower()

        if is_rejet:
            subject = f"{prefix}Prime rejetée — {employee_name} | BPM"
            accent_color = "#dc2626"
            accent_bg = "#fef2f2"
            icon_color = "#dc2626"
            badge_text = "Rejet"
            badge_bg = "#fee2e2"
            badge_color = "#dc2626"
            action_text = f"a rejeté la prime de"
        elif is_validation:
            subject = f"{prefix}Prime validée — {employee_name} | BPM"
            accent_color = "#16a34a"
            accent_bg = "#f0fdf4"
            icon_color = "#16a34a"
            badge_text = "Validée"
            badge_bg = "#dcfce7"
            badge_color = "#16a34a"
            action_text = f"a validé la prime de"
        else:
            subject = f"{prefix}Prime modifiée — {employee_name} | BPM"
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
        msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
        msg["To"] = _resolve_email(to_email)
        plain_env = "[" + env_label + "]\n" if cfg["test_mode"] else ""
        msg.set_content(
            f"{plain_env}"
            f"Bonjour {to_name},\n\n"
            f"{sender_name} {action_text} {employee_name}.\n\n"
            f"{changes_summary}\n\n"
            f"Consultez la prime ici :\n{bonus_url}\n\n"
            f"---\nBPM | Gestion de Prime"
        )

        banner = _test_banner_html(cfg)
        footer = _test_footer_html(cfg)
        env_badge = (
            f'<span style="font-size:11px;font-weight:600;color:#d97706;background:#fef3c7;'
            f'padding:3px 10px;border-radius:12px;">{env_label}</span>'
            if cfg["test_mode"] else ""
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
                {' ' + env_badge if env_badge else ''}
              </div>
            </td>
          </tr></table>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">

          {banner}

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
          {footer}
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>""",
            subtype="html",
        )

        with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
            server.starttls()
            server.login(cfg["user"], cfg["password"])
            server.send_message(msg)

        return True
    except Exception as e:
        print(f"SMTP error (bonus notification): {e}")
        return False


async def send_bonus_batch_notification_email(
    to_email: str,
    to_name: str,
    sender_name: str,
    step_label: str,
    items: list,
) -> bool:
    """
    Notification groupée : plusieurs primes validées regroupées dans un seul email
    (au lieu d'un email par prime lors d'une validation par lot).
    items : liste de dicts {employee_name, type_label, amount, url}
    """
    return await asyncio.to_thread(
        _send_bonus_batch_notification_email_sync,
        to_email, to_name, sender_name, step_label, items,
    )


def _send_bonus_batch_notification_email_sync(
    to_email: str,
    to_name: str,
    sender_name: str,
    step_label: str,
    items: list,
) -> bool:
    try:
        cfg = _smtp_config()
        env_label = _env_label(cfg)
        prefix = _test_subject_prefix(cfg)
        count = len(items)
        plural = "s" if count > 1 else ""
        msg = EmailMessage()
        msg["Subject"] = f"{prefix}{count} prime{plural} validée{plural} par {sender_name} (étape {step_label}) | BPM"
        msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
        msg["To"] = _resolve_email(to_email)

        plain_env = f"[{env_label}]\n\n" if cfg["test_mode"] else ""
        items_text = "\n".join(
            f"- {it['employee_name']} - {it['type_label']} - {it['amount']} : {it['url']}"
            for it in items
        )
        msg.set_content(
            f"{plain_env}"
            f"Bonjour {to_name},\n\n"
            f"{sender_name} a validé {count} prime{plural} au niveau {step_label}.\n\n"
            f"{items_text}\n\n"
            f"Consultez les primes via le lien BPM.\n\n"
            f"---\nBPM | Gestion de Prime"
        )

        links = "".join(
            f"<li style=\"margin:8px 0;\">"
            f"<a href=\"{it['url']}\" style=\"color:#2563eb;font-weight:600;text-decoration:none;\">{it['employee_name']}</a>"
            f" <span style=\"color:#64748b;\">&mdash; {it['type_label']} &middot; {it['amount']}</span>"
            f"</li>"
            for it in items
        )

        banner = _test_banner_html(cfg)
        footer = _test_footer_html(cfg)
        env_badge = (
            f'<span style="font-size:11px;font-weight:600;color:#d97706;background:#fef3c7;'
            f'padding:3px 10px;border-radius:12px;">{env_label}</span>'
            if cfg["test_mode"] else ""
        )
        msg.add_alternative(f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:linear-gradient(135deg,#1e40af,#2563eb);padding:24px 32px;border-radius:16px 16px 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <div style="font-size:12px;color:rgba(255,255,255,0.7);letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">BPM</div>
              <div style="font-size:20px;color:#fff;font-weight:700;margin-top:2px;">Gestion de Prime</div>
            </td>
            <td align="right">{env_badge}</td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">
          {banner}
          <p style="margin:0 0 16px;font-size:15px;color:#334155;">Bonjour <strong style="color:#0f172a;">{to_name}</strong>,</p>
          <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.7;">
            <strong style="color:#0f172a;">{sender_name}</strong> a validé
            <strong style="color:#0f172a;">{count} prime{plural}</strong> au niveau
            <strong style="color:#0f172a;">{step_label}</strong>.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            <tr><td style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:10px;padding:14px 20px;">
              <span style="font-size:22px;font-weight:700;color:#15803d;">{count}</span>
              <span style="font-size:13px;color:#334155;"> prime{plural} validée{plural}</span>
            </td></tr>
          </table>
          <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#475569;line-height:1.6;">
            {links}
          </ul>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 20px;">
          {footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>""", subtype="html")

        with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
            server.starttls()
            server.login(cfg["user"], cfg["password"])
            server.send_message(msg)

        return True
    except Exception as e:
        print(f"SMTP error (batch notification): {e}")
        return False


async def send_validation_reminder_email(to_email: str, to_name: str, items: list) -> bool:
    """
    Rappel quotidien : liste des primes en attente de validation pour un acteur.
    items : liste de dicts {employee_name, type_label, amount, status_label, url}
    """
    return await asyncio.to_thread(_send_validation_reminder_email_sync, to_email, to_name, items)


def _send_validation_reminder_email_sync(to_email: str, to_name: str, items: list) -> bool:
    try:
        cfg = _smtp_config()
        env_label = _env_label(cfg)
        prefix = _test_subject_prefix(cfg)
        count = len(items)
        plural = "s" if count > 1 else ""
        msg = EmailMessage()
        msg["Subject"] = f"{prefix}Rappel : {count} prime{plural} en attente de votre validation | BPM"
        msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
        msg["To"] = _resolve_email(to_email)

        plain_env = f"[{env_label}]\n\n" if cfg["test_mode"] else ""
        msg.set_content(
            f"{plain_env}"
            f"Bonjour {to_name},\n\n"
            f"Des processus sont en attente de votre intervention sur la plateforme BPM | Gestion de Prime.\n"
            f"Vous trouverez ci-dessous la liste des prime{plural} bloquée{plural} à votre étape de validation.\n\n"
            + "\n".join(f"- {it['employee_name']} - {it['type_label']} - {it['amount']} - {it['status_label']} : {it['url']}" for it in items)
            + "\n\nMerci de bien vouloir traiter ces dossiers afin que les processus puissent se poursuivre.\n\n"
            f"---\nBPM | Gestion de Prime"
        )

        links = "".join(
            f"<li style=\"margin:8px 0;\">"
            f"<a href=\"{it['url']}\" style=\"color:#2563eb;font-weight:600;text-decoration:none;\">{it['employee_name']}</a>"
            f" <span style=\"color:#64748b;\">&mdash; {it['type_label']} &middot; {it['amount']} &middot; {it['status_label']}</span>"
            f"</li>"
            for it in items
        )

        banner = _test_banner_html(cfg)
        footer = _test_footer_html(cfg)
        env_badge = (
            f'<span style="font-size:11px;font-weight:600;color:#d97706;background:#fef3c7;'
            f'padding:3px 10px;border-radius:12px;">{env_label}</span>'
            if cfg["test_mode"] else ""
        )
        msg.add_alternative(f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:linear-gradient(135deg,#1e40af,#2563eb);padding:24px 32px;border-radius:16px 16px 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <div style="font-size:12px;color:rgba(255,255,255,0.7);letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">BPM</div>
              <div style="font-size:20px;color:#fff;font-weight:700;margin-top:2px;">Gestion de Prime</div>
            </td>
            <td align="right">{env_badge}</td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">
          {banner}
          <p style="margin:0 0 16px;font-size:15px;color:#334155;">Bonjour <strong style="color:#0f172a;">{to_name}</strong>,</p>
          <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.7;">
            Des processus sont actuellement <strong style="color:#0f172a;">en attente de votre intervention</strong>.
            Vous trouverez ci-dessous la liste des prime{plural} bloquée{plural} à votre étape de validation.
            Merci de bien vouloir les traiter dans les meilleurs délais.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            <tr><td style="background:#eff6ff;border-left:4px solid #2563eb;border-radius:10px;padding:14px 20px;">
              <span style="font-size:22px;font-weight:700;color:#1d4ed8;">{count}</span>
              <span style="font-size:13px;color:#334155;"> prime{plural} en attente de votre décision</span>
            </td></tr>
          </table>
          <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#475569;line-height:1.6;">
            {links}
          </ul>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 20px;">
          {footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>""", subtype="html")

        with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
            server.starttls()
            server.login(cfg["user"], cfg["password"])
            server.send_message(msg)

        return True
    except Exception as e:
        print(f"SMTP error (reminder): {e}")
        return False


async def send_deadline_reminder_email(
    to_email: str,
    to_name: str,
    reminder_label: str,
    deadline_date: str,
    items: list,
) -> bool:
    """
    Rappel de la date limite de validation (le 20 du mois) envoyé aux N+1, N+2
    et Directeurs. items : liste de dicts {employee_name, type_label, amount, status_label, url}
    """
    return await asyncio.to_thread(
        _send_deadline_reminder_email_sync,
        to_email, to_name, reminder_label, deadline_date, items,
    )


def _send_deadline_reminder_email_sync(
    to_email: str,
    to_name: str,
    reminder_label: str,
    deadline_date: str,
    items: list,
) -> bool:
    try:
        cfg = _smtp_config()
        env_label = _env_label(cfg)
        prefix = _test_subject_prefix(cfg)
        count = len(items)
        plural = "s" if count > 1 else ""
        frontend_url = get_config("FRONTEND_URL")
        msg = EmailMessage()
        msg["Subject"] = f"{prefix}Rappel : finalisez vos validations avant le {deadline_date} | BPM"
        msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
        msg["To"] = _resolve_email(to_email)

        plain_env = f"[{env_label}]\n\n" if cfg["test_mode"] else ""
        items_text = "\n".join(
            f"- {it['employee_name']} - {it['type_label']} - {it['amount']} - {it['status_label']} : {it['url']}"
            for it in items
        )
        msg.set_content(
            f"{plain_env}"
            f"Bonjour {to_name},\n\n"
            f"{reminder_label} : la date limite de finalisation des validations de primes est fixée au {deadline_date}.\n"
            f"Merci de bien vouloir finaliser les validations en attente avant cette échéance.\n\n"
            f"Validations en attente ({count} prime{plural}) :\n"
            f"{items_text}\n\n"
            f"---\nBPM | Gestion de Prime"
        )

        links = "".join(
            f"<li style=\"margin:8px 0;\">"
            f"<a href=\"{it['url']}\" style=\"color:#2563eb;font-weight:600;text-decoration:none;\">{it['employee_name']}</a>"
            f" <span style=\"color:#64748b;\">&mdash; {it['type_label']} &middot; {it['amount']} &middot; {it['status_label']}</span>"
            f"</li>"
            for it in items
        )

        banner = _test_banner_html(cfg)
        footer = _test_footer_html(cfg)
        env_badge = (
            f'<span style="font-size:11px;font-weight:600;color:#d97706;background:#fef3c7;'
            f'padding:3px 10px;border-radius:12px;">{env_label}</span>'
            if cfg["test_mode"] else ""
        )
        msg.add_alternative(f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:linear-gradient(135deg,#1e40af,#2563eb);padding:24px 32px;border-radius:16px 16px 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <div style="font-size:12px;color:rgba(255,255,255,0.7);letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">BPM</div>
              <div style="font-size:20px;color:#fff;font-weight:700;margin-top:2px;">Gestion de Prime</div>
            </td>
            <td align="right">
              <span style="font-size:11px;font-weight:600;color:#fbbf24;background:#b45309;padding:3px 10px;border-radius:12px;">Date limite : {deadline_date}</span>
              {' ' + env_badge if env_badge else ''}
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">
          {banner}
          <p style="margin:0 0 16px;font-size:15px;color:#334155;">Bonjour <strong style="color:#0f172a;">{to_name}</strong>,</p>
          <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.7;">
            <strong style="color:#0f172a;">{reminder_label}</strong> : la date limite de finalisation
            des validations de primes est fixée au <strong style="color:#0f172a;">{deadline_date}</strong>.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            <tr><td style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:10px;padding:16px 20px;">
              <span style="font-size:13px;color:#92400e;font-weight:600;">&#9888;&#65039; Échéance</span>
              <div style="font-size:16px;font-weight:700;color:#b45309;margin-top:2px;">{deadline_date}</div>
            </td></tr>
          </table>
          <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.7;">
            Merci de bien vouloir finaliser les validations en attente avant cette échéance afin que
            les processus puissent se poursuivre.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            <tr><td style="background:#eff6ff;border-left:4px solid #2563eb;border-radius:10px;padding:14px 20px;">
              <span style="font-size:22px;font-weight:700;color:#1d4ed8;">{count}</span>
              <span style="font-size:13px;color:#334155;"> prime{plural} encore en attente de votre décision</span>
            </td></tr>
          </table>
          <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#475569;line-height:1.6;">
            {links}
          </ul>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 24px;">
            <a href="{frontend_url}" style="display:inline-block;background:#f59e0b;color:#fff;padding:12px 32px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.3px;">
              Ouvrir la plateforme BPM &rarr;
            </a>
          </td></tr></table>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 20px;">
          {footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>""", subtype="html")

        with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
            server.starttls()
            server.login(cfg["user"], cfg["password"])
            server.send_message(msg)

        return True
    except Exception as e:
        print(f"SMTP error (deadline reminder): {e}")
        return False

"""Envoi du digest par courriel via SMTP (Gmail par défaut).

Gmail exige un « mot de passe d'application » (App Password) — activez la
validation en deux étapes puis créez-en un sur
https://myaccount.google.com/apppasswords. Fournissez ensuite les identifiants
par variables d'environnement afin de ne rien committer :

    GMAIL_ADDRESS=exemple@gmail.com
    GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
"""

from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage

from ..config import EmailConfig


class EmailDeliveryError(RuntimeError):
    pass


def build_message(
    config: EmailConfig, subject: str, text_body: str, html_body: str
) -> EmailMessage:
    if not config.recipient:
        raise EmailDeliveryError("Aucun destinataire configuré (email.recipient).")
    sender = config.from_address or config.username or config.recipient

    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = config.recipient
    msg["Subject"] = f"{config.subject_prefix} {subject}".strip()
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")
    return msg


def send_email(
    config: EmailConfig, subject: str, text_body: str, html_body: str
) -> None:
    """Envoie le courriel via SMTP+STARTTLS. Lève `EmailDeliveryError` en cas d'échec."""
    if not config.username or not config.password:
        raise EmailDeliveryError(
            "Identifiants SMTP manquants : définissez GMAIL_ADDRESS et "
            "GMAIL_APP_PASSWORD (ou email.username / email.password)."
        )

    msg = build_message(config, subject, text_body, html_body)
    context = ssl.create_default_context()
    try:
        with smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=30) as server:
            server.ehlo()
            server.starttls(context=context)
            server.login(config.username, config.password)
            server.send_message(msg)
    except (smtplib.SMTPException, OSError) as exc:
        raise EmailDeliveryError(f"Échec de l'envoi SMTP : {exc}") from exc

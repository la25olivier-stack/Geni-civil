"""Canaux de livraison du digest."""

from .email_gmail import EmailDeliveryError, send_email

__all__ = ["send_email", "EmailDeliveryError"]

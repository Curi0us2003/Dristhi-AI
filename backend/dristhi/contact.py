"""Checks and tidies the name and phone number an attendee gives when joining."""
import re

from dristhi.errors import ApiError


def clean_name(raw: str) -> str:
    name = " ".join(raw.split())
    if not 2 <= len(name) <= 60:
        raise ApiError(422, "invalid_name", "Enter your name (2 to 60 characters).")
    return name


def clean_phone(raw: str) -> str:
    """Returns the number in international form: "98765 43210" → "+919876543210".

    Ten-digit Indian mobile numbers may be written with or without 0, 91 or +91 in front; other
    countries need the + and country code.
    """
    digits = re.sub(r"[\s\-().]", "", raw)
    indian = re.fullmatch(r"(?:\+?91|0)?([6-9]\d{9})", digits)
    if indian:
        return "+91" + indian.group(1)
    if re.fullmatch(r"\+[1-9]\d{7,14}", digits):
        return digits
    raise ApiError(422, "invalid_phone", "Enter a valid mobile number, for example 98765 43210.")

from datetime import datetime


def dt(s):
    """Date ISO (avec ou sans Z) -> datetime avec fuseau."""
    return datetime.fromisoformat(s.replace("Z", "+00:00"))

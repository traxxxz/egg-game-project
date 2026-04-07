from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass(slots=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./media_archive.db")
    archive_root: str = os.getenv("ARCHIVE_ROOT", "./archive")
    bot_brand: str = os.getenv("BOT_BRAND", "BY: MOHAMMED 🚀")
    import_timeout_seconds: float = float(os.getenv("IMPORT_TIMEOUT_SECONDS", "45"))
    import_max_retries: int = int(os.getenv("IMPORT_MAX_RETRIES", "2"))
    ytdlp_timeout_seconds: int = int(os.getenv("YTDLP_TIMEOUT_SECONDS", "90"))
    allowed_import_domains: set[str] = field(
        default_factory=lambda: {
            "instagram.com",
            "www.instagram.com",
            "cdninstagram.com",
            "scontent.cdninstagram.com",
            "fbcdn.net",
            "fbsbx.com",
            "tiktok.com",
            "www.tiktok.com",
            "tiktokcdn.com",
            "snapchat.com",
            "www.snapchat.com",
            "x.com",
            "twitter.com",
            "twimg.com",
        }
    )


settings = Settings()

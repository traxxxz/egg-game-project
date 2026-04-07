from __future__ import annotations

import mimetypes
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

from app.config import settings

SOCIAL_DOMAINS = {
    "instagram.com",
    "www.instagram.com",
    "tiktok.com",
    "www.tiktok.com",
    "snapchat.com",
    "www.snapchat.com",
    "x.com",
    "twitter.com",
}


class ImporterError(Exception):
    pass


class DomainNotAllowedError(ImporterError):
    pass


class TimeoutErrorImport(ImporterError):
    pass


@dataclass(slots=True)
class ImportResult:
    filename: str
    content: bytes
    mime_type: str
    source_url: str
    title: str
    account_name: str | None
    notes: str | None = None


def validate_domain(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    if host not in settings.allowed_import_domains:
        raise DomainNotAllowedError("This domain is not allowed for import.")
    return host


def _is_media_mime(mime: str | None) -> bool:
    if not mime:
        return False
    clean = mime.split(";", 1)[0].strip().lower()
    return clean.startswith("video/") or clean.startswith("image/") or clean in {
        "application/octet-stream",
        "application/mp4",
    }


def _guess_media_mime_from_name(name: str) -> str | None:
    guessed, _ = mimetypes.guess_type(name)
    if guessed and _is_media_mime(guessed):
        return guessed
    return None


def _extract_meta_content(html: str, key: str, attr: str = "property") -> str | None:
    soup = BeautifulSoup(html, "html.parser")
    tag = soup.find("meta", attrs={attr: key})
    if tag:
        content = tag.get("content")
        if content:
            return str(content)
    return None


def _resolve_public_page_media_url(url: str, html: str) -> tuple[str | None, str | None]:
    og_video = _extract_meta_content(html, "og:video")
    if og_video:
        return og_video, "video/mp4"
    og_image = _extract_meta_content(html, "og:image")
    if og_image:
        return og_image, _guess_media_mime_from_name(og_image) or "image/jpeg"
    return None, None


def _download_binary(url: str) -> tuple[bytes, str, str]:
    timeout = httpx.Timeout(settings.import_timeout_seconds, connect=20.0)
    last_error: Exception | None = None

    for _ in range(settings.import_max_retries + 1):
        try:
            with httpx.Client(timeout=timeout, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"}) as client:
                resp = client.get(url)
                resp.raise_for_status()
                ctype = resp.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                final_name = Path(urlparse(str(resp.url)).path).name or "media.bin"

                if _is_media_mime(ctype):
                    return resp.content, (ctype or _guess_media_mime_from_name(final_name) or "application/octet-stream"), final_name

                if "text/html" in ctype:
                    media_url, media_mime = _resolve_public_page_media_url(url, resp.text)
                    if media_url:
                        return _download_binary(media_url)
                    raise ImporterError("This URL is not direct media. Got: text/html")

                raise ImporterError(f"This URL is not direct media. Got: {ctype or 'unknown'}")
        except httpx.TimeoutException as exc:
            last_error = exc
        except httpx.HTTPError as exc:
            raise ImporterError(f"Failed to download media: {exc}") from exc

    raise TimeoutErrorImport("Timed out while downloading media.") from last_error


def _download_with_ytdlp(url: str) -> tuple[bytes, str, str, str, str | None]:
    with tempfile.TemporaryDirectory(prefix="ytbot_") as tmp:
        outtmpl = str(Path(tmp) / "%(title).120B.%(ext)s")
        opts = {
            "outtmpl": outtmpl,
            "format": "bestvideo*+bestaudio/best",
            "merge_output_format": "mp4",
            "socket_timeout": settings.ytdlp_timeout_seconds,
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "retries": 2,
        }
        try:
            with YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
                filepath = Path(ydl.prepare_filename(info))
                if not filepath.exists():
                    matches = list(Path(tmp).glob("*"))
                    if not matches:
                        raise ImporterError("yt-dlp fallback failed: Download completed but no file found.")
                    filepath = max(matches, key=lambda p: p.stat().st_size)
                data = filepath.read_bytes()
                mime = _guess_media_mime_from_name(filepath.name) or "video/mp4"
                title = str(info.get("title") or filepath.stem)
                uploader = info.get("uploader")
                return data, mime, filepath.name, title, uploader
        except DownloadError as exc:
            message = str(exc).lower()
            if "login" in message or "sign in" in message:
                raise ImporterError("Login required by platform.") from exc
            if "rate-limit" in message or "too many requests" in message:
                raise ImporterError("Rate limit reached by platform.") from exc
            raise ImporterError(f"yt-dlp fallback failed: {exc}") from exc


def import_public_url(url: str) -> ImportResult:
    host = validate_domain(url)

    if host in SOCIAL_DOMAINS:
        try:
            data, mime, filename, title, uploader = _download_with_ytdlp(url)
            return ImportResult(
                filename=filename,
                content=data,
                mime_type=mime,
                source_url=url,
                title=title,
                account_name=uploader,
                notes=f"Imported via yt-dlp from {host}",
            )
        except ImporterError:
            raise
        except Exception as exc:
            raise ImporterError(f"yt-dlp fallback failed: {exc}") from exc

    data, mime, filename = _download_binary(url)
    title = Path(filename).stem
    return ImportResult(
        filename=filename,
        content=data,
        mime_type=mime,
        source_url=url,
        title=title,
        account_name=None,
        notes=f"Imported via direct/httpx from {host}",
    )


def extract_first_url(text: str) -> str | None:
    pattern = r"https?://[^\s<>\"]+"
    match = re.search(pattern, text or "")
    return match.group(0) if match else None

from __future__ import annotations

import os
from pathlib import Path

from telegram import Update
from telegram.constants import ChatAction
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

from app.config import settings
from app.db import SessionLocal, init_db
from app.models import MediaItem
from app.services.importer import (
    DomainNotAllowedError,
    ImporterError,
    TimeoutErrorImport,
    extract_first_url,
    import_public_url,
)
from app.services.storage import storage_service


def _safe_title(title: str | None, fallback: str = "Untitled") -> str:
    cleaned = (title or "").strip()
    return cleaned[:180] if cleaned else fallback


def _build_caption(title: str, source_url: str | None) -> str:
    lines = [settings.bot_brand, _safe_title(title)]
    if source_url:
        lines.append(source_url)
    return "\n".join(lines)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "أرسل رابط ميديا عام أو ارفع صورة/فيديو/ملف، وسأحفظه وأعيد إرساله مع الحقوق في الكابشن."
    )


async def _send_back(chat_id: int, path: Path, mime_type: str, caption: str, context: ContextTypes.DEFAULT_TYPE) -> None:
    if mime_type.startswith("video/"):
        with path.open("rb") as f:
            await context.bot.send_video(chat_id=chat_id, video=f, caption=caption)
    elif mime_type.startswith("image/"):
        with path.open("rb") as f:
            await context.bot.send_photo(chat_id=chat_id, photo=f, caption=caption)
    else:
        with path.open("rb") as f:
            await context.bot.send_document(chat_id=chat_id, document=f, caption=caption)


async def _save_record(
    *,
    title: str,
    source_type: str,
    source_url: str | None,
    account_name: str | None,
    local_path: Path,
    mime_type: str,
    notes: str | None,
) -> None:
    db = SessionLocal()
    try:
        item = MediaItem(
            title=_safe_title(title),
            platform="telegram",
            source_type=source_type,
            source_url=source_url,
            account_name=account_name,
            local_path=str(local_path),
            mime_type=mime_type,
            notes=notes,
        )
        db.add(item)
        db.commit()
    finally:
        db.close()


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.message
    if not message or not message.text:
        return

    url = extract_first_url(message.text)
    if not url:
        await message.reply_text("لم أجد رابطًا صالحًا في الرسالة.")
        return

    await context.bot.send_chat_action(chat_id=message.chat_id, action=ChatAction.UPLOAD_DOCUMENT)

    try:
        result = import_public_url(url)
        save_name = result.filename or "media.bin"
        path = storage_service.build_path("telegram", save_name)
        storage_service.save_bytes(path, result.content)

        await _save_record(
            title=result.title,
            source_type="public_url",
            source_url=result.source_url,
            account_name=result.account_name,
            local_path=path,
            mime_type=result.mime_type,
            notes=result.notes,
        )

        caption = _build_caption(result.title, result.source_url)
        await _send_back(message.chat_id, path, result.mime_type, caption, context)

    except DomainNotAllowedError as exc:
        await message.reply_text(str(exc))
    except TimeoutErrorImport as exc:
        await message.reply_text(str(exc))
    except ImporterError as exc:
        await message.reply_text(str(exc))
    except Exception as exc:  # noqa: BLE001
        await message.reply_text(f"Unexpected error while importing URL: {exc}")


async def handle_upload(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.message
    if not message:
        return

    file_obj = None
    title = "telegram_upload"
    mime_type = "application/octet-stream"
    filename = "file.bin"

    if message.photo:
        photo = message.photo[-1]
        file_obj = await photo.get_file()
        mime_type = "image/jpeg"
        filename = f"photo_{photo.file_unique_id}.jpg"
        title = filename
    elif message.video:
        video = message.video
        file_obj = await video.get_file()
        mime_type = video.mime_type or "video/mp4"
        filename = video.file_name or f"video_{video.file_unique_id}.mp4"
        title = video.file_name or filename
    elif message.document:
        doc = message.document
        file_obj = await doc.get_file()
        mime_type = doc.mime_type or "application/octet-stream"
        filename = doc.file_name or f"document_{doc.file_unique_id}"
        title = doc.file_name or filename

    if not file_obj:
        await message.reply_text("النوع غير مدعوم. أرسل رابطًا أو صورة/فيديو/ملف.")
        return

    await context.bot.send_chat_action(chat_id=message.chat_id, action=ChatAction.UPLOAD_DOCUMENT)
    blob = await file_obj.download_as_bytearray()

    path = storage_service.build_path("telegram", filename)
    storage_service.save_bytes(path, bytes(blob))

    await _save_record(
        title=title,
        source_type="telegram_upload",
        source_url=None,
        account_name=message.from_user.username if message.from_user else None,
        local_path=path,
        mime_type=mime_type,
        notes="Uploaded directly via Telegram",
    )

    caption = _build_caption(title, None)
    await _send_back(message.chat_id, path, mime_type, caption, context)


def main() -> None:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is required")

    init_db()
    app = Application.builder().token(token).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.PHOTO | filters.VIDEO | filters.Document.ALL, handle_upload))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))

    app.run_polling(close_loop=False)


if __name__ == "__main__":
    main()

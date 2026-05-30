from __future__ import annotations

import base64
import binascii
import os
import re
import shlex
import subprocess
import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageDraw, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field


APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
OUTPUT_DIR = Path(os.getenv("PHOTOBOOTH_OUTPUT_DIR", BACKEND_DIR / "output")).expanduser()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
BACKGROUND_PATH = Path(os.getenv("PHOTOBOOTH_BACKGROUND_PATH") or OUTPUT_DIR / "bg.png").expanduser()

DPI = int(os.getenv("PHOTOBOOTH_DPI", "300"))
POSTCARD_WIDTH_MM = 100
POSTCARD_HEIGHT_MM = 148
PAGE_WIDTH = int(os.getenv("PHOTOBOOTH_PAGE_WIDTH", str(round(POSTCARD_WIDTH_MM / 25.4 * DPI))))
PAGE_HEIGHT = int(os.getenv("PHOTOBOOTH_PAGE_HEIGHT", str(round(POSTCARD_HEIGHT_MM / 25.4 * DPI))))
PAGE_SIZE = (PAGE_WIDTH, PAGE_HEIGHT)
PHOTO_WIDTH_SCALE = float(os.getenv("PHOTOBOOTH_PHOTO_WIDTH_SCALE", "0.96"))
PHOTO_HEIGHT_SCALE = float(os.getenv("PHOTOBOOTH_PHOTO_HEIGHT_SCALE", "0.86"))
ARTIFICIAL_MARGIN_MM = float(os.getenv("PHOTOBOOTH_ARTIFICIAL_MARGIN_MM", "3"))
ARTIFICIAL_MARGIN_PX = max(0, round(ARTIFICIAL_MARGIN_MM / 25.4 * DPI))

MAX_IMAGE_CHARS = int(os.getenv("PHOTOBOOTH_MAX_IMAGE_CHARS", str(18 * 1024 * 1024)))
PRINTER_NAME = os.getenv("PHOTOBOOTH_PRINTER_NAME", "").strip()
DRY_RUN = os.getenv("PHOTOBOOTH_DRY_RUN", "0").strip().lower() in {"1", "true", "yes", "on"}
DEFAULT_MEDIA_SIZE = os.getenv("PHOTOBOOTH_MEDIA_SIZE", "Postcard.Fullbleed")
DEFAULT_LPR_OPTIONS = (
    f"-o PageSize={DEFAULT_MEDIA_SIZE} "
    "-o MediaType=photographic "
    "-o ColorModel=RGB "
    "-o cupsPrintQuality=Normal"
)
LPR_OPTIONS = shlex.split(os.getenv("PHOTOBOOTH_LPR_OPTIONS", DEFAULT_LPR_OPTIONS))

DATA_URL_RE = re.compile(r"^data:image/[a-z0-9.+-]+;base64,(?P<data>.+)$", re.IGNORECASE | re.DOTALL)


class PrintRequest(BaseModel):
    images: list[str]
    copies: int = Field(default=1, ge=1, le=5)
    print: bool = True


class PrintResponse(BaseModel):
    job_id: str
    image_url: str
    printed: bool
    printer: str | None
    message: str
    command: list[str] | None = None


class PrinterListResponse(BaseModel):
    printers: list[str]
    configured_printer: str | None
    dry_run: bool


class PrintOutcome(BaseModel):
    printed: bool
    message: str
    command: list[str] | None = None


app = FastAPI(title="Photobooth Backend")

cors_origins = [
    origin.strip()
    for origin in os.getenv("PHOTOBOOTH_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/output", StaticFiles(directory=OUTPUT_DIR), name="output")


@app.get("/api/health")
def health() -> dict[str, object]:
    return {
        "ok": True,
        "page_size_px": list(PAGE_SIZE),
        "dpi": DPI,
        "artificial_margin_mm": ARTIFICIAL_MARGIN_MM,
        "artificial_margin_px": ARTIFICIAL_MARGIN_PX,
        "printer_configured": bool(PRINTER_NAME),
        "dry_run": DRY_RUN,
        "background_configured": BACKGROUND_PATH.exists(),
    }


@app.get("/api/config")
def config() -> dict[str, object]:
    return {
        "dpi": DPI,
        "paper_mm": [POSTCARD_WIDTH_MM, POSTCARD_HEIGHT_MM],
        "page_size_px": list(PAGE_SIZE),
        "artificial_margin_mm": ARTIFICIAL_MARGIN_MM,
        "artificial_margin_px": ARTIFICIAL_MARGIN_PX,
        "printer_configured": bool(PRINTER_NAME),
        "dry_run": DRY_RUN,
        "media_size": DEFAULT_MEDIA_SIZE,
        "background_path": str(BACKGROUND_PATH),
        "background_configured": BACKGROUND_PATH.exists(),
    }


@app.get("/api/printers", response_model=PrinterListResponse)
def printers() -> PrinterListResponse:
    try:
        completed = subprocess.run(["lpstat", "-e"], check=True, capture_output=True, text=True, timeout=5)
    except FileNotFoundError:
        return PrinterListResponse(printers=[], configured_printer=PRINTER_NAME or None, dry_run=DRY_RUN)
    except subprocess.SubprocessError:
        return PrinterListResponse(printers=[], configured_printer=PRINTER_NAME or None, dry_run=DRY_RUN)

    names = [line.strip() for line in completed.stdout.splitlines() if line.strip()]
    return PrinterListResponse(printers=names, configured_printer=PRINTER_NAME or None, dry_run=DRY_RUN)


@app.post("/api/print", response_model=PrintResponse)
def print_photos(payload: PrintRequest) -> PrintResponse:
    if len(payload.images) != 3:
        raise HTTPException(status_code=422, detail="Exactly three captured images are required.")

    images = [decode_image(data_url, index + 1) for index, data_url in enumerate(payload.images)]
    sheet = compose_sheet(images)

    job_id = f"{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:8]}"
    output_path = OUTPUT_DIR / f"{job_id}.jpg"
    sheet.save(output_path, format="JPEG", quality=95, subsampling=0, dpi=(DPI, DPI))

    outcome = send_to_printer(output_path, payload.copies, payload.print)
    return PrintResponse(
        job_id=job_id,
        image_url=f"/output/{output_path.name}",
        printed=outcome.printed,
        printer=PRINTER_NAME or None,
        message=outcome.message,
        command=outcome.command,
    )


def decode_image(data_url: str, index: int) -> Image.Image:
    if len(data_url) > MAX_IMAGE_CHARS:
        raise HTTPException(status_code=413, detail=f"Image {index} is too large.")

    match = DATA_URL_RE.match(data_url)
    if not match:
        raise HTTPException(status_code=422, detail=f"Image {index} must be a base64 data URL.")

    try:
        raw = base64.b64decode(match.group("data"), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Image {index} is not valid base64.") from exc

    try:
        with Image.open(BytesIO(raw)) as img:
            return ImageOps.exif_transpose(img).convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=422, detail=f"Image {index} is not a readable image.") from exc


def compose_sheet(images: list[Image.Image]) -> Image.Image:
    page = load_background(PAGE_SIZE)
    draw = ImageDraw.Draw(page)

    margin_x = max(34, round(PAGE_WIDTH * 0.045))
    margin_top = max(44, round(PAGE_HEIGHT * 0.04))
    gutter = max(28, round(PAGE_WIDTH * 0.032))
    bottom_space = max(220, round(PAGE_HEIGHT * 0.16))
    strip_width = (PAGE_WIDTH - (margin_x * 2) - gutter) // 2
    available_height = PAGE_HEIGHT - margin_top - bottom_space
    row_gap = max(18, round(available_height * 0.018))
    full_photo_height = (available_height - (row_gap * 2)) // 3
    photo_width = round(strip_width * PHOTO_WIDTH_SCALE)
    photo_height = round(full_photo_height * PHOTO_HEIGHT_SCALE)
    content_height = (photo_height * 3) + (row_gap * 2)
    content_top = margin_top + max(0, (available_height - content_height) // 2) - 75

    draw_cut_guide(draw, margin_x + strip_width + (gutter // 2), content_top, content_top + content_height)

    for column in range(2):
        strip_x = margin_x + column * (strip_width + gutter)
        outward_offset = 20
        photo_x = strip_x + ((strip_width - photo_width) // 2)
        if column == 0:
            photo_x -= outward_offset
        else:
            photo_x += outward_offset

        for row, image in enumerate(images):
            photo_y = content_top + row * (photo_height + row_gap)
            photo = cover_crop(image, (photo_width, photo_height))
            page.paste(photo, (photo_x, photo_y))

    return add_artificial_margin(page)


def load_background(size: tuple[int, int]) -> Image.Image:
    if not BACKGROUND_PATH.exists():
        raise HTTPException(status_code=500, detail=f"Background image not found: {BACKGROUND_PATH}")

    try:
        with Image.open(BACKGROUND_PATH) as background:
            image = ImageOps.exif_transpose(background).convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=500, detail=f"Background image is not readable: {BACKGROUND_PATH}") from exc

    return ImageOps.fit(image, size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))


def add_artificial_margin(image: Image.Image) -> Image.Image:
    if ARTIFICIAL_MARGIN_PX <= 0:
        return image

    margin = min(ARTIFICIAL_MARGIN_PX, (min(image.size) - 1) // 2)
    inner_size = (image.width - (margin * 2), image.height - (margin * 2))
    resized = image.resize(inner_size, Image.Resampling.LANCZOS)
    page = Image.new("RGB", image.size, (255, 255, 255))
    page.paste(resized, (margin, margin))
    return page


def cover_crop(image: Image.Image, target_size: tuple[int, int]) -> Image.Image:
    target_width, target_height = target_size
    source_width, source_height = image.size
    scale = max(target_width / source_width, target_height / source_height)
    resized = image.resize((round(source_width * scale), round(source_height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - target_width) // 2
    top = (resized.height - target_height) // 2
    return resized.crop((left, top, left + target_width, top + target_height))


def draw_cut_guide(draw: ImageDraw.ImageDraw, x: int, top: int, bottom: int) -> None:
    dash = 18
    gap = 14
    y = top
    while y < bottom:
        draw.line([(x, y), (x, min(bottom, y + dash))], fill=(146, 111, 54), width=2)
        y += dash + gap


def send_to_printer(path: Path, copies: int, requested: bool) -> PrintOutcome:
    if not requested:
        return PrintOutcome(printed=False, message="Rendered without printing because printing was disabled.")

    command = build_print_command(path, copies) if PRINTER_NAME else None

    if DRY_RUN:
        return PrintOutcome(
            printed=False,
            message="Rendered without printing because PHOTOBOOTH_DRY_RUN is enabled.",
            command=command,
        )
    if not PRINTER_NAME:
        return PrintOutcome(
            printed=False,
            message="Rendered without printing because PHOTOBOOTH_PRINTER_NAME is not configured.",
        )

    if command is None:
        raise HTTPException(status_code=500, detail="Print command could not be built.")

    try:
        completed = subprocess.run(command, check=True, capture_output=True, text=True, timeout=30)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail="The lpr command is not available on this machine.") from exc
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or "Printing failed.").strip()
        raise HTTPException(status_code=502, detail=detail) from exc
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="Timed out while sending the print job.") from exc

    message = completed.stdout.strip() or "Print job sent."
    return PrintOutcome(printed=True, message=message, command=command)


def build_print_command(path: Path, copies: int) -> list[str]:
    command = ["lpr", "-P", PRINTER_NAME]
    if copies > 1:
        command.extend(["-#", str(copies)])
    command.extend(LPR_OPTIONS)
    command.append(str(path))
    return command

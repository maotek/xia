# Champagne Photobooth

Self-contained React + FastAPI photobooth for a Canon SELPHY CP1200 postcard print.

The flow is:

1. Open the camera in the browser.
2. Press Space or the Start button.
3. Count down from 5 to 0 and capture the first photo.
4. Capture two more photos with 3 second countdowns.
5. Render one 100 x 148 mm postcard sheet at 300 DPI with two vertical strips over `bg.png`.
6. Send the rendered JPEG to a configured CUPS printer with `lpr`.

## Backend

```bash
cd photobooth/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
PHOTOBOOTH_DRY_RUN=1 uvicorn app.main:app --reload --port 8001
```

Rendered sheets are written to `photobooth/backend/output`.

The postcard and app page background uses `photobooth/backend/output/bg.png`.
Override it with `PHOTOBOOTH_BACKGROUND_PATH=/path/to/bg.png` if you move the file.

## Frontend

```bash
cd photobooth/frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Printer setup

The backend uses CUPS `lpr`, so the network SELPHY must already be available to macOS/Linux as a printer.

List available printers:

```bash
lpstat -e
```

Run with printing enabled:

```bash
cd photobooth/backend
source .venv/bin/activate
PHOTOBOOTH_PRINTER_NAME="Canon_SELPHY_CP1200" PHOTOBOOTH_DRY_RUN=0 uvicorn app.main:app --reload --port 8001
```

Optional print options can be overridden:

```bash
PHOTOBOOTH_MEDIA_SIZE="Postcard.Fullbleed"
PHOTOBOOTH_ARTIFICIAL_MARGIN_MM=4
PHOTOBOOTH_LPR_OPTIONS="-o PageSize=Postcard.Fullbleed -o MediaType=photographic -o ColorModel=RGB -o cupsPrintQuality=Normal"
```

If `PHOTOBOOTH_PRINTER_NAME` is unset or `PHOTOBOOTH_DRY_RUN=1`, the app renders the postcard sheet but does not print.

CUPS media names are printer-driver specific. Check the CP1200 queue with:

```bash
lpoptions -p Canon_SELPHY_CP1200 -l
```

Your CP1200 driver lists `Postcard` and `Postcard.Fullbleed`. The app defaults to `Postcard.Fullbleed` and adds a 4 mm white border inside the generated JPEG. This lets the printer use borderless mode while cropping the artificial white edge instead of the real artwork. Increase `PHOTOBOOTH_ARTIFICIAL_MARGIN_MM` if the edges are still cut off; decrease it if the visible white border is too large.


## TEST
PHOTOBOOTH_PRINTER_NAME="Canon_SELPHY_CP1200" PHOTOBOOTH_DRY_RUN=0 .venv/bin/uvicorn app.main:app --reload --port 8001

PHOTOBOOTH_DRY_RUN=1 .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001

npm run dev

"""Write the event's QR code (the one printed at the venue) and print its link.

    python scripts/make_event_qr.py --event demo --base-url https://<app domain>

Output: backend/out/event-<slug>-qr.png (git-ignored). Default base URL: PUBLIC_APP_URL,
or http://localhost:9002.
"""
import argparse
import sys
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import qrcode  # noqa: E402

from dristhi import config  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--event", default="demo", help="event slug")
    parser.add_argument("--base-url", default=config.public_app_url())
    args = parser.parse_args()

    link = f"{args.base_url.rstrip('/')}/join?e={quote(args.event)}"
    out_dir = config.BACKEND_DIR / "out"
    out_dir.mkdir(exist_ok=True)
    path = out_dir / f"event-{args.event}-qr.png"

    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=12, border=4)
    qr.add_data(link)
    qr.make(fit=True)
    qr.make_image(fill_color="black", back_color="white").save(path)

    print(link)
    print(f"QR code saved to {path}")


if __name__ == "__main__":
    main()

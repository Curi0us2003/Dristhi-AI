"""Builds demo CCTV clips for every feed in feeds.json from the ShanghaiTech
crowd-counting dataset on Hugging Face (images with ground-truth head counts).

    cd backend
    python tools/make_demo_videos.py            # writes videos/*.mp4 (+ ground_truth.json)

Each clip is a sequence of real scenes, ordered from quiet to busy, each held for
SCENE_SECONDS, so dashboards show rising density, alerts and predictions.
ShanghaiTech is a research dataset - use the clips for local testing only.
"""
import json
import os
import sys

import cv2
import numpy as np
import pyarrow.parquet as pq
from huggingface_hub import hf_hub_download

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = "KTAEHWA/shanghaitech-crowd-counting"
PARTS = {  # part B = street-level CCTV scenes, part A = dense crowds
    "B": "data/part_B_test_data-00000-of-00001-5fa64741044e9db4.parquet",
    "A": "data/part_A_test_data-00000-of-00001-c5e0a32674388d67.parquet",
}
DENSE_AREAS = {"stage", "back_street"}  # feeds that get part-A (dense) scenes
SCENES_PER_FEED = 6
SCENE_SECONDS = 10
FPS = 10
SIZE = (1024, 576)  # 16:9 like a CCTV camera; images are letterboxed, so GT counts stay valid


def letterbox(img):
    h, w = img.shape[:2]
    s = min(SIZE[0] / w, SIZE[1] / h)
    resized = cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
    canvas = np.zeros((SIZE[1], SIZE[0], 3), np.uint8)
    y, x = (SIZE[1] - resized.shape[0]) // 2, (SIZE[0] - resized.shape[1]) // 2
    canvas[y:y + resized.shape[0], x:x + resized.shape[1]] = resized
    return canvas


def main():
    feeds_path = os.environ.get("FEEDS_FILE", os.path.join(BASE, "feeds.json"))
    feeds = json.load(open(feeds_path, encoding="utf-8"))
    rows = {}
    for part, path in PARTS.items():
        print(f"Downloading ShanghaiTech part {part} test split from Hugging Face...")
        rows[part] = pq.read_table(hf_hub_download(REPO, path, repo_type="dataset"),
                                   columns=["image", "count"]).to_pylist()

    rng = np.random.default_rng(7)
    used = {"A": set(), "B": set()}
    ground_truth = {}
    for feed_id, cfg in feeds.items():
        url = cfg["url"]
        if "://" in url:
            print(f"skip {feed_id}: url is remote ({url})")
            continue
        part = "A" if cfg.get("area") in DENSE_AREAS else "B"
        pool = [i for i in range(len(rows[part])) if i not in used[part]]
        picks = rng.choice(pool, SCENES_PER_FEED, replace=False)
        used[part].update(int(i) for i in picks)
        picks = sorted(picks, key=lambda i: rows[part][i]["count"])  # quiet -> busy

        out = url if os.path.isabs(url) else os.path.join(BASE, url)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        writer = cv2.VideoWriter(out, cv2.VideoWriter_fourcc(*"mp4v"), FPS, SIZE)
        counts = []
        for i in picks:
            img = cv2.imdecode(np.frombuffer(rows[part][i]["image"]["bytes"], np.uint8), cv2.IMREAD_COLOR)
            frame = letterbox(img)
            for _ in range(SCENE_SECONDS * FPS):
                writer.write(frame)
            counts.append(rows[part][i]["count"])
        writer.release()
        ground_truth[feed_id] = {"name": cfg["name"], "scene_seconds": SCENE_SECONDS, "counts": counts}
        print(f"{feed_id:7s} {cfg['name']:16s} -> {os.path.relpath(out, BASE)}  people per scene: {counts}")

    gt_path = os.path.join(BASE, "videos", "ground_truth.json")
    json.dump(ground_truth, open(gt_path, "w", encoding="utf-8"), indent=2)
    print(f"\nDone. Ground truth written to {os.path.relpath(gt_path, BASE)}")


if __name__ == "__main__":
    sys.exit(main())

"""Crowd counting models.

Default: **DM-Count** (NeurIPS 2020, UCF-QNRF weights) from Hugging Face, run with
ONNX Runtime. It regresses a person *density map* whose sum is the crowd size, so
it keeps working in dense crowds where person detectors saturate.

Benchmark on ShanghaiTech test images (CPU, 13th-gen i5):

    model                         street scenes (part B)   dense crowds (part A)
    YOLOv8n @320x240 (old)        MAE  84.5 / 66.6 % err    MAE 336.6 / 95.9 % err
    DM-Count, tiled (this)        MAE  11.0 /  7.9 % err    MAE  54.8 / 17.7 % err

Configuration (environment variables):
    CROWD_MODEL        "dmcount" (default) or "yolo" (needs `pip install ultralytics`)
    HF_MODEL_REPO      Hugging Face repo   (default mlboydaisuke/DM-Count-Crowd-OpenVINO)
    HF_MODEL_FILE      ONNX file in repo   (default dmcount.onnx)
    DENSITY_MAX_SIDE   frame long side before tiling, px (default 1024; 768 ≈ 2x faster)
    INFERENCE_THREADS  ONNX Runtime intra-op threads (default: all cores)
"""
from __future__ import annotations

import os
import threading

import cv2
import numpy as np

TILE = 512      # model input is fixed at 512x512
STRIDE = 8      # output density map is 1/8 of the input (64x64)
_MEAN = np.array([0.485, 0.456, 0.406], np.float32)
_STD = np.array([0.229, 0.224, 0.225], np.float32)


def _tile_positions(length: int) -> list[int]:
    """Start offsets of 512-px tiles covering `length`, evenly overlapping (no padding)."""
    if length <= TILE:
        return [0]
    n = int(np.ceil(length / TILE))
    return [round(i * (length - TILE) / (n - 1)) for i in range(n)]


class DensityCounter:
    """DM-Count density-map counter (ONNX) with overlap tiling for any frame size."""

    name = "dm-count"

    def __init__(self):
        import onnxruntime as ort
        from huggingface_hub import hf_hub_download

        repo = os.environ.get("HF_MODEL_REPO", "mlboydaisuke/DM-Count-Crowd-OpenVINO")
        filename = os.environ.get("HF_MODEL_FILE", "dmcount.onnx")
        print(f"📥 Fetching crowd model {repo}/{filename} from Hugging Face (cached after first run)...")
        path = hf_hub_download(repo, filename)

        opts = ort.SessionOptions()
        threads = int(os.environ.get("INFERENCE_THREADS", "0"))
        if threads:
            opts.intra_op_num_threads = threads
        self.session = ort.InferenceSession(path, opts, providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        self.max_side = int(os.environ.get("DENSITY_MAX_SIDE", "1024"))
        # One inference at a time: each run already uses every core.
        self._lock = threading.Lock()
        self.count(np.zeros((TILE, TILE, 3), np.uint8))  # warm-up
        print(f"✅ Crowd model ready: DM-Count via ONNX Runtime ({path})")

    def _prepare(self, frame: np.ndarray) -> np.ndarray:
        h, w = frame.shape[:2]
        scale = self.max_side / max(h, w)
        scale = max(scale, TILE / min(h, w))  # short side must cover one tile
        interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR
        frame = cv2.resize(frame, (round(w * scale), round(h * scale)), interpolation=interp)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        return (rgb - _MEAN) / _STD

    def count(self, frame: np.ndarray) -> tuple[int, np.ndarray]:
        """Returns (people count, density map). The map sums to the (unrounded) count."""
        img = self._prepare(frame)
        h, w = img.shape[:2]
        acc = np.zeros((h // STRIDE, w // STRIDE), np.float32)
        hits = np.zeros_like(acc)
        with self._lock:
            for y in _tile_positions(h):
                for x in _tile_positions(w):
                    tile = np.ascontiguousarray(img[y:y + TILE, x:x + TILE].transpose(2, 0, 1)[None])
                    dens = self.session.run(None, {self.input_name: tile})[0][0, 0]
                    ys, xs = y // STRIDE, x // STRIDE
                    acc[ys:ys + dens.shape[0], xs:xs + dens.shape[1]] += dens
                    hits[ys:ys + dens.shape[0], xs:xs + dens.shape[1]] += 1
        density = acc / np.maximum(hits, 1)  # average overlapping tiles
        return int(round(float(density.sum()))), density


class YoloCounter:
    """Person-detector fallback (Ultralytics YOLOv8n at 1280 px)."""

    name = "yolov8n"

    def __init__(self):
        import torch
        from ultralytics import YOLO

        # PyTorch 2.6+ defaults weights_only=True, which breaks loading the official checkpoint
        _orig = torch.load
        torch.load = lambda f, *a, **k: _orig(f, *a, **{"weights_only": False, **k})
        self.model = YOLO("yolov8n.pt")  # auto-downloads on first use
        self._lock = threading.Lock()
        print("✅ Crowd model ready: YOLOv8n")

    def count(self, frame: np.ndarray) -> tuple[int, np.ndarray]:
        with self._lock:
            boxes = self.model(frame, classes=[0], imgsz=1280, verbose=False, device="cpu")[0].boxes
        h, w = frame.shape[:2]
        density = np.zeros((max(h // STRIDE, 1), max(w // STRIDE, 1)), np.float32)
        for x1, y1, x2, y2 in boxes.xyxy.cpu().numpy():
            cy, cx = int((y1 + y2) / 2) // STRIDE, int((x1 + x2) / 2) // STRIDE
            density[min(cy, density.shape[0] - 1), min(cx, density.shape[1] - 1)] += 1
        return len(boxes), cv2.GaussianBlur(density, (0, 0), 2)


class ContourCounter:
    """Last-resort heuristic when no model can be loaded (rough, for demos only)."""

    name = "opencv-contours"

    def count(self, frame: np.ndarray) -> tuple[int, np.ndarray]:
        gray = cv2.GaussianBlur(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (21, 21), 0)
        contours, _ = cv2.findContours(cv2.Canny(gray, 30, 80), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        n = 0
        for c in contours:
            x, y, w, h = cv2.boundingRect(c)
            if 800 < cv2.contourArea(c) < 8000 and w and 1.2 < h / w < 4.0:
                n += 1
        h, w = frame.shape[:2]
        return min(n, 30), np.zeros((max(h // STRIDE, 1), max(w // STRIDE, 1)), np.float32)


def load_counter():
    """Loads the configured model, falling back DM-Count → YOLO → contours."""
    choice = os.environ.get("CROWD_MODEL", "dmcount").lower()
    order = [YoloCounter, DensityCounter] if choice == "yolo" else [DensityCounter, YoloCounter]
    for cls in order:
        try:
            return cls()
        except Exception as e:  # missing package, no network on first run, ...
            print(f"⚠️  {cls.__name__} unavailable: {e}")
    print("⚠️  Using OpenCV contour heuristic – counts will be rough")
    return ContourCounter()


def render_density_overlay(frame: np.ndarray, density: np.ndarray | None, count: int | None = None) -> np.ndarray:
    """Blends a JET heatmap of `density` over `frame` and stamps the count."""
    out = frame.copy()
    if density is not None and density.size and float(density.max()) > 1e-6:
        heat = cv2.resize(density, (frame.shape[1], frame.shape[0]), interpolation=cv2.INTER_CUBIC)
        heat = np.clip(heat / float(heat.max()), 0, 1)
        color = cv2.applyColorMap((heat * 255).astype(np.uint8), cv2.COLORMAP_JET)
        alpha = (np.clip(heat * 1.5, 0, 0.6))[..., None]  # transparent where nobody is
        out = (out * (1 - alpha) + color * alpha).astype(np.uint8)
    if count is not None:
        label = f"People: {count}"
        cv2.rectangle(out, (8, 8), (16 + 13 * len(label), 40), (0, 0, 0), -1)
        cv2.putText(out, label, (14, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
    return out

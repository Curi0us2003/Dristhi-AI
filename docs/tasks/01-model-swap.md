# 01 — Swap in the OpenCV people counter

**Branch:** `feat/opencv-counter` · **Depends on:** 00 · **Size:** medium
**Owner:** ML engineer (model) + backend engineer (integration)

## Prompt

```
Read CLAUDE.md, docs/architecture.md and docs/tasks/01-model-swap.md, then do task 01.
The model is: <Hugging Face URL>, revision <commit hash>, file <file name>. Licence: <licence>.
```

The teammate fills in the second line. If it is missing, ask for it before changing code.

## Goal

Replace YOLOv8 + PyTorch with the OpenCV-based model behind one function, so the detector can
change again later without touching the rest of the backend, and the Docker image gets much smaller.

## Steps

1. Create the package `backend/dristhi/` (with `__init__.py`) and `backend/dristhi/detection/counter.py` exposing:
   - `load_model() -> None`: loads the model once from `MODEL_PATH` (env var, default
     `backend/models/<file>`), warms it up on a blank 320×240 frame.
   - `count_people(frame) -> int`: returns the number of people in a BGR frame.
   - `detect_people(frame) -> list[tuple[int, int, int, int, float]]`: boxes `(x, y, w, h, score)`;
     `count_people` uses it. Task 10 needs the boxes.
   - If the model fails to load, log it and fall back to the existing OpenCV contour method
     (`detect_persons_fallback` in `app.py`; move it into this module).
2. Load the model with OpenCV only (for example `cv2.dnn.readNet` for ONNX). Follow the model
   card for input size, normalisation, the person class id and the score / NMS thresholds;
   put those in module constants with a comment pointing to the model card.
3. In `backend/app.py`: remove the `torch.load` patch, the `ultralytics` import and the YOLO
   loading block; call `load_model()` at startup and `count_people(frame)` inside
   `FeedProcessor._process_feed`. `/api/health` `model` reports `"opencv"` or `"fallback"`.
4. Model file: add `backend/scripts/fetch_model.py` that downloads the pinned revision from
   Hugging Face into `backend/models/` (use `huggingface_hub.hf_hub_download` with
   `revision=`). Call it in the Dockerfile at build time. Add `backend/models/` to `.gitignore`
   unless the file is under 20 MB and the licence allows committing it.
5. Dependencies: remove `ultralytics` from `requirements.txt`; remove the PyTorch install line
   from the `Dockerfile`; add `huggingface_hub`. Delete `backend/yolov8n.pt` from the repo.
6. Add `backend/scripts/benchmark_counter.py`: runs the counter over the first 300 frames of
   each feed in `feeds.json` and prints average count and frames per second, so the team can
   compare with the old model.
7. Add `backend/tests/test_counter.py` (pytest): a blank frame returns 0; the function returns
   an `int`; a missing model file triggers the fallback without raising.
8. Update the deploy scripts to `--cpu 1 --memory 2Gi` and note in the README that `--cpu 2
   --memory 4Gi` is the fallback if counting is slow.

## Scope

In: detection module, app wiring, Docker image, scripts, tests. Out: database, API changes.

## Acceptance criteria

- `docker build` succeeds and the image has no `torch` package (`pip show torch` fails inside it).
- `/api/health` shows `"model": "opencv"` and `/api/feeds` shows counts after about 10 s.
- The benchmark script runs and prints one line per feed.

## Verify

```
cd backend && pip install -r requirements.txt pytest && pytest -q
docker build -t dristhi-backend backend && docker run --rm dristhi-backend pip show torch   # must fail
```

## HUMAN

- ML engineer: confirm the licence allows commercial use and share the URL, revision and file name.
- Compare the benchmark output with the old model on the demo videos and sign off on accuracy.

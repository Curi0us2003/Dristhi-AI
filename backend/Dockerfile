FROM python:3.10-slim

# System libraries required by OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CPU-only PyTorch keeps the image ~2 GB smaller than the default CUDA build
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# app.py, feeds.json, yolov8n.pt and any local videos/ (see .dockerignore)
COPY . .

ENV ENV=production \
    PORT=8080 \
    PYTHONUNBUFFERED=1
EXPOSE 8080
CMD ["python", "app.py"]

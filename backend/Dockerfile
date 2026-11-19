FROM python:3.10-slim

# System libraries required by OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the DM-Count model into the image so cold starts don't download it
ENV HF_HOME=/app/.hf-cache
RUN python -c "from huggingface_hub import hf_hub_download as d; d('mlboydaisuke/DM-Count-Crowd-OpenVINO','dmcount.onnx')"

# app.py, crowd_counter.py, feeds.json and any local videos/ (see .dockerignore)
COPY . .

ENV ENV=production \
    PORT=8080 \
    PYTHONUNBUFFERED=1
EXPOSE 8080
CMD ["python", "app.py"]

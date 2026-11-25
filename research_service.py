"""Local, research-only inference service for the FracAtlas localization model."""

from io import BytesIO
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError


ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "models" / "yolov8_localization_fractureAtlas.pt"
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000

app = FastAPI(title="RadVision Research Inference", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8000", "http://localhost:8000"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

_model = None
_model_lock = Lock()


def get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                if not MODEL_PATH.is_file():
                    raise HTTPException(status_code=503, detail="FracAtlas model weights are not installed.")
                try:
                    from ultralytics import YOLO

                    _model = YOLO(str(MODEL_PATH))
                except Exception as exc:
                    raise HTTPException(status_code=503, detail="Could not load the research model. Check the local Python dependencies and model file.") from exc
    return _model


@app.get("/health")
def health():
    return {"service": "research-only", "model_available": MODEL_PATH.is_file()}


@app.post("/predict")
def predict(file: UploadFile = File(...)):
    if file.content_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise HTTPException(status_code=415, detail="Upload a PNG, JPEG, or WebP image.")
    payload = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 20 MB research limit.")
    try:
        image = Image.open(BytesIO(payload))
        width, height = image.size
        if width < 64 or height < 64 or width * height > MAX_IMAGE_PIXELS:
            raise HTTPException(status_code=413, detail="Image dimensions are outside the research service limits.")
        image = image.convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=415, detail="Could not decode the uploaded image.") from exc

    model = get_model()
    try:
        output = model.predict(source=image, imgsz=640, conf=0.25, device="cpu", verbose=False)[0]
    except Exception as exc:
        raise HTTPException(status_code=422, detail="The research model could not process this image.") from exc

    boxes = []
    if output.boxes is not None:
        for xyxy, confidence in zip(output.boxes.xyxy.cpu().tolist(), output.boxes.conf.cpu().tolist()):
            x1, y1, x2, y2 = xyxy
            boxes.append({
                "x1": max(0.0, min(1.0, x1 / width)),
                "y1": max(0.0, min(1.0, y1 / height)),
                "x2": max(0.0, min(1.0, x2 / width)),
                "y2": max(0.0, min(1.0, y2 / height)),
                "confidence": float(confidence),
            })
    return {"model": "FracAtlas YOLOv8s localization", "boxes": boxes}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8765, access_log=False, log_level="warning")

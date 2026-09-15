# Build context must be the repo root (not webapp/backend), because main.py loads the 3
# live-inference models from ../../models relative to itself (see SRC_MODELS_DIR in main.py) —
# a path that only exists outside webapp/backend. Deploy with:
#   fly deploy   # from the repo root, where fly.toml lives and points at this Dockerfile

FROM python:3.11.9-slim

WORKDIR /app/webapp/backend

COPY webapp/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY webapp/backend/ .
COPY models/xgb_best.pkl models/xgb_isotonic.pkl models/lr_best.pkl /app/models/

EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]

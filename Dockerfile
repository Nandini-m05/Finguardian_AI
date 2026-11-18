# FinGuardian AI - backend image (FastAPI + LangGraph + FinBERT + XGBoost)
# Same code and models as local; only packaged for Google Cloud Run.
#
# Build:  docker build -t <dockerhub-user>/finguardian-api:latest .
# Run:    docker run --env-file .env -p 8080:8080 <dockerhub-user>/finguardian-api:latest

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/opt/hf-cache \
    PORT=8080

WORKDIR /app

# libgomp1: OpenMP runtime needed by xgboost / scikit-learn wheels
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first, so code changes don't reinstall torch every build
COPY requirements.txt .
RUN pip install -r requirements.txt

# Bake FinBERT (~440 MB) into the image: a Cloud Run cold start then loads
# it from disk instead of downloading it from Hugging Face every time.
RUN python -c "from transformers import pipeline; pipeline('sentiment-analysis', model='ProsusAI/finbert')"

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .

# Model is already on disk - never phone home at runtime
ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1

RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser /app /opt/hf-cache
USER appuser

EXPOSE 8080

# --proxy-headers: Cloud Run sits behind Google's front end; this makes the
# rate limiter see the real client IP instead of the proxy's.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]

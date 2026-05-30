FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY brokers.json ./brokers.json
COPY app ./app

RUN mkdir -p /app/data

ENV DATABASE_URL=sqlite:////app/data/gmeter.db
ENV CORS_ORIGINS=http://localhost:5173,http://localhost:3000

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD curl -f http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

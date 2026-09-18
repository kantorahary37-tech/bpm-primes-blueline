# Backend Dockerfile (stable)
FROM python:3.10.18-slim

WORKDIR /app/

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the wait script and the application
COPY wait_for_db.py .
COPY . .

# Expose the port
EXPOSE 8000

# Wait for DB then start
CMD ["sh", "-c", "python wait_for_db.py && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]

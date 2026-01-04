# Use Python slim image
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1

# Set working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY . .

# Ensure logs directory exists
RUN mkdir -p logs

# Expose any ports if needed (none for siem_node)

# Set entrypoint
CMD ["python", "main.py"]
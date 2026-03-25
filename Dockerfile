FROM python:3.13-slim
 
# Install system dependencies for WeasyPrint
RUN apt-get update && apt-get install -y \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    libglib2.0-0 \
    fontconfig \
    fonts-liberation \
    curl \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*
 
WORKDIR /app
 
# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
 
# Build frontend
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install
 
COPY frontend/ ./frontend/
RUN cd frontend && npm run build && \
    cp -r dist/assets ../static/ && \
    cp dist/index.html ../templates/index.html
 
# Copy the rest of the project
COPY . .
 
# Collect static files
RUN python manage.py collectstatic --noinput
 
EXPOSE 8080
 
CMD ["gunicorn", "shift.wsgi:application", "--bind", "0.0.0.0:8080"]
 
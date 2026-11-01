# WindDesk — single-container build.
# Stage 1 builds the React frontend; stage 2 serves the FastAPI API and the
# built frontend from one Python process on port 8000.
#
# Build & run:  docker build -t winddesk . && docker run -p 8000:8000 winddesk
# Then open http://localhost:8000

FROM node:24-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/main.py ./
COPY data/actuals_wind.csv data/forecast_earliest.csv data/forecast_latest.csv ./data/
COPY --from=frontend-build /frontend/dist ./static
ENV DATA_DIR=/app/data STATIC_DIR=/app/static
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

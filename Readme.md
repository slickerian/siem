# SIEM Dashboard

A real-time Security Information and Event Management (SIEM) dashboard built with **FastAPI**, **React**, and **Recharts**.

## Features

- Real-time log streaming via WebSocket
- Interactive event histograms and timeseries charts
- Search and filter logs in the frontend
- Backend-driven calculations for charts
- Severity badges for event types
- Responsive UI
- Includes a **node** that runs on Linux and sends logs to this Windows machine server

## Tech Stack

- **Backend:** FastAPI, SQLite, WebSocket, Pydantic  
- **Frontend:** React, TypeScript, TanStack Table, Recharts, Lucide-react, Tailwind CSS  

## Project Structure

- **Frontend:** React components for displaying logs, charts, and statistics  
- **Backend:** FastAPI server handling API requests, real-time WebSocket connections, and log calculations  
- **Node:** Linux-based node that collects logs and sends them to the Windows server  

## Future Improvements

- User authentication and role-based access  
- Support multiple log sources  
- Export charts and logs to CSV or PDF  
- Advanced filtering and alerting system  

// src/services/siemApi.ts
// ✅ SIEM API Service - connects to the Python FastAPI backend

const API_BASE_URL = 'http://localhost:8000'; // Frontend talks to backend on localhost

export interface LogEntry {
  id: number;
  created_at: string;
  event_type: string;
  data: string;
}

export interface StatsResponse {
  histogram: Array<{
    event_type: string;
    count: number;
  }>;
  timeseries: Array<{
    bucket: string;
    count: number;
  }>;
  start: string;
  end: string;
}

export interface LogsResponse {
  total: number;
  items: LogEntry[];
}

export class SiemApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'SiemApiError';
  }
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new SiemApiError(`API request failed: ${response.statusText}`, response.status);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof SiemApiError) {
      throw error;
    }
    throw new SiemApiError(
      `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export const siemApi = {
  // 🔹 Fetch logs with filters and pagination
  async getLogs(params: {
    limit?: number;
    offset?: number;
    event_type?: string;
    q?: string;
    start?: string;
    end?: string;
  } = {}): Promise<LogsResponse> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, value.toString());
      }
    });

    const queryString = searchParams.toString();
    return apiRequest<LogsResponse>(`/api/logs${queryString ? `?${queryString}` : ''}`);
  },

  // 🔹 Fetch statistics and charts data
  async getStats(params: {
    event_type?: string;
    q?: string;
    start?: string;
    end?: string;
    bucket_minutes?: number;
  } = {}): Promise<StatsResponse> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, value.toString());
      }
    });

    const queryString = searchParams.toString();
    return apiRequest<StatsResponse>(`/api/stats${queryString ? `?${queryString}` : ''}`);
  },

  // 🔹 Export logs as CSV
  getExportUrl(params: {
    event_type?: string;
    q?: string;
    start?: string;
    end?: string;
  } = {}): string {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, value.toString());
      }
    });

    const queryString = searchParams.toString();
    return `${API_BASE_URL}/export.csv${queryString ? `?${queryString}` : ''}`;
  },

  // 🔹 Health check
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/logs?limit=1`);
      return response.ok;
    } catch {
      return false;
    }
  },

  // 🔹 WebSocket connection for live log updates
  connectWebSocket(onMessage: (log: LogEntry) => void): WebSocket {
    const wsUrl = API_BASE_URL.replace('http', 'ws') + '/ws/logs';
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const log = JSON.parse(event.data) as LogEntry;
        onMessage(log);
      } catch (err) {
        console.error('WebSocket parse error:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    return ws;
  },
};

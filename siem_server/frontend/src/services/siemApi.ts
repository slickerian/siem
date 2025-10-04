// src/services/siemApi.ts
const API_BASE_URL = import.meta.env.VITE_SIEM_API_URL || 'http://localhost:8000';

export interface LogEntry {
  id: number;
  created_at: string;
  event_type: string;
  data: string;
  total?: number;
  critical?: number;
  last24h?: number;
  avgPerHour?: number;
}


export interface StatsResponse {
  histogram: Array<{ event_type: string; count: number }>;
  timeseries: Array<{ bucket: string; count: number }>;
  start: string;
  end: string;
}

export interface LogsResponse {
  total: number;
  critical: number;
  last24h: number;
  avgPerHour: number;
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
    if (!response.ok) throw new SiemApiError(response.statusText, response.status);
    return await response.json();
  } catch (error) {
    if (error instanceof SiemApiError) throw error;
    throw new SiemApiError(`Network error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}

function buildQuery(params: Record<string, any>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') searchParams.append(k, v.toString());
  });
  return searchParams.toString();
}

export const siemApi = {
  async getLogs(params: {
    limit?: number;
    offset?: number;
    event_type?: string;
    q?: string;
    start?: string;
    end?: string;
  } = {}): Promise<LogsResponse> {
    const query = buildQuery(params);
    return apiRequest<LogsResponse>(`/api/logs${query ? `?${query}` : ''}`);
  },

  async getStats(params: {
    event_type?: string;
    q?: string;
    start?: string;
    end?: string;
    bucket_minutes?: number;
  } = {}): Promise<StatsResponse> {
    const query = buildQuery(params);
    return apiRequest<StatsResponse>(`/api/stats${query ? `?${query}` : ''}`);
  },

  getExportUrl(params: { event_type?: string; q?: string; start?: string; end?: string } = {}) {
    const query = buildQuery(params);
    return `${API_BASE_URL}/export.csv${query ? `?${query}` : ''}`;
  },

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/logs?limit=1`);
      return response.ok;
    } catch {
      return false;
    }
  },

  connectWebSocket(onMessage: (log: LogEntry) => void): WebSocket {
    const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + '/ws/logs';
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const log = JSON.parse(event.data) as LogEntry;
        onMessage(log);
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };

    ws.onerror = (err) => console.error('WebSocket error:', err);

    return ws;
  },
};

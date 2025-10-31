// src/services/siemApi.ts
const API_BASE_URL = import.meta.env.VITE_SIEM_API_URL || 'http://localhost:8000';

export interface LogEntry {
  id: number;
  node_id: string;
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

export interface NodeStatus {
  node_id: string;
  online: boolean;
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
    node_id?: string;
    event_type?: string;
    q?: string;
    start?: string;
    end?: string;
  } = {}): Promise<LogsResponse> {
    const query = buildQuery(params);
    return apiRequest<LogsResponse>(`/api/logs${query ? `?${query}` : ''}`);
  },

  async getStats(params: {
    node_id?: string;
    event_type?: string;
    q?: string;
    start?: string;
    end?: string;
    bucket_minutes?: number;
  } = {}): Promise<StatsResponse> {
    const query = buildQuery(params);
    return apiRequest<StatsResponse>(`/api/stats${query ? `?${query}` : ''}`);
  },

  async getNodes(): Promise<NodeStatus[]> {
    return apiRequest<NodeStatus[]>('/api/nodes');
  },

  getExportUrl(params: { node_id?: string; event_type?: string; q?: string; start?: string; end?: string } = {}) {
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
    let ws: WebSocket;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 1000; // Start with 1 second

    const connect = () => {
      console.log(`[WS] Connecting to ${wsUrl} (attempt ${reconnectAttempts + 1})`);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WS] Connection established');
        reconnectAttempts = 0; // Reset on successful connection
      };

      ws.onmessage = (event) => {
        try {
          const log = JSON.parse(event.data) as LogEntry;
          onMessage(log);
        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('[WS] WebSocket error:', err);
      };

      ws.onclose = (event) => {
        console.log(`[WS] Connection closed: ${event.code} ${event.reason}`);

        // Attempt reconnection if not a normal closure and under max attempts
        if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = reconnectDelay * Math.pow(2, reconnectAttempts - 1); // Exponential backoff
          console.log(`[WS] Attempting reconnection in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);

          setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectAttempts >= maxReconnectAttempts) {
          console.error('[WS] Max reconnection attempts reached');
        }
      };
    };

    connect();
    return ws;
  },
};

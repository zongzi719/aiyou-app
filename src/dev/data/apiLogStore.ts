export interface ApiLogEntry {
  id: string;
  timestamp: number;
  method: string;
  path: string;
  requestBody?: unknown;
  status: number;
  duration: number;
  responseBody?: unknown;
  success: boolean;
  error?: string;
}

const MAX_LOGS = 200;
let logs: ApiLogEntry[] = [];
let idCounter = 0;

export function addApiLog(entry: Omit<ApiLogEntry, 'id'>) {
  const log: ApiLogEntry = { ...entry, id: String(++idCounter) };
  logs = [log, ...logs].slice(0, MAX_LOGS);
}

export function getApiLogs(): ApiLogEntry[] {
  return logs;
}

export function clearApiLogs() {
  logs = [];
}

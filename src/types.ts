export interface DBStatus {
  status: "connected" | "error" | "loading";
  message?: string;
  config?: {
    host: string;
    database: string;
    user: string;
  };
}

export interface ColumnInfo {
  field: string;
  type: string;
  null: string;
  key: string;
  default: string | null;
  extra: string;
}

export interface TableInfo {
  tableName: string;
  columns: ColumnInfo[];
  totalRows: number;
}

export interface TableDataResponse {
  tableName: string;
  rows: Record<string, any>[];
  limit: number;
  offset: number;
  filteredTotal: number | null;
}

export interface CityParkingAggregate {
  city: string;
  free: number;
  total: number;
  active_count: number;
}

export interface DashboardStats {
  citiesCount: number;
  parkhaeuserCount: number;
  weatherForecastsCount: number;
  localEventsCount: number;
  totalFetchesCount: number;
  errorLogsCount: number;
  cityParkingAggregates: CityParkingAggregate[];
  latestFetchTimestamp: string | null;
  latestFetches: Record<string, any>[];
  latestLogs: Record<string, any>[];
}

export interface LogTrendDataPoint {
  timeLabel: string;
  rawTimestamp: string;
  total: number;
  error: number;
  warning: number;
  info: number;
  cityBreakdown: Record<string, { error: number; warning: number; info: number; total: number }>;
}

export interface CityLogSummary {
  cityKey: string;
  displayName: string;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  totalLogs: number;
}

export interface LogTrendResponse {
  timeSeries: LogTrendDataPoint[];
  cityList: { key: string; name: string }[];
  citySummaries: CityLogSummary[];
  totalLogsCount: number;
  logs: Record<string, any>[];
}


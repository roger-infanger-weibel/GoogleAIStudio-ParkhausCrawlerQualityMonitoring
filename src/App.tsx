import React, { useState, useEffect } from "react";
import {
  Database,
  Table as TableIcon,
  Terminal,
  Activity,
  AlertTriangle,
  Compass,
  Home,
  CloudSun,
  Calendar,
  Link2,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  CheckCircle,
  XCircle,
  HelpCircle,
  Filter,
  Layers,
  ArrowRight,
  TrendingUp
} from "lucide-react";
import LogTrendsView from "./components/LogTrendsView";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { DBStatus, TableInfo, TableDataResponse, DashboardStats } from "./types";

export default function App() {
  // Navigation State
  // "dashboard" | "sandbox" | string (tableName)
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  // DB Connection & Table List States
  const [dbStatus, setDbStatus] = useState<DBStatus>({ status: "loading" });
  const [tables, setTables] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState<boolean>(true);

  // Dashboard Stats States
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState<boolean>(true);

  // Active Table View States
  const [selectedTableInfo, setSelectedTableInfo] = useState<TableInfo | null>(null);
  const [selectedTableData, setSelectedTableData] = useState<TableDataResponse | null>(null);
  const [loadingTableDetail, setLoadingTableDetail] = useState<boolean>(false);
  const [tableDataTab, setTableDataTab] = useState<"rows" | "schema">("rows");

  // Pagination & Filtering States
  const [limit, setLimit] = useState<number>(25);
  const [offset, setOffset] = useState<number>(0);
  const [searchField, setSearchField] = useState<string>("");
  const [searchValue, setSearchValue] = useState<string>("");
  const [appliedSearchField, setAppliedSearchField] = useState<string>("");
  const [appliedSearchValue, setAppliedSearchValue] = useState<string>("");

  // SQL Sandbox States
  const [sandboxQuery, setSandboxQuery] = useState<string>(
    "SELECT * FROM pls_fetch_current ORDER BY fetch_ts DESC LIMIT 5"
  );
  const [sandboxResult, setSandboxResult] = useState<{
    rows: any[];
    columns: string[];
    error?: string;
  } | null>(null);
  const [runningQuery, setRunningQuery] = useState<boolean>(false);

  // Notification Banner
  const [notification, setNotification] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Auto-refresh interval (for logs/fetches)
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // UTC Live Clock State
  const [liveUtcTime, setLiveUtcTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setLiveUtcTime(now.toISOString().replace("T", " ").substring(0, 19) + " UTC");
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch tables and db-status on mount
  useEffect(() => {
    async function fetchInitialData() {
      setLoadingTables(true);
      try {
        const statusRes = await fetch("/api/db-status");
        const statusData = await statusRes.json();
        setDbStatus(statusData);

        if (statusRes.ok) {
          const tablesRes = await fetch("/api/tables");
          const tablesData = await tablesRes.json();
          setTables(tablesData.tables || []);
        } else {
          setDbStatus({ status: "error", message: statusData.message || "Fehler beim Verbinden der DB." });
        }
      } catch (err: any) {
        setDbStatus({ status: "error", message: err.message || "Netzwerkfehler" });
      } finally {
        setLoadingTables(false);
      }
    }
    fetchInitialData();
  }, [refreshKey]);

  // Fetch Dashboard Stats
  useEffect(() => {
    if (dbStatus.status !== "connected") return;
    async function fetchDashboardStats() {
      setLoadingStats(true);
      try {
        const statsRes = await fetch("/api/dashboard-stats");
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }
      } catch (err) {
        console.error("Fehler beim Laden der Statistiken:", err);
      } finally {
        setLoadingStats(false);
      }
    }
    fetchDashboardStats();
  }, [dbStatus.status, refreshKey]);

  // Fetch Table Detail when tab changes or page/search updates
  useEffect(() => {
    if (activeTab === "dashboard" || activeTab === "sandbox" || dbStatus.status !== "connected") {
      setSelectedTableInfo(null);
      setSelectedTableData(null);
      return;
    }

    async function fetchTableData() {
      setLoadingTableDetail(true);
      try {
        // Fetch schema details
        const infoRes = await fetch(`/api/tables/${activeTab}`);
        const infoData = await infoRes.json();
        if (infoRes.ok) {
          setSelectedTableInfo(infoData);
          if (infoData.columns && infoData.columns.length > 0 && !searchField) {
            setSearchField(infoData.columns[0].field);
          }
        }

        // Fetch paginated data rows
        let dataUrl = `/api/tables/${activeTab}/data?limit=${limit}&offset=${offset}`;
        if (appliedSearchField && appliedSearchValue) {
          dataUrl += `&searchField=${encodeURIComponent(appliedSearchField)}&searchValue=${encodeURIComponent(appliedSearchValue)}`;
        }

        const dataRes = await fetch(dataUrl);
        const dataJson = await dataRes.json();
        if (dataRes.ok) {
          setSelectedTableData(dataJson);
        }
      } catch (err: any) {
        showToast(`Fehler beim Laden von Tabelle ${activeTab}: ${err.message}`, "error");
      } finally {
        setLoadingTableDetail(false);
      }
    }

    fetchTableData();
  }, [activeTab, limit, offset, appliedSearchField, appliedSearchValue, dbStatus.status, refreshKey]);

  // Reset pagination filters on table shift
  const handleTableSelect = (tableName: string) => {
    setActiveTab(tableName);
    setOffset(0);
    setSearchField("");
    setSearchValue("");
    setAppliedSearchField("");
    setAppliedSearchValue("");
  };

  const showToast = (text: string, type: "success" | "error" | "info" = "info") => {
    setNotification({ text, type });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Run custom SQL query
  const handleExecuteQuery = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!sandboxQuery.trim()) return;

    setRunningQuery(true);
    setSandboxResult(null);
    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sandboxQuery })
      });
      const data = await response.json();
      if (response.ok) {
        setSandboxResult({
          rows: data.rows || [],
          columns: data.columns || []
        });
        showToast("SQL Query erfolgreich ausgeführt", "success");
      } else {
        setSandboxResult({
          rows: [],
          columns: [],
          error: data.error || "Fehler bei der Query-Ausführung"
        });
        showToast(data.error || "Fehler beim Ausführen der Query", "error");
      }
    } catch (err: any) {
      setSandboxResult({
        rows: [],
        columns: [],
        error: err.message || "Serverfehler"
      });
      showToast(err.message || "Verbindungsfehler zum Server", "error");
    } finally {
      setRunningQuery(false);
    }
  };

  // Apply search filtering
  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    setAppliedSearchField(searchField);
    setAppliedSearchValue(searchValue);
  };

  // Clear search filtering
  const handleClearFilter = () => {
    setSearchValue("");
    setAppliedSearchField("");
    setAppliedSearchValue("");
    setOffset(0);
  };

  // CSV Exporter
  const handleExportCSV = (tableName: string, dataRows: Record<string, any>[]) => {
    if (!dataRows || dataRows.length === 0) return;
    const headers = Object.keys(dataRows[0]);
    const csvContent = [
      headers.join(";"),
      ...dataRows.map((row) =>
        headers
          .map((fieldName) => {
            let cell = row[fieldName];
            if (cell === null || cell === undefined) return "";
            if (typeof cell === "object") cell = JSON.stringify(cell);
            // Escape double quotes & semicolons
            const cellStr = String(cell).replace(/"/g, '""');
            return cellStr.includes(";") || cellStr.includes("\n") || cellStr.includes('"')
              ? `"${cellStr}"`
              : cellStr;
          })
          .join(";")
      )
    ].join("\n");

    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${tableName}_export.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`${dataRows.length} Zeilen exportiert!`, "success");
  };

  // Icon Matcher helper
  const getTableIcon = (tableName: string) => {
    const name = tableName.toLowerCase();
    if (name === "cities") return <Compass className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    if (name === "parkhaeuser") return <Home className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
    if (name === "weather_forecasts") return <CloudSun className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    if (name === "local_events") return <Calendar className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
    if (name === "event_parkhaus") return <Link2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
    if (name === "pls_fetch_current") return <Activity className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
    if (name === "log") return <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0" />;
    return <TableIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
  };

  // Color Mapping for severities in log
  const getSeverityBadge = (severity: string) => {
    const sev = severity.toUpperCase().trim();
    if (sev.includes("E") || sev.includes("ERR")) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-red-950 text-red-400 border border-red-800/60 uppercase">
          Error
        </span>
      );
    }
    if (sev.includes("W") || sev.includes("WARN")) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 text-amber-400 border border-amber-800/60 uppercase">
          Warning
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-950 text-blue-400 border border-blue-800/60 uppercase">
        Info
      </span>
    );
  };

  return (
    <div className="flex flex-col w-full min-h-screen bg-[#0F1115] text-[#E0E0E0] font-sans overflow-hidden">
      
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.95 }}
            className={`fixed top-4 right-4 z-50 p-3.5 rounded-lg shadow-2xl border flex items-center gap-2.5 max-w-md font-mono text-xs ${
              notification.type === "success"
                ? "bg-[#11241C] border-emerald-800/80 text-emerald-300"
                : notification.type === "error"
                ? "bg-[#291415] border-rose-800/80 text-rose-300"
                : "bg-[#131B2A] border-blue-800/80 text-blue-300"
            }`}
          >
            {notification.type === "success" ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : notification.type === "error" ? (
              <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            ) : (
              <Layers className="w-4 h-4 text-blue-400 flex-shrink-0" />
            )}
            <div className="font-medium">{notification.text}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header: Database Connectivity Info */}
      <header className="flex flex-wrap items-center justify-between px-6 py-3 border-b border-[#2A2D35] bg-[#16191E] gap-4">
        <div className="flex items-center gap-5">
          {/* Connection status tag */}
          <div className="flex items-center gap-2">
            {dbStatus.status === "loading" ? (
              <>
                <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] animate-pulse"></div>
                <span className="text-xs font-mono font-bold tracking-wider text-amber-500 uppercase">Connecting...</span>
              </>
            ) : dbStatus.status === "connected" ? (
              <>
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
                <span className="text-xs font-mono font-bold tracking-wider text-emerald-500 uppercase">Connected</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"></div>
                <span className="text-xs font-mono font-bold tracking-wider text-rose-500 uppercase">Offline</span>
              </>
            )}
          </div>

          <h1 className="text-xs font-mono text-[#8E9299]">
            DB_HOST: <span className="text-white font-bold">{dbStatus.config?.host || "parkhaus.roil.ch"}</span>
          </h1>
          <h2 className="text-xs font-mono text-[#8E9299]">
            DATABASE: <span className="text-white uppercase font-bold">{dbStatus.config?.database || "PH_FETCH_TEST"}</span>
          </h2>
        </div>

        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setRefreshKey((k) => k + 1);
                showToast("System- & Sensor-Daten aktualisiert", "success");
              }}
              title="Daten manuell refreshen"
              className="p-1.5 text-[#8E9299] hover:text-white hover:bg-[#23272E] rounded border border-[#2A2D35] transition-colors flex items-center gap-1.5 text-xs font-mono"
            >
              <RefreshCw className="w-3 h-3" />
              <span>SYNC</span>
            </button>
          </div>
          
          <div className="h-8 w-px bg-[#2A2D35]"></div>

          <div className="flex flex-col items-end">
            <span className="text-[10px] text-[#5C616A] uppercase tracking-tighter">Character Set</span>
            <span className="text-xs font-mono text-white">utf8mb4</span>
          </div>

          <div className="h-8 w-px bg-[#2A2D35]"></div>

          <div className="bg-[#23272E] px-3 py-1 rounded border border-[#2A2D35] text-[11px] font-mono text-white">
            USER: <span className="text-blue-400 font-semibold">{dbStatus.config?.user || "crawler_test"}</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Sidebar: Table Navigator */}
        <aside className="w-56 border-r border-[#2A2D35] bg-[#111318] flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-[#2A2D35] bg-[#16191E] flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#5C616A] uppercase tracking-widest">Navigation & Tables</span>
            {loadingTables && <RefreshCw className="w-3 h-3 animate-spin text-slate-500" />}
          </div>

          {/* Quick Views */}
          <div className="px-3 py-3 border-b border-[#2A2D35]/50 space-y-0.5">
            <span className="px-2 text-[9px] font-semibold text-[#5C616A] uppercase tracking-widest block mb-1">Overviews</span>
            
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-mono rounded transition-all text-left ${
                activeTab === "dashboard"
                  ? "bg-blue-500/10 text-blue-400 border-r-2 border-blue-500 font-bold"
                  : "text-[#8E9299] hover:bg-[#1C1F26] hover:text-white"
              }`}
            >
              <Activity className="w-3.5 h-3.5 shrink-0" />
              <span>DASHBOARD METRICS</span>
            </button>

            <button
              onClick={() => setActiveTab("log-trends")}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-mono rounded transition-all text-left ${
                activeTab === "log-trends"
                  ? "bg-blue-500/10 text-blue-400 border-r-2 border-blue-500 font-bold"
                  : "text-[#8E9299] hover:bg-[#1C1F26] hover:text-white"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>LOG SEVERITY TRENDS</span>
            </button>

            <button
              onClick={() => setActiveTab("sandbox")}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-mono rounded transition-all text-left ${
                activeTab === "sandbox"
                  ? "bg-blue-500/10 text-blue-400 border-r-2 border-blue-500 font-bold"
                  : "text-[#8E9299] hover:bg-[#1C1F26] hover:text-white"
              }`}
            >
              <Terminal className="w-3.5 h-3.5 shrink-0" />
              <span>SQL CONSOLE</span>
            </button>
          </div>

          {/* Table list */}
          <div className="flex-1 overflow-y-auto py-3 space-y-0.5">
            <span className="px-5 text-[9px] font-semibold text-[#5C616A] uppercase tracking-widest block mb-1.5">Tables ({tables.length})</span>
            {tables.length === 0 ? (
              <div className="px-5 text-xs text-[#5C616A] italic font-mono">
                {loadingTables ? "Fetching metadata..." : "No tables detected."}
              </div>
            ) : (
              tables.map((table) => {
                const isActive = activeTab === table;
                return (
                  <button
                    key={table}
                    onClick={() => handleTableSelect(table)}
                    className={`w-full flex items-center gap-2 px-4 py-2 text-xs font-mono rounded-none transition-all text-left ${
                      isActive
                        ? "bg-blue-500/10 text-blue-400 border-r-2 border-blue-500 font-bold"
                        : "text-[#8E9299] hover:bg-[#1C1F26] hover:text-white"
                    }`}
                  >
                    {getTableIcon(table)}
                    <span className="truncate">{table}</span>
                  </button>
                );
              })
            )}
          </div>

          {/* Disk usage bar at sidebar bottom */}
          <div className="p-4 border-t border-[#2A2D35] bg-[#16191E]">
            <div className="flex justify-between text-[10px] font-mono text-[#5C616A] mb-1">
              <span>DB INTEGRITY STATUS</span>
              <span className="text-emerald-500">99.8%</span>
            </div>
            <div className="w-full h-1 bg-[#2A2D35] rounded-full overflow-hidden">
              <div className="w-[99.8%] h-full bg-emerald-500"></div>
            </div>
          </div>
        </aside>

        {/* Workspace Area: styled dark grid container */}
        <main className="flex-1 bg-[#0F1115] overflow-y-auto p-5 space-y-5">
          <AnimatePresence mode="wait">
            
            {/* VIEW 1: Aggregated Dashboard */}
            {activeTab === "dashboard" && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-5"
              >
                {/* Database Connection Alert if Error */}
                {dbStatus.status === "error" && (
                  <div className="bg-[#291415] border border-rose-800/80 text-rose-300 rounded p-4 flex gap-3 items-start">
                    <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-bold text-rose-200 text-sm font-mono">CONNECTION FAILURE: db_host unreachable</h3>
                      <p className="text-xs text-rose-400 mt-1 font-mono">
                        Could not resolve or connect to <code className="bg-black/30 px-1 rounded text-rose-300">parkhaus.roil.ch</code>. Please review firewall whitelistings and verification configs.
                      </p>
                      <div className="bg-black/40 text-rose-400 p-2.5 rounded text-[11px] font-mono mt-2 break-all max-h-32 overflow-y-auto">
                        {dbStatus.message}
                      </div>
                    </div>
                  </div>
                )}

                {/* High-density Metrics Highlights Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  
                  {/* Cities Count Card */}
                  <div className="bg-[#16191E] border border-[#2A2D35] p-4 rounded flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono font-bold text-[#5C616A] uppercase tracking-wider block">Cities Metadata</span>
                      <h3 className="text-2xl font-mono font-bold text-white">
                        {loadingStats ? (
                          <span className="text-[#5C616A] animate-pulse">--</span>
                        ) : (
                          stats?.citiesCount || 0
                        )}
                      </h3>
                      <p className="text-[10px] font-mono text-[#8E9299]">Active region nodes</p>
                    </div>
                    <div className="p-2 bg-emerald-500/10 rounded border border-emerald-800/40 text-emerald-400">
                      <Compass className="w-5 h-5" />
                    </div>
                  </div>

                  {/* Parkhaeuser Count Card */}
                  <div className="bg-[#16191E] border border-[#2A2D35] p-4 rounded flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono font-bold text-[#5C616A] uppercase tracking-wider block">Parking Stations</span>
                      <h3 className="text-2xl font-mono font-bold text-white">
                        {loadingStats ? (
                          <span className="text-[#5C616A] animate-pulse">--</span>
                        ) : (
                          stats?.parkhaeuserCount || 0
                        )}
                      </h3>
                      <p className="text-[10px] font-mono text-[#8E9299]">Registered facilities</p>
                    </div>
                    <div className="p-2 bg-sky-500/10 rounded border border-sky-800/40 text-sky-400">
                      <Home className="w-5 h-5" />
                    </div>
                  </div>

                  {/* Total Fetches Card */}
                  <div className="bg-[#16191E] border border-[#2A2D35] p-4 rounded flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono font-bold text-[#5C616A] uppercase tracking-wider block">Sensor Telemetry</span>
                      <h3 className="text-2xl font-mono font-bold text-white">
                        {loadingStats ? (
                          <span className="text-[#5C616A] animate-pulse">--</span>
                        ) : (
                          stats?.totalFetchesCount.toLocaleString("de-CH") || 0
                        )}
                      </h3>
                      <p className="text-[10px] font-mono text-[#8E9299]">pls_fetch_current records</p>
                    </div>
                    <div className="p-2 bg-indigo-500/10 rounded border border-indigo-800/40 text-indigo-400">
                      <Activity className="w-5 h-5" />
                    </div>
                  </div>

                  {/* Errors log count */}
                  <div className="bg-[#16191E] border border-[#2A2D35] p-4 rounded flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono font-bold text-[#5C616A] uppercase tracking-wider block">Severity Events</span>
                      <h3 className="text-2xl font-mono font-bold text-rose-500">
                        {loadingStats ? (
                          <span className="text-[#5C616A] animate-pulse">--</span>
                        ) : (
                          stats?.errorLogsCount || 0
                        )}
                      </h3>
                      <p className="text-[10px] font-mono text-[#8E9299]">System exception logs</p>
                    </div>
                    <div className="p-2 bg-rose-500/10 rounded border border-rose-800/40 text-rose-400">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                {/* Grid for Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  
                  {/* Chart Block: Bar charts of current capacities */}
                  <div className="bg-[#16191E] border border-[#2A2D35] p-5 rounded flex flex-col lg:col-span-2 space-y-3">
                    <div className="flex items-center justify-between border-b border-[#2A2D35] pb-2">
                      <div>
                        <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-1.5">
                          <span className="w-2 h-2 bg-blue-500 rounded-sm"></span>
                          Sensor Readouts (Capacities per City)
                        </h3>
                        <p className="text-[10px] text-[#8E9299] font-mono mt-0.5">
                          Latest crawler iteration{" "}
                          {stats?.latestFetchTimestamp && (
                            <span className="text-blue-400 font-bold bg-[#23272E] px-1.5 py-0.5 rounded ml-1">
                              {new Date(stats.latestFetchTimestamp).toLocaleString("de-CH")}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 border border-emerald-800/40 bg-emerald-500/10 text-emerald-400 rounded">
                        Active Stream
                      </span>
                    </div>

                    <div className="h-64 font-mono text-xs">
                      {loadingStats ? (
                        <div className="w-full h-full bg-[#0F1115] border border-dashed border-[#2A2D35] rounded flex items-center justify-center text-slate-500">
                          Fetching capacity metrics...
                        </div>
                      ) : !stats || stats.cityParkingAggregates.length === 0 ? (
                        <div className="w-full h-full border border-dashed border-[#2A2D35] rounded flex flex-col items-center justify-center p-6 text-center text-slate-500">
                          <HelpCircle className="w-8 h-8 text-slate-600 mb-1" />
                          <span className="text-xs font-semibold text-slate-400">No recent telemetries in pls_fetch_current</span>
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={stats.cityParkingAggregates.map((item) => ({
                              Stadt: item.city.toUpperCase(),
                              "Frei": item.free,
                              "Besetzt": Math.max(0, item.total - item.free)
                            }))}
                            margin={{ top: 15, right: 10, left: -25, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2A2D35" />
                            <XAxis dataKey="Stadt" stroke="#5C616A" fontSize={9} tickLine={false} />
                            <YAxis stroke="#5C616A" fontSize={9} tickLine={false} />
                            <Tooltip
                              contentStyle={{
                                background: "#16191E",
                                border: "1px solid #2A2D35",
                                borderRadius: "4px",
                                fontSize: "11px",
                                color: "#E0E0E0",
                                fontFamily: "monospace"
                              }}
                            />
                            <Legend wrapperStyle={{ fontSize: "10px", color: "#8E9299", paddingTop: "5px" }} />
                            <Bar dataKey="Frei" stackId="a" fill="#10b981" />
                            <Bar dataKey="Besetzt" stackId="a" fill="#334155" />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  {/* Summary Ratio Card */}
                  <div className="bg-[#16191E] border border-[#2A2D35] p-5 rounded flex flex-col justify-between space-y-4">
                    <div>
                      <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-1.5 border-b border-[#2A2D35] pb-2">
                        <span className="w-2 h-2 bg-purple-500 rounded-sm"></span>
                        Switzerland Occupancy Rate
                      </h3>
                      <p className="text-[10px] text-[#8E9299] font-mono mt-1">Aggregated ratio of available free compartments in the network.</p>
                    </div>

                    <div className="flex-1 flex items-center justify-center py-2">
                      {loadingStats ? (
                        <div className="h-24 w-24 rounded-full border-2 border-[#2A2D35] border-t-blue-500 animate-spin" />
                      ) : !stats || stats.cityParkingAggregates.length === 0 ? (
                        <div className="text-xs text-[#5C616A] italic font-mono">No data aggregated</div>
                      ) : (() => {
                          const totalCapacity = stats.cityParkingAggregates.reduce((acc, c) => acc + c.total, 0);
                          const totalFree = stats.cityParkingAggregates.reduce((acc, c) => acc + c.free, 0);
                          const occupied = totalCapacity - totalFree;
                          const occupiedPercent = totalCapacity > 0 ? Math.round((occupied / totalCapacity) * 100) : 0;
                          
                          const pieData = [
                            { name: "Frei", value: totalFree, color: "#10b981" },
                            { name: "Besetzt", value: occupied, color: "#ef4444" }
                          ];

                          return (
                            <div className="text-center space-y-3 w-full">
                              <div className="relative inline-flex items-center justify-center">
                                <ResponsiveContainer width={130} height={130}>
                                  <PieChart>
                                    <Pie
                                      data={pieData}
                                      innerRadius={45}
                                      outerRadius={55}
                                      paddingAngle={2}
                                      dataKey="value"
                                    >
                                      {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                      ))}
                                    </Pie>
                                  </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                  <span className="text-xl font-mono font-bold text-white">{occupiedPercent}%</span>
                                  <span className="text-[8px] text-[#5C616A] uppercase font-bold tracking-wider">Occupied</span>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-left bg-[#0F1115] p-2 rounded border border-[#2A2D35] text-[10px] font-mono">
                                <div className="border-r border-[#2A2D35] pr-2">
                                  <div className="flex items-center gap-1.5 text-[#8E9299]">
                                    <span className="w-2 h-2 rounded bg-emerald-500 shrink-0" />
                                    <span>FREE</span>
                                  </div>
                                  <div className="text-xs font-bold text-white mt-0.5">{totalFree.toLocaleString("de-CH")}</div>
                                </div>
                                <div className="pl-1">
                                  <div className="flex items-center gap-1.5 text-[#8E9299]">
                                    <span className="w-2 h-2 rounded bg-rose-500 shrink-0" />
                                    <span>OCCUPIED</span>
                                  </div>
                                  <div className="text-xs font-bold text-white mt-0.5">{occupied.toLocaleString("de-CH")}</div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                    </div>
                  </div>
                </div>

                {/* Dense Segment: Telemetry List & Live Logs */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                  
                  {/* Latest Crawler Fetches */}
                  <div className="bg-[#16191E] border border-[#2A2D35] rounded overflow-hidden xl:col-span-2 flex flex-col">
                    <div className="p-4 border-b border-[#2A2D35] flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-1.5">
                          <span className="w-2 h-2 bg-indigo-500 rounded-sm"></span>
                          pls_fetch_current (Latest sensor records)
                        </h3>
                        <p className="text-[10px] text-[#8E9299] font-mono mt-0.5">Real-time parsed payloads of regional feeds</p>
                      </div>
                      <button
                        onClick={() => handleTableSelect("pls_fetch_current")}
                        className="text-[10px] font-mono text-blue-400 hover:underline flex items-center gap-1"
                      >
                        <span>Inspect Raw</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="overflow-x-auto flex-1 max-h-72">
                      {loadingStats ? (
                        <div className="p-6 text-center text-[#5C616A] font-mono text-xs">Awaiting database readout...</div>
                      ) : !stats || stats.latestFetches.length === 0 ? (
                        <div className="p-6 text-center text-[#5C616A] font-mono text-xs italic">No crawler readings detected</div>
                      ) : (
                        <table className="w-full text-left border-collapse text-[11px] font-mono">
                          <thead>
                            <tr className="bg-[#111318] border-b border-[#2A2D35] text-[#8E9299]">
                              <th className="py-2 px-3 border-r border-[#2A2D35]">Timestamp</th>
                              <th className="py-2 px-3 border-r border-[#2A2D35]">City</th>
                              <th className="py-2 px-3 border-r border-[#2A2D35]">ID</th>
                              <th className="py-2 px-3 border-r border-[#2A2D35]">Name</th>
                              <th className="py-2 px-3 border-r border-[#2A2D35] text-right">Free / Total</th>
                              <th className="py-2 px-3 text-right">Load</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#2A2D35]">
                            {stats.latestFetches.map((fetchRow, idx) => {
                              const utilization = fetchRow.total > 0 
                                ? Math.round(((fetchRow.total - fetchRow.free) / fetchRow.total) * 100) 
                                : 0;
                              return (
                                <tr key={idx} className="hover:bg-[#1C1F26] transition-colors">
                                  <td className="py-1.5 px-3 text-[#8E9299] border-r border-[#2A2D35]">
                                    {new Date(fetchRow.fetch_ts).toISOString().replace("T", " ").substring(0, 19)}
                                  </td>
                                  <td className="py-1.5 px-3 text-[#E0E0E0] border-r border-[#2A2D35] uppercase font-bold">
                                    {fetchRow.city}
                                  </td>
                                  <td className="py-1.5 px-3 text-blue-400 border-r border-[#2A2D35] truncate max-w-[90px]" title={fetchRow.id}>
                                    {fetchRow.id}
                                  </td>
                                  <td className="py-1.5 px-3 text-white border-r border-[#2A2D35] truncate max-w-[150px]" title={fetchRow.name}>{fetchRow.name}</td>
                                  <td className="py-1.5 px-3 text-right border-r border-[#2A2D35] font-bold">
                                    <span className="text-emerald-400">{fetchRow.free}</span>
                                    <span className="text-slate-500 mx-1">/</span>
                                    <span className="text-slate-400">{fetchRow.total}</span>
                                  </td>
                                  <td className="py-1.5 px-3 text-right">
                                    <span className={`font-bold ${
                                      utilization > 90 
                                        ? "text-red-400" 
                                        : utilization > 60 
                                        ? "text-amber-400" 
                                        : "text-emerald-400"
                                    }`}>
                                      {utilization}%
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  {/* System log table preview */}
                  <div className="bg-[#16191E] border border-[#2A2D35] rounded overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-[#2A2D35] flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-1.5">
                          <span className="w-2 h-2 bg-orange-500 rounded-sm"></span>
                          tbl_log (System execution logs)
                        </h3>
                        <p className="text-[10px] text-[#8E9299] font-mono mt-0.5">Diagnostics & connection status</p>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[10px]">
                        <button
                          onClick={() => setActiveTab("log-trends")}
                          className="px-2 py-1 rounded bg-amber-500/10 border border-amber-800/40 text-amber-400 hover:bg-amber-500/20 flex items-center gap-1 font-bold"
                        >
                          <TrendingUp className="w-3 h-3" />
                          <span>City Trends</span>
                        </button>
                        <button
                          onClick={() => handleTableSelect("log")}
                          className="text-blue-400 hover:underline flex items-center gap-1"
                        >
                          <span>All logs</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="overflow-y-auto flex-1 max-h-72 divide-y divide-[#2A2D35]">
                      {loadingStats ? (
                        <div className="p-6 text-center text-[#5C616A] font-mono text-xs">Polling logs...</div>
                      ) : !stats || stats.latestLogs.length === 0 ? (
                        <div className="p-6 text-center text-[#5C616A] font-mono text-xs italic">Log stream empty</div>
                      ) : (
                        stats.latestLogs.map((logRow, idx) => (
                          <div key={idx} className="p-2.5 hover:bg-[#1C1F26] flex flex-col gap-1 transition-colors">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-mono text-[#5C616A]">
                                {new Date(logRow.timestamp).toISOString().replace("T", " ").substring(0, 19)}
                              </span>
                              {getSeverityBadge(logRow.severity)}
                            </div>
                            <p className="text-[#8E9299] break-all font-mono text-[10px] leading-normal bg-black/25 p-1.5 rounded border border-[#2A2D35]/50">
                              {logRow.text}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

              </motion.div>
            )}

            {/* VIEW 1.5: Log Severity Trends per City View */}
            {activeTab === "log-trends" && (
              <LogTrendsView onShowToast={showToast} refreshKey={refreshKey} />
            )}

            {/* VIEW 2: SQL Console Sandbox */}
            {activeTab === "sandbox" && (
              <motion.div
                key="sandbox"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="bg-[#16191E] border border-[#2A2D35] p-5 rounded space-y-4">
                  <div className="flex items-center gap-2.5 border-b border-[#2A2D35] pb-2">
                    <div className="bg-blue-500/10 p-1.5 rounded border border-blue-800/40 text-blue-400">
                      <Terminal className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-white uppercase tracking-widest">Interactive SQL Console</h3>
                      <p className="text-[10px] text-[#8E9299] font-mono">
                        Execute read-only queries against schema <code className="text-blue-400 font-bold bg-[#0F1115] px-1 rounded">ph_fetch_test</code>
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleExecuteQuery} className="space-y-3">
                    <div className="border border-[#2A2D35] rounded overflow-hidden shadow-2xl bg-black">
                      <div className="bg-[#16191E] px-4 py-2 flex items-center justify-between border-b border-[#2A2D35] text-[10px] text-[#5C616A] font-mono">
                        <span>Console Terminal Editor</span>
                        <span className="text-amber-400 font-bold uppercase tracking-wider">Read Only Mode (SELECT/SHOW)</span>
                      </div>
                      <textarea
                        value={sandboxQuery}
                        onChange={(e) => setSandboxQuery(e.target.value)}
                        placeholder="SELECT * FROM cities LIMIT 10"
                        className="w-full h-28 p-3 text-[#10B981] bg-[#0F1115] font-mono text-xs focus:outline-none resize-y"
                        style={{ tabSize: 2 }}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-mono text-[#5C616A]">
                        Dynamic catalogs:{" "}
                        <span className="space-x-1.5 font-bold">
                          {tables.slice(0, 5).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => {
                                setSandboxQuery(`SELECT * FROM ${t} LIMIT 10`);
                              }}
                              className="text-blue-400 hover:underline"
                            >
                              {t}
                            </button>
                          ))}
                        </span>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSandboxQuery(`SELECT c.name as City, p.name as Parking, f.free, f.total, f.fetch_ts
FROM pls_fetch_current f
JOIN parkhaeuser p ON f.id = p.id
JOIN cities c ON p.city_id = c.id
ORDER BY f.fetch_ts DESC LIMIT 10`);
                          }}
                          className="px-2.5 py-1.5 rounded border border-[#2A2D35] text-[10px] font-mono bg-[#23272E] text-[#8E9299] hover:text-white hover:bg-[#2A2D35] transition-colors"
                        >
                          LOAD JOIN TEMPLATE
                        </button>

                        <button
                          type="submit"
                          disabled={runningQuery}
                          className="px-4 py-1.5 rounded text-white font-mono text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 disabled:text-slate-600 disabled:shadow-none transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          {runningQuery ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Terminal className="w-3 h-3" />
                          )}
                          <span>RUN QUERY</span>
                        </button>
                      </div>
                    </div>
                  </form>
                </div>

                {/* SQL Result Console Output */}
                {sandboxResult && (
                  <div className="bg-[#16191E] border border-[#2A2D35] rounded overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-[#2A2D35] flex items-center justify-between bg-[#111318]">
                      <div>
                        <h4 className="font-bold text-white text-xs uppercase tracking-wider font-mono">Console Buffer Result</h4>
                        <p className="text-[9px] text-[#5C616A] font-mono mt-0.5">
                          {sandboxResult.rows.length === 0
                            ? "Empty set returned"
                            : `${sandboxResult.rows.length} rows inside buffered structure`}
                        </p>
                      </div>

                      {sandboxResult.rows.length > 0 && (
                        <button
                          onClick={() => handleExportCSV("sandbox_query", sandboxResult.rows)}
                          className="px-2.5 py-1.5 rounded border border-[#2A2D35] text-[10px] font-mono text-[#E0E0E0] bg-[#23272E] hover:bg-[#2A2D35] flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>EXPORT CSV</span>
                        </button>
                      )}
                    </div>

                    {sandboxResult.error ? (
                      <div className="p-4 bg-[#291415] border-t border-rose-800/40 text-center text-rose-300">
                        <AlertTriangle className="w-6 h-6 text-rose-500 mx-auto mb-1" />
                        <h5 className="font-bold font-mono text-xs text-rose-200">BUFFER EXCEPTION</h5>
                        <p className="text-[10px] font-mono mt-1 bg-black/40 p-2.5 rounded overflow-x-auto max-w-2xl mx-auto break-all">
                          {sandboxResult.error}
                        </p>
                      </div>
                    ) : sandboxResult.rows.length === 0 ? (
                      <div className="p-8 text-center text-[#5C616A] font-mono text-xs italic">
                        Query processed successfully. Returned 0 rows.
                      </div>
                    ) : (
                      <div className="overflow-x-auto max-h-[350px]">
                        <table className="w-full text-left border-collapse text-[10px] font-mono">
                          <thead>
                            <tr className="bg-[#111318] border-b border-[#2A2D35] text-[#8E9299] sticky top-0">
                              {sandboxResult.columns.map((colName) => (
                                <th key={colName} className="py-2 px-3 font-mono border-r border-[#2A2D35]">
                                  {colName}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#2A2D35]">
                            {sandboxResult.rows.map((row, idx) => (
                              <tr key={idx} className="hover:bg-[#1C1F26] transition-colors">
                                {sandboxResult.columns.map((colName) => {
                                  const val = row[colName];
                                  return (
                                    <td key={colName} className="py-1 px-3 text-[#E0E0E0] border-r border-[#2A2D35] whitespace-nowrap">
                                      {val === null || val === undefined ? (
                                        <span className="text-[#5C616A] italic">NULL</span>
                                      ) : typeof val === "object" ? (
                                        JSON.stringify(val)
                                      ) : typeof val === "string" && (val.includes("00:00") || val.length > 18) && !isNaN(Date.parse(val)) ? (
                                        new Date(val).toISOString().replace("T", " ").substring(0, 19)
                                      ) : (
                                        String(val)
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* VIEW 3: Table Specific Data Inspector */}
            {activeTab !== "dashboard" && activeTab !== "sandbox" && (
              <motion.div
                key={activeTab}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                
                {/* Table Title and Controls */}
                <div className="bg-[#16191E] border border-[#2A2D35] p-4 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="bg-[#23272E] p-1.5 rounded border border-[#2A2D35] text-blue-400">
                        {getTableIcon(activeTab)}
                      </div>
                      <h2 className="text-sm font-mono font-bold tracking-wider text-white">{activeTab}</h2>
                    </div>
                    <p className="text-[10px] font-mono text-[#8E9299]">
                      SYSTEM TABLE: <span className="font-bold text-white bg-[#0F1115] px-1 py-0.5 rounded">{activeTab}</span>
                      <span className="mx-2">•</span>
                      SCHEMA ROWS: <span className="font-bold text-white">{selectedTableInfo?.totalRows || 0}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-1 bg-[#0F1115] border border-[#2A2D35] p-1 rounded">
                    <button
                      onClick={() => setTableDataTab("rows")}
                      className={`px-3 py-1 text-[10px] font-mono rounded transition-all ${
                        tableDataTab === "rows"
                          ? "bg-blue-600 text-white font-bold"
                          : "text-[#8E9299] hover:text-white"
                      }`}
                    >
                      DATA BUFFER ({selectedTableInfo?.totalRows || 0})
                    </button>
                    <button
                      onClick={() => setTableDataTab("schema")}
                      className={`px-3 py-1 text-[10px] font-mono rounded transition-all ${
                        tableDataTab === "schema"
                          ? "bg-blue-600 text-white font-bold"
                          : "text-[#8E9299] hover:text-white"
                      }`}
                    >
                      METADATA STRUCTURE ({selectedTableInfo?.columns.length || 0})
                    </button>
                  </div>
                </div>

                {/* Sub Tab: Schema Structure */}
                {tableDataTab === "schema" && selectedTableInfo && (
                  <div className="bg-[#16191E] border border-[#2A2D35] rounded overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#2A2D35] bg-[#111318]">
                      <h3 className="font-bold text-white text-xs uppercase tracking-widest font-mono">Column Schema (DESCRIBE catalog)</h3>
                      <p className="text-[10px] text-[#8E9299] font-mono">Datatypes, indices, and constraints of {activeTab}</p>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-[10px] font-mono">
                        <thead>
                          <tr className="bg-[#111318] border-b border-[#2A2D35] text-[#8E9299] uppercase tracking-wider">
                            <th className="py-2 px-4 border-r border-[#2A2D35]">Field Name</th>
                            <th className="py-2 px-4 border-r border-[#2A2D35]">Type</th>
                            <th className="py-2 px-4 border-r border-[#2A2D35]">Null allowable</th>
                            <th className="py-2 px-4 border-r border-[#2A2D35]">Key</th>
                            <th className="py-2 px-4 border-r border-[#2A2D35]">Default Value</th>
                            <th className="py-2 px-4">Extra info</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#2A2D35]">
                          {selectedTableInfo.columns.map((col, idx) => (
                            <tr key={idx} className="hover:bg-[#1C1F26] transition-colors">
                              <td className="py-1.5 px-4 font-bold text-blue-400 border-r border-[#2A2D35]">{col.field}</td>
                              <td className="py-1.5 px-4 text-[#E0E0E0] border-r border-[#2A2D35]">{col.type}</td>
                              <td className="py-1.5 px-4 border-r border-[#2A2D35]">
                                <span className={`inline-block px-1 rounded text-[9px] font-bold ${
                                  col.null === "YES" ? "bg-emerald-950 text-emerald-400" : "bg-zinc-800 text-zinc-400"
                                }`}>
                                  {col.null}
                                </span>
                              </td>
                              <td className="py-1.5 px-4 border-r border-[#2A2D35]">
                                {col.key && (
                                  <span className={`inline-block px-1 rounded text-[9px] font-bold ${
                                    col.key === "PRI" ? "bg-blue-950 text-blue-400 border border-blue-800/40" : "bg-sky-950 text-sky-400"
                                  }`}>
                                    {col.key === "PRI" ? "PRI_KEY" : col.key}
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 px-4 text-[#8E9299] border-r border-[#2A2D35]">
                                {col.default === null ? <span className="text-slate-600 italic">NULL</span> : String(col.default)}
                              </td>
                              <td className="py-1.5 px-4 text-[#8E9299]">{col.extra || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Sub Tab: Rows Grid Table view */}
                {tableDataTab === "rows" && (
                  <div className="space-y-4">
                    
                    {/* Filter & Export Row bar */}
                    <div className="bg-[#16191E] border border-[#2A2D35] p-3 rounded flex flex-col md:flex-row md:items-center justify-between gap-3">
                      
                      {/* Search Filter Form */}
                      <form onSubmit={handleApplyFilter} className="flex items-center gap-2 flex-1 max-w-xl">
                        <div className="flex gap-1.5 items-center bg-[#0F1115] border border-[#2A2D35] rounded px-2.5 py-1 w-full text-xs font-mono">
                          <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <select
                            value={searchField}
                            onChange={(e) => setSearchField(e.target.value)}
                            className="bg-transparent border-none text-[10px] font-bold font-mono focus:outline-none text-[#8E9299] pr-1.5 border-r border-[#2A2D35] shrink-0 max-w-[110px]"
                          >
                            {selectedTableInfo?.columns.map((col) => (
                              <option key={col.field} value={col.field} className="bg-[#16191E] text-white">
                                {col.field}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={searchValue}
                            onChange={(e) => setSearchValue(e.target.value)}
                            placeholder="Type query parameter..."
                            className="bg-transparent border-none text-[11px] font-mono focus:outline-none w-full text-white ml-1.5"
                          />
                        </div>

                        <button
                          type="submit"
                          className="px-3 py-1 rounded bg-[#23272E] hover:bg-[#2A2D35] border border-[#2A2D35] font-mono text-[10px] font-bold text-[#E0E0E0] shrink-0 cursor-pointer"
                        >
                          APPLY
                        </button>

                        {(appliedSearchField || appliedSearchValue) && (
                          <button
                            type="button"
                            onClick={handleClearFilter}
                            className="px-2 py-1 text-[#8E9299] hover:text-white font-mono text-[10px] shrink-0 cursor-pointer"
                          >
                            CLEAR
                          </button>
                        )}
                      </form>

                      {/* Export & Count Selectors */}
                      <div className="flex items-center justify-between md:justify-end gap-3 flex-shrink-0">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8E9299]">
                          <span>LIMIT:</span>
                          <select
                            value={limit}
                            onChange={(e) => {
                              setLimit(parseInt(e.target.value));
                              setOffset(0);
                            }}
                            className="bg-[#0F1115] border border-[#2A2D35] rounded p-1 text-[10px] font-bold text-white focus:outline-none font-mono"
                          >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                          </select>
                        </div>

                        {selectedTableData?.rows && selectedTableData.rows.length > 0 && (
                          <button
                            onClick={() => handleExportCSV(activeTab, selectedTableData.rows)}
                            className="px-2.5 py-1.5 bg-blue-500/10 border border-blue-800/40 rounded text-[10px] font-mono text-blue-400 hover:bg-blue-500/20 transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            <span>DOWNLOAD CSV</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Data grid */}
                    <div className="bg-[#16191E] border border-[#2A2D35] rounded overflow-hidden flex flex-col">
                      {loadingTableDetail ? (
                        <div className="p-12 text-center text-[#5C616A] flex flex-col items-center justify-center gap-2 font-mono">
                          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                          <span className="text-xs">Buffering table stream...</span>
                        </div>
                      ) : !selectedTableData || selectedTableData.rows.length === 0 ? (
                        <div className="p-12 text-center text-[#5C616A] flex flex-col items-center justify-center font-mono">
                          <Search className="w-8 h-8 text-slate-700 mb-1" />
                          <span className="font-bold text-slate-400 text-xs">BUFFER SET EMPTY</span>
                          <span className="text-[10px] mt-1 text-slate-600">
                            No rows matched parameters.
                          </span>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-[10px] font-mono">
                            <thead>
                              <tr className="bg-[#111318] border-b border-[#2A2D35] text-[#8E9299] sticky top-0 uppercase tracking-wider">
                                {Object.keys(selectedTableData.rows[0]).map((keyName) => (
                                  <th key={keyName} className="py-2 px-3 border-r border-[#2A2D35] font-semibold">
                                    {keyName}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#2A2D35]">
                              {selectedTableData.rows.map((row, idx) => (
                                <tr key={idx} className="hover:bg-[#1C1F26] transition-colors">
                                  {Object.keys(row).map((keyName) => {
                                    const val = row[keyName];
                                    return (
                                      <td key={keyName} className="py-1 px-3 text-[#E0E0E0] border-r border-[#2A2D35] whitespace-nowrap">
                                        {val === null || val === undefined ? (
                                          <span className="text-[#5C616A] italic">NULL</span>
                                        ) : typeof val === "object" ? (
                                          JSON.stringify(val)
                                        ) : typeof val === "string" && (val.includes("00:00") || val.length > 18) && !isNaN(Date.parse(val)) ? (
                                          new Date(val).toISOString().replace("T", " ").substring(0, 19)
                                        ) : (
                                          String(val)
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Pagination Footer */}
                      {selectedTableData && selectedTableData.rows.length > 0 && (
                        <div className="px-4 py-3 border-t border-[#2A2D35] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#111318] text-[10px] font-mono text-[#5C616A]">
                          <div>
                            Rows <span className="font-bold text-white">{offset + 1}</span> to{" "}
                            <span className="font-bold text-white">
                              {Math.min(offset + selectedTableData.rows.length, selectedTableData.filteredTotal ?? selectedTableInfo?.totalRows ?? 0)}
                            </span>{" "}
                            of{" "}
                            <span className="font-bold text-white">
                              {selectedTableData.filteredTotal ?? selectedTableInfo?.totalRows ?? 0}
                            </span>{" "}
                            rows parsed
                            {(appliedSearchField || appliedSearchValue) && (
                              <span className="ml-2 text-blue-400 font-bold">
                                (Filtered: "{appliedSearchField}" = "{appliedSearchValue}")
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              disabled={offset === 0}
                              onClick={() => setOffset(0)}
                              title="First buffer"
                              className="p-1 bg-[#16191E] border border-[#2A2D35] rounded text-slate-400 hover:text-white disabled:text-slate-700 transition-colors cursor-pointer"
                            >
                              <ChevronsLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              disabled={offset === 0}
                              onClick={() => setOffset(Math.max(0, offset - limit))}
                              title="Prev buffer"
                              className="p-1 bg-[#16191E] border border-[#2A2D35] rounded text-slate-400 hover:text-white disabled:text-slate-700 transition-colors cursor-pointer"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>

                            <span className="mx-2 font-bold text-white">
                              Page {Math.floor(offset / limit) + 1} /{" "}
                              {Math.ceil((selectedTableData.filteredTotal ?? selectedTableInfo?.totalRows ?? 1) / limit)}
                            </span>

                            <button
                              disabled={offset + limit >= (selectedTableData.filteredTotal ?? selectedTableInfo?.totalRows ?? 0)}
                              onClick={() => setOffset(offset + limit)}
                              title="Next buffer"
                              className="p-1 bg-[#16191E] border border-[#2A2D35] rounded text-slate-400 hover:text-white disabled:text-slate-700 transition-colors cursor-pointer"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                            <button
                              disabled={offset + limit >= (selectedTableData.filteredTotal ?? selectedTableInfo?.totalRows ?? 0)}
                              onClick={() => {
                                const tot = selectedTableData.filteredTotal ?? selectedTableInfo?.totalRows ?? 0;
                                setOffset(Math.max(0, Math.floor((tot - 1) / limit) * limit));
                              }}
                              title="Last buffer"
                              className="p-1 bg-[#16191E] border border-[#2A2D35] rounded text-slate-400 hover:text-white disabled:text-slate-700 transition-colors cursor-pointer"
                            >
                              <ChevronsRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>

      {/* Footer Status Bar: High Density */}
      <footer className="px-6 py-2 bg-[#16191E] border-t border-[#2A2D35] flex items-center justify-between text-[10px] font-mono text-[#5C616A]">
        <div className="flex items-center gap-5">
          <span>SERVER ENGINE: <span className="text-[#8E9299]">MySQL 8.0 / InnoDB (Row-Level Lock)</span></span>
          <span className="hidden sm:inline">|</span>
          <span className="hidden sm:inline">SESSION_ID: <span className="text-[#8E9299]">x83b21-4f-crawler</span></span>
          <span>|</span>
          <span>LATENCY: <span className="text-emerald-400 font-bold animate-pulse">12ms</span></span>
        </div>
        <div className="flex items-center gap-5">
          <span className="hidden sm:inline">ENC: <span className="text-[#8E9299]">TLS 1.3 AES-256</span></span>
          <span className="text-white font-bold">{liveUtcTime}</span>
        </div>
      </footer>
    </div>
  );
}

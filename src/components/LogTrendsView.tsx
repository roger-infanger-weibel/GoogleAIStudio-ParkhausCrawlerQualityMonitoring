import React, { useState, useEffect } from "react";
import {
  Activity,
  AlertTriangle,
  Compass,
  Filter,
  RefreshCw,
  Search,
  CheckCircle2,
  SlidersHorizontal,
  ChevronDown,
  Info,
  TrendingUp,
  Building2,
  Calendar,
  Layers,
  ArrowUpRight
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar
} from "recharts";
import { motion } from "motion/react";
import { LogTrendResponse, CityLogSummary } from "../types";

interface LogTrendsViewProps {
  onShowToast: (text: string, type?: "success" | "error" | "info") => void;
  refreshKey: number;
}

export default function LogTrendsView({ onShowToast, refreshKey }: LogTrendsViewProps) {
  const [data, setData] = useState<LogTrendResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedCity, setSelectedCity] = useState<string>("all");
  const [selectedSeverity, setSelectedSeverity] = useState<"all" | "error" | "warning" | "info">("all");
  const [logSearch, setLogSearch] = useState<string>("");
  const [chartMode, setChartMode] = useState<"stacked" | "error_focus" | "city_comparison">("stacked");

  useEffect(() => {
    async function fetchTrends() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/log-trends");
        if (!res.ok) throw new Error("Fehler beim Laden der Log-Trends");
        const json: LogTrendResponse = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message || "Verbindungsfehler");
        onShowToast(err.message || "Netzwerkfehler", "error");
      } finally {
        setLoading(false);
      }
    }
    fetchTrends();
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-3 bg-[#16191E] border border-[#2A2D35] rounded-lg">
        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
        <span className="text-xs font-mono text-[#8E9299]">Analysiere Log-Schweregrade & Städte-Trends...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-[#291415] border border-rose-800/80 rounded-lg text-rose-300 font-mono text-xs space-y-2">
        <div className="flex items-center gap-2 font-bold text-rose-200">
          <AlertTriangle className="w-4 h-4 text-rose-400" />
          <span>Fehler beim Laden der Log-Trends</span>
        </div>
        <p>{error || "Keine Daten empfangen."}</p>
      </div>
    );
  }

  // Calculate filtered time series for chart
  const timeSeriesData = data.timeSeries.map((bucket) => {
    if (selectedCity === "all") {
      return {
        timeLabel: bucket.timeLabel,
        Error: bucket.error,
        Warning: bucket.warning,
        Info: bucket.info,
        Total: bucket.total
      };
    } else {
      const cityData = bucket.cityBreakdown[selectedCity] || { error: 0, warning: 0, info: 0, total: 0 };
      return {
        timeLabel: bucket.timeLabel,
        Error: cityData.error,
        Warning: cityData.warning,
        Info: cityData.info,
        Total: cityData.total
      };
    }
  });

  // Calculate high-level KPIs
  const totalErrors = data.citySummaries.reduce((acc, c) => acc + c.errorCount, 0);
  const totalWarnings = data.citySummaries.reduce((acc, c) => acc + c.warningCount, 0);
  const totalInfos = data.citySummaries.reduce((acc, c) => acc + c.infoCount, 0);
  const totalLogs = data.totalLogsCount || 1;

  const highestErrorCity = [...data.citySummaries].sort((a, b) => b.errorCount - a.errorCount)[0];

  // Filter logs list
  const filteredLogs = data.logs.filter((log) => {
    // City filter
    if (selectedCity !== "all" && log.detectedCity !== selectedCity) return false;
    // Severity filter
    if (selectedSeverity !== "all" && log.catSeverity !== selectedSeverity) return false;
    // Search text filter
    if (logSearch) {
      const query = logSearch.toLowerCase();
      const matchText = String(log.text || "").toLowerCase();
      const matchSev = String(log.severity || "").toLowerCase();
      if (!matchText.includes(query) && !matchSev.includes(query)) return false;
    }
    return true;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {/* View Header */}
      <div className="bg-[#16191E] border border-[#2A2D35] p-5 rounded flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500/10 rounded border border-blue-800/40 text-blue-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-white uppercase tracking-widest font-mono">
              Log Severity Trend Analysis per City
            </h2>
          </div>
          <p className="text-xs text-[#8E9299] font-mono">
            Verteilung von Systemereignissen (Error, Warning, Info) im Zeitverlauf – aufgeschlüsselt nach Städten (z.B. Bern, Basel)
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="flex items-center gap-2 bg-[#0F1115] px-3 py-1.5 rounded border border-[#2A2D35]">
            <Building2 className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[#8E9299]">STADT:</span>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#16191E] text-white">Alle Städte (Gesamt)</option>
              {data.cityList.map((c) => (
                <option key={c.key} value={c.key} className="bg-[#16191E] text-white">
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-[#0F1115] px-3 py-1.5 rounded border border-[#2A2D35]">
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[#8E9299]">MODUS:</span>
            <select
              value={chartMode}
              onChange={(e) => setChartMode(e.target.value as any)}
              className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
            >
              <option value="stacked" className="bg-[#16191E] text-white">Stacked Severity Area</option>
              <option value="error_focus" className="bg-[#16191E] text-white">Error Focus Trend</option>
              <option value="city_comparison" className="bg-[#16191E] text-white">Städte-Vergleich Bar</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Logs */}
        <div className="bg-[#16191E] border border-[#2A2D35] p-4 rounded flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-mono font-bold text-[#5C616A] uppercase tracking-wider block">Total Log Events</span>
            <h3 className="text-2xl font-mono font-bold text-white">{totalLogs}</h3>
            <p className="text-[10px] font-mono text-[#8E9299]">Geleser Buffer in tbl_log</p>
          </div>
          <div className="p-2.5 bg-blue-500/10 rounded border border-blue-800/40 text-blue-400">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        {/* Error Count & Ratio */}
        <div className="bg-[#16191E] border border-[#2A2D35] p-4 rounded flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-mono font-bold text-[#5C616A] uppercase tracking-wider block">Critical Errors</span>
            <h3 className="text-2xl font-mono font-bold text-rose-400">{totalErrors}</h3>
            <p className="text-[10px] font-mono text-rose-500 font-bold">
              {Math.round((totalErrors / totalLogs) * 100)}% aller Log-Einträge
            </p>
          </div>
          <div className="p-2.5 bg-rose-500/10 rounded border border-rose-800/40 text-rose-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* Warnings */}
        <div className="bg-[#16191E] border border-[#2A2D35] p-4 rounded flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-mono font-bold text-[#5C616A] uppercase tracking-wider block">Warnings</span>
            <h3 className="text-2xl font-mono font-bold text-amber-400">{totalWarnings}</h3>
            <p className="text-[10px] font-mono text-amber-500 font-bold">
              {Math.round((totalWarnings / totalLogs) * 100)}% des Volumens
            </p>
          </div>
          <div className="p-2.5 bg-amber-500/10 rounded border border-amber-800/40 text-amber-400">
            <Info className="w-5 h-5" />
          </div>
        </div>

        {/* Top Error City */}
        <div className="bg-[#16191E] border border-[#2A2D35] p-4 rounded flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-mono font-bold text-[#5C616A] uppercase tracking-wider block">Hotspot Region</span>
            <h3 className="text-xl font-mono font-bold text-white uppercase truncate max-w-[140px]">
              {highestErrorCity?.displayName || "N/A"}
            </h3>
            <p className="text-[10px] font-mono text-slate-400">
              {highestErrorCity ? `${highestErrorCity.errorCount} Fehler registriert` : "Keine Fehler"}
            </p>
          </div>
          <div className="p-2.5 bg-indigo-500/10 rounded border border-indigo-800/40 text-indigo-400">
            <Building2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Primary Main Chart Area */}
      <div className="bg-[#16191E] border border-[#2A2D35] p-5 rounded space-y-4">
        <div className="flex flex-wrap items-center justify-between border-b border-[#2A2D35] pb-3 gap-2">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2 font-mono">
              <span className="w-2.5 h-2.5 bg-blue-500 rounded-sm"></span>
              Timeline Severity Trend {selectedCity !== "all" && `— Stadt: ${selectedCity.toUpperCase()}`}
            </h3>
            <p className="text-[10px] text-[#8E9299] font-mono mt-0.5">
              Aufzeichnung über Zeit-Buckets (Fehler / Warnungen / Info)
            </p>
          </div>

          <div className="flex items-center gap-1.5 font-mono text-[10px]">
            <span className="text-[#5C616A] mr-1">Filter Stadt:</span>
            <button
              onClick={() => setSelectedCity("all")}
              className={`px-2 py-1 rounded border transition-colors ${
                selectedCity === "all"
                  ? "bg-blue-600 border-blue-500 text-white font-bold"
                  : "bg-[#0F1115] border-[#2A2D35] text-[#8E9299] hover:text-white"
              }`}
            >
              ALLE
            </button>
            {data.cityList.map((c) => (
              <button
                key={c.key}
                onClick={() => setSelectedCity(c.key)}
                className={`px-2 py-1 rounded border uppercase transition-colors ${
                  selectedCity === c.key
                    ? "bg-blue-600 border-blue-500 text-white font-bold"
                    : "bg-[#0F1115] border-[#2A2D35] text-[#8E9299] hover:text-white"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Chart Graphics */}
        <div className="h-72 w-full font-mono text-xs">
          {timeSeriesData.length === 0 ? (
            <div className="h-full border border-dashed border-[#2A2D35] rounded flex items-center justify-center text-[#5C616A]">
              Keine Datenpunkte für diesen Zeitraum vorhanden.
            </div>
          ) : chartMode === "city_comparison" ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.citySummaries.map((c) => ({
                  Stadt: c.displayName,
                  Error: c.errorCount,
                  Warning: c.warningCount,
                  Info: c.infoCount
                }))}
                margin={{ top: 15, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2A2D35" />
                <XAxis dataKey="Stadt" stroke="#5C616A" fontSize={10} tickLine={false} />
                <YAxis stroke="#5C616A" fontSize={10} tickLine={false} />
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
                <Bar dataKey="Error" fill="#ef4444" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Warning" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Info" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeSeriesData} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorError" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorWarn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorInfo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2A2D35" />
                <XAxis dataKey="timeLabel" stroke="#5C616A" fontSize={10} tickLine={false} />
                <YAxis stroke="#5C616A" fontSize={10} tickLine={false} />
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

                {chartMode === "error_focus" ? (
                  <Area
                    type="monotone"
                    dataKey="Error"
                    stroke="#ef4444"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorError)"
                  />
                ) : (
                  <>
                    <Area
                      type="monotone"
                      dataKey="Error"
                      stackId="1"
                      stroke="#ef4444"
                      fillOpacity={1}
                      fill="url(#colorError)"
                    />
                    <Area
                      type="monotone"
                      dataKey="Warning"
                      stackId="1"
                      stroke="#f59e0b"
                      fillOpacity={1}
                      fill="url(#colorWarn)"
                    />
                    <Area
                      type="monotone"
                      dataKey="Info"
                      stackId="1"
                      stroke="#3b82f6"
                      fillOpacity={1}
                      fill="url(#colorInfo)"
                    />
                  </>
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* City Breakdown Cards Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between font-mono">
          <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-blue-400" />
            <span>Zusammenfassung pro Stadt (Severity Distribution)</span>
          </h3>
          <span className="text-[10px] text-[#5C616A]">Klicken Sie auf eine Stadt, um den Trend zu filtern</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.citySummaries.map((city) => {
            const isSelected = selectedCity === city.cityKey;
            const cityTotal = city.totalLogs || 1;
            const errPct = Math.round((city.errorCount / cityTotal) * 100);
            const warnPct = Math.round((city.warningCount / cityTotal) * 100);

            return (
              <button
                key={city.cityKey}
                onClick={() => setSelectedCity(city.cityKey)}
                className={`p-4 rounded border text-left transition-all font-mono space-y-3 cursor-pointer ${
                  isSelected
                    ? "bg-blue-500/10 border-blue-500 ring-1 ring-blue-500 shadow-xl"
                    : "bg-[#16191E] border-[#2A2D35] hover:border-slate-600 hover:bg-[#1C1F26]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white uppercase">{city.displayName}</span>
                    {isSelected && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-600 text-white font-bold">
                        AKTIV
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-[#8E9299] font-bold">{city.totalLogs} Logs</span>
                </div>

                {/* Progress ratio distribution bar */}
                <div className="space-y-1">
                  <div className="w-full h-2 bg-[#0F1115] rounded-full overflow-hidden flex">
                    <div
                      style={{ width: `${errPct}%` }}
                      className="bg-rose-500 h-full"
                      title={`Errors: ${city.errorCount}`}
                    />
                    <div
                      style={{ width: `${warnPct}%` }}
                      className="bg-amber-500 h-full"
                      title={`Warnings: ${city.warningCount}`}
                    />
                    <div
                      style={{ width: `${Math.max(0, 100 - errPct - warnPct)}%` }}
                      className="bg-blue-500 h-full"
                      title={`Info: ${city.infoCount}`}
                    />
                  </div>

                  <div className="flex justify-between text-[10px] text-[#8E9299]">
                    <span className="text-rose-400 font-bold">{city.errorCount} Errors</span>
                    <span className="text-amber-400 font-bold">{city.warningCount} Warnings</span>
                    <span className="text-blue-400 font-bold">{city.infoCount} Info</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detailed Log Table Stream */}
      <div className="bg-[#16191E] border border-[#2A2D35] rounded overflow-hidden space-y-0">
        <div className="p-4 border-b border-[#2A2D35] bg-[#111318] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-widest font-mono">
              Gefilterte Log-Protokolle ({filteredLogs.length})
            </h3>
            <p className="text-[10px] text-[#8E9299] font-mono mt-0.5">
              Einzelzeilen-Audit der Severity-Events
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Log-Text durchsuchen..."
                className="bg-[#0F1115] border border-[#2A2D35] rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Severity filter buttons */}
            <div className="flex bg-[#0F1115] p-1 rounded border border-[#2A2D35] text-[10px]">
              {(["all", "error", "warning", "info"] as const).map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSelectedSeverity(sev)}
                  className={`px-2 py-1 rounded uppercase font-bold transition-colors ${
                    selectedSeverity === sev
                      ? sev === "error"
                        ? "bg-rose-900/80 text-rose-300"
                        : sev === "warning"
                        ? "bg-amber-900/80 text-amber-300"
                        : sev === "info"
                        ? "bg-blue-900/80 text-blue-300"
                        : "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table Rows */}
        <div className="overflow-x-auto max-h-96">
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-[#5C616A] font-mono text-xs italic">
              Keine Log-Einträge für die gewählten Filter gefunden.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-[11px] font-mono">
              <thead>
                <tr className="bg-[#111318] border-b border-[#2A2D35] text-[#8E9299]">
                  <th className="py-2.5 px-3 border-r border-[#2A2D35] w-40">Zeitstempel</th>
                  <th className="py-2.5 px-3 border-r border-[#2A2D35] w-28">Stadt</th>
                  <th className="py-2.5 px-3 border-r border-[#2A2D35] w-24">Severity</th>
                  <th className="py-2.5 px-3">Log-Nachricht (Raw Text)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2D35]">
                {filteredLogs.map((logRow, idx) => {
                  const sev = String(logRow.catSeverity).toLowerCase();
                  return (
                    <tr key={idx} className="hover:bg-[#1C1F26] transition-colors">
                      <td className="py-2 px-3 text-[#8E9299] border-r border-[#2A2D35]">
                        {new Date(logRow.timestamp).toISOString().replace("T", " ").substring(0, 19)}
                      </td>
                      <td className="py-2 px-3 border-r border-[#2A2D35]">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#0F1115] border border-[#2A2D35] text-blue-300 uppercase">
                          {logRow.cityDisplayName || logRow.detectedCity}
                        </span>
                      </td>
                      <td className="py-2 px-3 border-r border-[#2A2D35]">
                        {sev === "error" ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-400 border border-rose-800/60 uppercase">
                            ERROR
                          </span>
                        ) : sev === "warning" ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800/60 uppercase">
                            WARN
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-400 border border-blue-800/60 uppercase">
                            INFO
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-white break-all">
                        {logRow.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </motion.div>
  );
}

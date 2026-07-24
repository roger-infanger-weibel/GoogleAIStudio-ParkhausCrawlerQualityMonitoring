import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Database Connection Configuration (loaded from .env file or environment variables)
  const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    charset: process.env.DB_CHARSET || "utf8mb4",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 15000,
  };

  let pool: mysql.Pool | null = null;

  function getPool() {
    if (!pool) {
      pool = mysql.createPool(dbConfig);
    }
    return pool;
  }

  // API to test connection & get status
  app.get("/api/db-status", async (req, res) => {
    try {
      const activePool = getPool();
      await activePool.query("SELECT 1 as connected");
      res.json({
        status: "connected",
        config: {
          host: dbConfig.host,
          database: dbConfig.database,
          user: dbConfig.user,
        }
      });
    } catch (error: any) {
      console.error("Database connection error:", error);
      res.status(500).json({
        status: "error",
        message: error.message || "Failed to connect to the database",
        config: {
          host: dbConfig.host,
          database: dbConfig.database,
          user: dbConfig.user,
        }
      });
    }
  });

  // API to list all tables
  app.get("/api/tables", async (req, res) => {
    try {
      const activePool = getPool();
      const [rows]: any[] = await activePool.query("SHOW TABLES");
      const tables = rows.map((row: any) => Object.values(row)[0]);
      res.json({ tables });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API to get table details (schema & total counts)
  app.get("/api/tables/:tableName", async (req, res) => {
    const { tableName } = req.params;
    try {
      const activePool = getPool();
      
      // Get table column structures
      const [columns]: any[] = await activePool.query(`DESCRIBE ??`, [tableName]);
      
      // Get total count of rows
      const [countRows]: any[] = await activePool.query(`SELECT COUNT(*) as total FROM ??`, [tableName]);
      const totalRows = countRows[0]?.total || 0;

      res.json({
        tableName,
        columns: columns.map((col: any) => ({
          field: col.Field,
          type: col.Type,
          null: col.Null,
          key: col.Key,
          default: col.Default,
          extra: col.Extra
        })),
        totalRows
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API to get paginated table rows with optional search filters
  app.get("/api/tables/:tableName/data", async (req, res) => {
    const { tableName } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const searchField = req.query.searchField as string;
    const searchValue = req.query.searchValue as string;

    try {
      const activePool = getPool();
      let query = `SELECT * FROM ??`;
      const queryParams: any[] = [tableName];

      // Safe check if column exists before searching to prevent SQL injection or failures
      let hasFilter = false;
      if (searchField && searchValue) {
        query += ` WHERE ?? LIKE ?`;
        queryParams.push(searchField, `%${searchValue}%`);
        hasFilter = true;
      }

      // Default Ordering for logs, crawler readings, and forecasts
      const nameLower = tableName.toLowerCase();
      if (nameLower === 'log') {
        query += ` ORDER BY timestamp DESC`;
      } else if (nameLower === 'pls_fetch_current') {
        query += ` ORDER BY fetch_ts DESC, city ASC, id ASC`;
      } else if (nameLower === 'weather_forecasts') {
        query += ` ORDER BY timestamp DESC`;
      } else if (nameLower === 'local_events') {
        query += ` ORDER BY start_time DESC`;
      }

      query += ` LIMIT ? OFFSET ?`;
      queryParams.push(limit, offset);

      const [rows]: any[] = await activePool.query(query, queryParams);

      // Fetch dynamic total row count under the current filter
      let filteredTotal = null;
      if (hasFilter) {
        const countQuery = `SELECT COUNT(*) as total FROM ?? WHERE ?? LIKE ?`;
        const [countRows]: any[] = await activePool.query(countQuery, [tableName, searchField, `%${searchValue}%`]);
        filteredTotal = countRows[0]?.total || 0;
      }

      res.json({
        tableName,
        rows,
        limit,
        offset,
        filteredTotal
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Execute a custom read-only SQL query
  app.post("/api/query", async (req, res) => {
    const { sql } = req.body;
    if (!sql) {
      return res.status(400).json({ error: "SQL query is required" });
    }

    const trimmedSql = sql.trim().toUpperCase();
    if (
      !trimmedSql.startsWith("SELECT") &&
      !trimmedSql.startsWith("SHOW") &&
      !trimmedSql.startsWith("DESCRIBE") &&
      !trimmedSql.startsWith("EXPLAIN")
    ) {
      return res.status(400).json({
        error: "Only read-only queries (SELECT, SHOW, DESCRIBE, EXPLAIN) are permitted for security."
      });
    }

    try {
      const activePool = getPool();
      const [rows, fields]: any[] = await activePool.query(sql);
      res.json({
        rows,
        columns: fields ? fields.map((f: any) => f.name) : []
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Aggregated dashboard metrics API
  app.get("/api/dashboard-stats", async (req, res) => {
    try {
      const activePool = getPool();
      
      // Dynamic list of tables in database
      const [tableRows]: any[] = await activePool.query("SHOW TABLES");
      const tables = tableRows.map((row: any) => String(Object.values(row)[0]).toLowerCase());

      const stats: any = {
        citiesCount: 0,
        parkhaeuserCount: 0,
        weatherForecastsCount: 0,
        localEventsCount: 0,
        totalFetchesCount: 0,
        errorLogsCount: 0,
        cityParkingAggregates: [],
        latestFetchTimestamp: null,
        latestFetches: [],
        latestLogs: []
      };

      if (tables.includes("cities")) {
        const [rows]: any[] = await activePool.query("SELECT COUNT(*) as total FROM cities");
        stats.citiesCount = rows[0]?.total || 0;
      }
      if (tables.includes("parkhaeuser")) {
        const [rows]: any[] = await activePool.query("SELECT COUNT(*) as total FROM parkhaeuser");
        stats.parkhaeuserCount = rows[0]?.total || 0;
      }
      if (tables.includes("weather_forecasts")) {
        const [rows]: any[] = await activePool.query("SELECT COUNT(*) as total FROM weather_forecasts");
        stats.weatherForecastsCount = rows[0]?.total || 0;
      }
      if (tables.includes("local_events")) {
        const [rows]: any[] = await activePool.query("SELECT COUNT(*) as total FROM local_events");
        stats.localEventsCount = rows[0]?.total || 0;
      }
      if (tables.includes("pls_fetch_current")) {
        const [rows]: any[] = await activePool.query("SELECT COUNT(*) as total FROM pls_fetch_current");
        stats.totalFetchesCount = rows[0]?.total || 0;

        // Fetch latest timestamp
        const [tsRow]: any[] = await activePool.query("SELECT MAX(fetch_ts) as max_ts FROM pls_fetch_current");
        const maxTs = tsRow[0]?.max_ts;
        if (maxTs) {
          stats.latestFetchTimestamp = maxTs;
          // Sum spaces per city at that latest timestamp
          const [cityAggs]: any[] = await activePool.query(
            "SELECT city, SUM(free) as free, SUM(total) as total, COUNT(*) as active_count FROM pls_fetch_current WHERE fetch_ts = ? GROUP BY city",
            [maxTs]
          );
          stats.cityParkingAggregates = cityAggs;
        }

        // Get recent 10 overall fetches
        const [latestRows]: any[] = await activePool.query(
          "SELECT * FROM pls_fetch_current ORDER BY fetch_ts DESC LIMIT 10"
        );
        stats.latestFetches = latestRows;
      }
      if (tables.includes("log")) {
        // Count errors
        const [errRows]: any[] = await activePool.query(
          "SELECT COUNT(*) as total FROM log WHERE severity LIKE '%E%' OR severity LIKE '%Error%'"
        );
        stats.errorLogsCount = errRows[0]?.total || 0;

        // Get latest 10 logs
        const [latestLogRows]: any[] = await activePool.query(
          "SELECT * FROM log ORDER BY timestamp DESC LIMIT 15"
        );
        stats.latestLogs = latestLogRows;
      }

      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Log Severity Trend per City Endpoint
  app.get("/api/log-trends", async (req, res) => {
    try {
      const activePool = getPool();
      
      // Check if tables exist
      const [tableRows]: any[] = await activePool.query("SHOW TABLES");
      const tables = tableRows.map((row: any) => String(Object.values(row)[0]).toLowerCase());

      if (!tables.includes("log")) {
        return res.json({
          timeSeries: [],
          cityList: [],
          citySummaries: [],
          totalLogsCount: 0,
          logs: []
        });
      }

      // Fetch dynamic city list from cities table if available
      let knownCities: { key: string; name: string }[] = [];
      if (tables.includes("cities")) {
        const [cityRows]: any[] = await activePool.query("SELECT id, name FROM cities");
        knownCities = cityRows.map((c: any) => ({
          key: String(c.id || c.name).toLowerCase(),
          name: String(c.name)
        }));
      }

      // Default Swiss cities fallback if DB table empty or missing
      if (knownCities.length === 0) {
        knownCities = [
          { key: "bern", name: "Bern" },
          { key: "basel", name: "Basel" },
          { key: "zuerich", name: "Zürich" },
          { key: "luzern", name: "Luzern" },
          { key: "stgallen", name: "St. Gallen" },
          { key: "geneva", name: "Genève" }
        ];
      }

      // Add general system category
      const cityList = [
        ...knownCities,
        { key: "general", name: "System / General" }
      ];

      // Fetch logs
      const [logRows]: any[] = await activePool.query("SELECT * FROM log ORDER BY timestamp ASC");

      // Initialize city summary map
      const citySummaryMap: Record<string, { errorCount: number; warningCount: number; infoCount: number; totalLogs: number; name: string }> = {};
      cityList.forEach((c) => {
        citySummaryMap[c.key] = {
          errorCount: 0,
          warningCount: 0,
          infoCount: 0,
          totalLogs: 0,
          name: c.name
        };
      });

      // Time bucket map (grouped by YYYY-MM-DD HH:00 or date string)
      const timeBucketMap: Record<string, {
        timeLabel: string;
        rawTimestamp: string;
        total: number;
        error: number;
        warning: number;
        info: number;
        cityBreakdown: Record<string, { error: number; warning: number; info: number; total: number }>;
      }> = {};

      const processedLogs: any[] = [];

      for (const logItem of logRows) {
        const textLower = String(logItem.text || "").toLowerCase();
        const severityStr = String(logItem.severity || "").toUpperCase();

        // Categorize severity
        let catSeverity: "error" | "warning" | "info" = "info";
        if (severityStr.includes("E") || severityStr.includes("ERR")) {
          catSeverity = "error";
        } else if (severityStr.includes("W") || severityStr.includes("WARN")) {
          catSeverity = "warning";
        }

        // Determine associated city from text
        let detectedCityKey = "general";
        for (const cityObj of knownCities) {
          const key = cityObj.key.toLowerCase();
          const name = cityObj.name.toLowerCase();
          // Check if log text contains city key or name or normalized variant
          if (textLower.includes(key) || textLower.includes(name) || (key === "zuerich" && textLower.includes("zurich"))) {
            detectedCityKey = cityObj.key;
            break;
          }
        }

        // Update city summary counts
        if (!citySummaryMap[detectedCityKey]) {
          citySummaryMap[detectedCityKey] = {
            errorCount: 0,
            warningCount: 0,
            infoCount: 0,
            totalLogs: 0,
            name: detectedCityKey.toUpperCase()
          };
        }
        citySummaryMap[detectedCityKey].totalLogs += 1;
        if (catSeverity === "error") citySummaryMap[detectedCityKey].errorCount += 1;
        else if (catSeverity === "warning") citySummaryMap[detectedCityKey].warningCount += 1;
        else citySummaryMap[detectedCityKey].infoCount += 1;

        // Bucket by hour
        const tsDate = new Date(logItem.timestamp);
        const year = tsDate.getFullYear();
        const month = String(tsDate.getMonth() + 1).padStart(2, "0");
        const day = String(tsDate.getDate()).padStart(2, "0");
        const hours = String(tsDate.getHours()).padStart(2, "0");

        const bucketKey = `${year}-${month}-${day} ${hours}:00`;
        const displayLabel = `${day}.${month}. ${hours}:00`;

        if (!timeBucketMap[bucketKey]) {
          timeBucketMap[bucketKey] = {
            timeLabel: displayLabel,
            rawTimestamp: bucketKey,
            total: 0,
            error: 0,
            warning: 0,
            info: 0,
            cityBreakdown: {}
          };
        }

        const bucket = timeBucketMap[bucketKey];
        bucket.total += 1;
        if (catSeverity === "error") bucket.error += 1;
        else if (catSeverity === "warning") bucket.warning += 1;
        else bucket.info += 1;

        if (!bucket.cityBreakdown[detectedCityKey]) {
          bucket.cityBreakdown[detectedCityKey] = { error: 0, warning: 0, info: 0, total: 0 };
        }
        bucket.cityBreakdown[detectedCityKey].total += 1;
        bucket.cityBreakdown[detectedCityKey][catSeverity] += 1;

        processedLogs.push({
          ...logItem,
          detectedCity: detectedCityKey,
          cityDisplayName: citySummaryMap[detectedCityKey]?.name || detectedCityKey,
          catSeverity
        });
      }

      const timeSeries = Object.values(timeBucketMap);
      const citySummaries = Object.entries(citySummaryMap).map(([key, value]) => ({
        cityKey: key,
        displayName: value.name,
        errorCount: value.errorCount,
        warningCount: value.warningCount,
        infoCount: value.infoCount,
        totalLogs: value.totalLogs
      }));

      res.json({
        timeSeries,
        cityList,
        citySummaries,
        totalLogsCount: logRows.length,
        logs: processedLogs.reverse() // latest first for table view
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Serve static UI assets or connect Vite Middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

startServer();

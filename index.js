#!/usr/bin/env node

// Context Optimizer MCP Server
// Löst das #1 MCP-Problem: Context-Window-Überladung
// Analysiert Tasks, empfiehlt optimale Server-Kombinationen, spart Tokens

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ============================================================
// Server-Katalog — Bekannte MCP-Server mit Metadaten
// ============================================================

const SERVER_CATALOG = {
  // --- Daten & APIs ---
  "filesystem": {
    name: "Filesystem",
    category: "system",
    description: "Dateisystem-Zugriff (lesen, schreiben, suchen)",
    toolCount: 11,
    estimatedTokens: 3200,
    keywords: ["files", "read", "write", "directory", "filesystem", "path", "folder"]
  },
  "github": {
    name: "GitHub",
    category: "development",
    description: "GitHub API — Repos, Issues, PRs, Actions",
    toolCount: 25,
    estimatedTokens: 8500,
    keywords: ["github", "git", "repository", "issue", "pull-request", "code", "commit", "actions"]
  },
  "postgres": {
    name: "PostgreSQL",
    category: "database",
    description: "PostgreSQL-Datenbank Abfragen und Schema-Inspektion",
    toolCount: 6,
    estimatedTokens: 2800,
    keywords: ["database", "sql", "query", "postgres", "table", "schema", "data"]
  },
  "sqlite": {
    name: "SQLite",
    category: "database",
    description: "SQLite-Datenbank Lesen und Schreiben",
    toolCount: 5,
    estimatedTokens: 2200,
    keywords: ["database", "sql", "sqlite", "query", "table", "local"]
  },
  "fetch": {
    name: "Fetch",
    category: "web",
    description: "HTTP-Requests und Web-Scraping",
    toolCount: 2,
    estimatedTokens: 1200,
    keywords: ["http", "web", "api", "request", "scrape", "url", "fetch"]
  },
  "brave-search": {
    name: "Brave Search",
    category: "web",
    description: "Web-Suche über Brave Search API",
    toolCount: 2,
    estimatedTokens: 1400,
    keywords: ["search", "web", "internet", "find", "lookup", "query"]
  },
  "puppeteer": {
    name: "Puppeteer",
    category: "web",
    description: "Browser-Automatisierung mit Puppeteer",
    toolCount: 8,
    estimatedTokens: 4200,
    keywords: ["browser", "automation", "screenshot", "navigate", "click", "scrape", "web"]
  },
  "slack": {
    name: "Slack",
    category: "communication",
    description: "Slack-Nachrichten senden und lesen",
    toolCount: 6,
    estimatedTokens: 3100,
    keywords: ["slack", "message", "channel", "chat", "team", "communication"]
  },
  "google-drive": {
    name: "Google Drive",
    category: "productivity",
    description: "Google Drive Dateien durchsuchen und lesen",
    toolCount: 4,
    estimatedTokens: 2600,
    keywords: ["google", "drive", "docs", "sheets", "files", "document"]
  },
  "memory": {
    name: "Memory",
    category: "agent-infra",
    description: "Persistenter Key-Value-Speicher für Agents",
    toolCount: 4,
    estimatedTokens: 1800,
    keywords: ["memory", "store", "remember", "persist", "cache", "state", "knowledge"]
  },
  "everything": {
    name: "Everything",
    category: "demo",
    description: "Demo-Server mit allen MCP-Features",
    toolCount: 15,
    estimatedTokens: 5500,
    keywords: ["demo", "test", "example", "all", "features"]
  },
  "solana": {
    name: "Solana MCP",
    category: "blockchain",
    description: "Solana-Blockchain-Daten: Wallets, Tokens, DeFi, Whale-Tracking",
    toolCount: 11,
    estimatedTokens: 4800,
    keywords: ["solana", "blockchain", "crypto", "wallet", "defi", "token", "nft", "whale"]
  },
  "openmeteo": {
    name: "OpenMeteo",
    category: "data",
    description: "Wetter- und Klimadaten weltweit",
    toolCount: 4,
    estimatedTokens: 2100,
    keywords: ["weather", "climate", "temperature", "forecast", "rain", "wind"]
  },
  "sequential-thinking": {
    name: "Sequential Thinking",
    category: "reasoning",
    description: "Schrittweises Denken und Problemlösung",
    toolCount: 1,
    estimatedTokens: 800,
    keywords: ["think", "reason", "plan", "step-by-step", "analyze", "logic"]
  },
  "time": {
    name: "Time",
    category: "utility",
    description: "Aktuelle Zeit und Zeitzonen-Konvertierung",
    toolCount: 2,
    estimatedTokens: 900,
    keywords: ["time", "timezone", "date", "clock", "convert"]
  },
  "cloudflare": {
    name: "Cloudflare",
    category: "infrastructure",
    description: "Cloudflare Workers und KV-Store verwalten",
    toolCount: 8,
    estimatedTokens: 3800,
    keywords: ["cloudflare", "workers", "kv", "dns", "deploy", "edge", "cdn"]
  },
  "sentry": {
    name: "Sentry",
    category: "monitoring",
    description: "Sentry-Fehler und Performance-Daten",
    toolCount: 4,
    estimatedTokens: 2400,
    keywords: ["sentry", "error", "bug", "monitoring", "crash", "performance", "trace"]
  },
  "linear": {
    name: "Linear",
    category: "project-management",
    description: "Linear Issues und Projekte verwalten",
    toolCount: 8,
    estimatedTokens: 3500,
    keywords: ["linear", "issue", "project", "task", "sprint", "ticket", "kanban"]
  }
};

// Gesamte Context-Window-Größe (Standard: 200k Tokens)
const CONTEXT_WINDOW_SIZE = 200_000;

// ============================================================
// Hilfsfunktionen
// ============================================================

/**
 * Berechnet Relevanz-Score eines Servers für eine Aufgabe (0-100)
 */
function calculateRelevance(server, taskKeywords) {
  const serverKeywords = server.keywords;
  let matchCount = 0;

  for (const taskWord of taskKeywords) {
    const lower = taskWord.toLowerCase();
    for (const serverWord of serverKeywords) {
      if (serverWord.includes(lower) || lower.includes(serverWord)) {
        matchCount++;
        break;
      }
    }
  }

  if (taskKeywords.length === 0) return 0;
  return Math.round((matchCount / taskKeywords.length) * 100);
}

/**
 * Extrahiert Keywords aus einer Task-Beschreibung
 */
function extractKeywords(text) {
  // Stoppwörter filtern
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "must", "ought",
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her",
    "us", "them", "my", "your", "his", "its", "our", "their",
    "this", "that", "these", "those", "and", "but", "or", "nor",
    "for", "yet", "so", "in", "on", "at", "to", "from", "by", "with",
    "of", "about", "into", "through", "during", "before", "after",
    "above", "below", "between", "out", "off", "up", "down",
    "all", "each", "every", "both", "few", "more", "most", "other",
    "some", "such", "no", "not", "only", "same", "than", "too", "very",
    "just", "because", "as", "if", "when", "where", "how", "what",
    "which", "who", "whom", "why", "then", "once", "here", "there",
    "also", "use", "using", "want", "get", "make", "help", "please"
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

/**
 * Findet die besten Server für eine Aufgabe
 */
function findBestServers(taskDescription, maxResults = 5) {
  const keywords = extractKeywords(taskDescription);
  const scored = [];

  for (const [id, server] of Object.entries(SERVER_CATALOG)) {
    const relevance = calculateRelevance(server, keywords);
    if (relevance > 0) {
      scored.push({ id, ...server, relevance });
    }
  }

  // Nach Relevanz sortieren, bei Gleichstand nach Token-Kosten (weniger = besser)
  scored.sort((a, b) => {
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    return a.estimatedTokens - b.estimatedTokens;
  });

  return scored.slice(0, maxResults);
}

/**
 * Berechnet Token-Statistiken für eine Server-Liste
 */
function calculateTokenStats(serverNames) {
  let totalTokens = 0;
  let totalTools = 0;
  const details = [];

  for (const name of serverNames) {
    const server = SERVER_CATALOG[name];
    if (server) {
      totalTokens += server.estimatedTokens;
      totalTools += server.toolCount;
      details.push({
        server: name,
        name: server.name,
        tokens: server.estimatedTokens,
        tools: server.toolCount,
        category: server.category
      });
    } else {
      details.push({
        server: name,
        name: name,
        tokens: 3000, // Schätzung für unbekannte Server
        tools: 5,
        category: "unknown"
      });
      totalTokens += 3000;
      totalTools += 5;
    }
  }

  const percentage = ((totalTokens / CONTEXT_WINDOW_SIZE) * 100).toFixed(1);
  const remaining = CONTEXT_WINDOW_SIZE - totalTokens;

  return { totalTokens, totalTools, percentage, remaining, details };
}

// ============================================================
// MCP Server erstellen
// ============================================================

const server = new McpServer({
  name: "context-optimizer",
  version: "0.1.0"
});

// --- Tool: analyze_task ---
server.tool(
  "analyze_task",
  "Analysiert eine Aufgabe und empfiehlt die optimale MCP-Server-Kombination. Zeigt potenzielle Token-Einsparungen.",
  {
    task_description: z.string().describe("Beschreibung der Aufgabe, die der Agent erledigen soll")
  },
  async ({ task_description }) => {
    const keywords = extractKeywords(task_description);
    const recommended = findBestServers(task_description, 5);

    // Vergleich: Alle Server vs. empfohlene Server
    const allServerNames = Object.keys(SERVER_CATALOG);
    const allStats = calculateTokenStats(allServerNames);
    const recNames = recommended.map(s => s.id);
    const recStats = calculateTokenStats(recNames);

    const savedTokens = allStats.totalTokens - recStats.totalTokens;
    const savingsPercent = ((savedTokens / allStats.totalTokens) * 100).toFixed(1);

    const result = {
      task: task_description,
      extractedKeywords: keywords,
      recommendedServers: recommended.map(s => ({
        id: s.id,
        name: s.name,
        category: s.category,
        relevanceScore: s.relevance,
        estimatedTokens: s.estimatedTokens,
        toolCount: s.toolCount
      })),
      tokenBudget: {
        withAllServers: {
          tokens: allStats.totalTokens,
          tools: allStats.totalTools,
          contextUsage: `${allStats.percentage}%`
        },
        withRecommended: {
          tokens: recStats.totalTokens,
          tools: recStats.totalTools,
          contextUsage: `${recStats.percentage}%`
        },
        savings: {
          tokens: savedTokens,
          percentage: `${savingsPercent}%`,
          toolsRemoved: allStats.totalTools - recStats.totalTools
        }
      },
      tip: recommended.length <= 3
        ? "Gute Auswahl — kompakt und fokussiert."
        : "Tipp: Mit suggest_minimal_set kannst du auf max. 3 Server reduzieren."
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  }
);

// --- Tool: estimate_context_usage ---
server.tool(
  "estimate_context_usage",
  "Schätzt den Context-Window-Verbrauch für eine Server-Kombination. Zeigt Tokens, Prozent vom 200k-Fenster und verbleibenden Platz.",
  {
    server_names: z.array(z.string()).describe("Liste der Server-IDs (z.B. ['github', 'filesystem', 'fetch'])")
  },
  async ({ server_names }) => {
    const stats = calculateTokenStats(server_names);

    // Warnstufe bestimmen
    let warning = "none";
    let message = "Alles im grünen Bereich.";
    const pct = parseFloat(stats.percentage);

    if (pct > 50) {
      warning = "critical";
      message = "KRITISCH: Über 50% des Context-Windows nur für Tool-Definitionen! Dringend reduzieren.";
    } else if (pct > 30) {
      warning = "high";
      message = "HOCH: Über 30% verbraucht. Weniger Platz für tatsächliche Arbeit. Optimierung empfohlen.";
    } else if (pct > 15) {
      warning = "moderate";
      message = "MODERAT: Spürbarer Verbrauch. Prüfe, ob alle Server wirklich nötig sind.";
    } else {
      warning = "low";
      message = "NIEDRIG: Guter Verbrauch. Genug Platz für Kontext und Arbeit.";
    }

    const result = {
      servers: stats.details,
      summary: {
        totalTokens: stats.totalTokens,
        totalTools: stats.totalTools,
        contextWindowSize: CONTEXT_WINDOW_SIZE,
        usagePercent: `${stats.percentage}%`,
        remainingTokens: stats.remaining,
        warningLevel: warning,
        message: message
      },
      breakdown: stats.details.map(d => ({
        server: d.server,
        tokens: d.tokens,
        share: `${((d.tokens / stats.totalTokens) * 100).toFixed(1)}%`
      }))
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  }
);

// --- Tool: optimize_server_set ---
server.tool(
  "optimize_server_set",
  "Optimiert ein bestehendes Server-Set für eine bestimmte Aufgabe. Zeigt welche Server behalten/entfernt werden sollen mit Token-Einsparungen.",
  {
    current_servers: z.array(z.string()).describe("Aktuell aktive Server-IDs"),
    task_description: z.string().describe("Beschreibung der aktuellen Aufgabe")
  },
  async ({ current_servers, task_description }) => {
    const keywords = extractKeywords(task_description);

    const keep = [];
    const remove = [];

    for (const serverId of current_servers) {
      const server = SERVER_CATALOG[serverId];
      if (!server) {
        // Unbekannter Server — behalten, aber markieren
        keep.push({
          id: serverId,
          name: serverId,
          relevance: "unknown",
          reason: "Nicht im Katalog — manuelle Prüfung empfohlen",
          tokens: 3000
        });
        continue;
      }

      const relevance = calculateRelevance(server, keywords);

      if (relevance > 20) {
        keep.push({
          id: serverId,
          name: server.name,
          relevance,
          reason: `Relevant für die Aufgabe (Score: ${relevance})`,
          tokens: server.estimatedTokens
        });
      } else {
        remove.push({
          id: serverId,
          name: server.name,
          relevance,
          reason: relevance === 0
            ? "Keine Keyword-Übereinstimmung mit der Aufgabe"
            : `Geringe Relevanz (Score: ${relevance})`,
          tokensSaved: server.estimatedTokens
        });
      }
    }

    // Fehlende relevante Server vorschlagen
    const recommended = findBestServers(task_description, 3);
    const missing = recommended.filter(
      r => !current_servers.includes(r.id) && r.relevance > 30
    );

    const beforeStats = calculateTokenStats(current_servers);
    const afterNames = keep.map(k => k.id);
    const afterStats = calculateTokenStats(afterNames);
    const savedTokens = beforeStats.totalTokens - afterStats.totalTokens;

    const result = {
      task: task_description,
      optimization: {
        keep: keep,
        remove: remove,
        missingRecommended: missing.map(m => ({
          id: m.id,
          name: m.name,
          relevance: m.relevance,
          tokens: m.estimatedTokens,
          reason: "Relevant aber nicht in aktuellem Set"
        }))
      },
      savings: {
        before: {
          servers: current_servers.length,
          tokens: beforeStats.totalTokens,
          contextUsage: `${beforeStats.percentage}%`
        },
        after: {
          servers: keep.length,
          tokens: afterStats.totalTokens,
          contextUsage: `${afterStats.percentage}%`
        },
        saved: {
          servers: remove.length,
          tokens: savedTokens,
          percentage: beforeStats.totalTokens > 0
            ? `${((savedTokens / beforeStats.totalTokens) * 100).toFixed(1)}%`
            : "0%"
        }
      }
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  }
);

// --- Tool: suggest_minimal_set ---
server.tool(
  "suggest_minimal_set",
  "Empfiehlt das absolute Minimum an Servern für eine Aufgabe. Maximal 3 Server für maximale Token-Effizienz.",
  {
    task_description: z.string().describe("Beschreibung der Aufgabe")
  },
  async ({ task_description }) => {
    const recommended = findBestServers(task_description, 3);
    const stats = calculateTokenStats(recommended.map(s => s.id));

    const result = {
      task: task_description,
      minimalSet: recommended.map(s => ({
        id: s.id,
        name: s.name,
        category: s.category,
        relevance: s.relevance,
        tokens: s.estimatedTokens,
        tools: s.toolCount
      })),
      budget: {
        totalTokens: stats.totalTokens,
        totalTools: stats.totalTools,
        contextUsage: `${stats.percentage}%`,
        remainingForWork: stats.remaining
      },
      philosophy: "Weniger ist mehr. 3 Server lassen >95% des Context-Windows für echte Arbeit frei."
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  }
);

// --- Tool: get_server_catalog ---
server.tool(
  "get_server_catalog",
  "Vollständiger Katalog aller bekannten MCP-Server, organisiert nach Kategorie. Zeigt Tool-Anzahl, geschätzte Tokens und Keywords.",
  {},
  async () => {
    // Nach Kategorie gruppieren
    const byCategory = {};
    for (const [id, server] of Object.entries(SERVER_CATALOG)) {
      if (!byCategory[server.category]) {
        byCategory[server.category] = [];
      }
      byCategory[server.category].push({
        id,
        name: server.name,
        description: server.description,
        tools: server.toolCount,
        estimatedTokens: server.estimatedTokens,
        keywords: server.keywords
      });
    }

    // Gesamtstatistiken
    const allNames = Object.keys(SERVER_CATALOG);
    const totalStats = calculateTokenStats(allNames);

    const result = {
      catalogVersion: "0.1.0",
      totalServers: allNames.length,
      totalTools: totalStats.totalTools,
      totalTokensIfAllLoaded: totalStats.totalTokens,
      contextUsageIfAllLoaded: `${totalStats.percentage}%`,
      warning: parseFloat(totalStats.percentage) > 30
        ? "Alle Server gleichzeitig zu laden verbraucht zu viel Context. Nutze analyze_task oder suggest_minimal_set."
        : null,
      categories: byCategory
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  }
);

// ============================================================
// Server starten
// ============================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server läuft jetzt über stdio
}

main().catch((error) => {
  console.error("Server-Fehler:", error);
  process.exit(1);
});

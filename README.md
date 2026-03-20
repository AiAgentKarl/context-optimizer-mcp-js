# @aiagentkarl/context-optimizer-mcp

**Solve the #1 MCP problem: context window overload.**

## The Problem

Every MCP server you connect adds tool definitions to your context window. Connect 10 servers with 5-15 tools each, and you've burned 30-50k tokens before the agent even starts working. That's 15-25% of a 200k context window — gone.

The result: shorter conversations, lost context, degraded performance, higher costs.

## The Solution

Context Optimizer analyzes your task, scores server relevance, and recommends the minimal set of MCP servers you actually need. Typical savings: **60-80% fewer tokens** wasted on unused tool definitions.

## Tools

| Tool | Description |
|------|-------------|
| `analyze_task` | Analyze a task and recommend optimal server combination with savings % |
| `estimate_context_usage` | Estimate token usage for a server set (tokens, % of 200k window) |
| `optimize_server_set` | Optimize existing servers for a task — keep vs. remove with savings |
| `suggest_minimal_set` | Absolute minimum servers needed (max 3) for maximum efficiency |
| `get_server_catalog` | Full catalog of 18 known servers organized by category |

## Quick Start

### With Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "context-optimizer": {
      "command": "npx",
      "args": ["-y", "@aiagentkarl/context-optimizer-mcp"]
    }
  }
}
```

### Run directly

```bash
npx @aiagentkarl/context-optimizer-mcp
```

## Example

**Task:** "Check my Solana wallet balance and find the best DeFi yields"

Without optimizer: 18 servers loaded = ~55k tokens (27% of context)

With optimizer:
- Recommended: `solana` (relevance: 100)
- Tokens used: ~4,800 (2.4% of context)
- **Savings: 91%**

## Server Catalog

Built-in knowledge of 18 popular MCP servers across categories:

- **System:** Filesystem
- **Development:** GitHub
- **Database:** PostgreSQL, SQLite
- **Web:** Fetch, Brave Search, Puppeteer
- **Communication:** Slack
- **Productivity:** Google Drive
- **Blockchain:** Solana
- **Data:** OpenMeteo
- **Infrastructure:** Cloudflare
- **Monitoring:** Sentry
- **Project Management:** Linear
- **Agent Infra:** Memory
- **Reasoning:** Sequential Thinking
- **Utility:** Time

## License

MIT

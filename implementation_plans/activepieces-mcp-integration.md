# ActivePieces MCP Integration Plan

## Overview

ActivePieces is an open-source automation platform (Zapier alternative) that provides **280+ MCP servers** via a single remote URL. This would dramatically simplify our MCP management.

## Current State

We already use remote MCPs via HTTP:
```yaml
exa:
  type: "http"
  url: "https://mcp.exa.ai/mcp?exaApiKey=${EXA_API_KEY}&tools=..."
```

## Proposed Integration

### 1. Add to `config/mcps.yaml`

```yaml
activepieces:
  name: "ActivePieces"
  type: "http"
  url: "https://cloud.activepieces.com/api/v1/mcp/${ACTIVEPIECES_TOKEN}/sse"
  description: "280+ integrations via ActivePieces (Slack, Google Calendar, Notion, HubSpot, etc.)"
```

### 2. Setup Steps

1. Sign up at https://cloud.activepieces.com
2. Go to MCP section in their dashboard
3. Connect desired tools (OAuth handled in their UI):
   - Slack
   - Google Calendar
   - Notion
   - HubSpot
   - Gmail
   - Todoist
   - GitHub
   - Linear
   - etc.
4. Copy the MCP token from their setup instructions
5. Add `ACTIVEPIECES_TOKEN` to `.env.local` and Vercel env vars

### 3. Update Profiles

Replace individual MCPs with ActivePieces in `config/profiles.yaml`:

```yaml
profiles:
  crm:
    mcps:
      - activepieces  # Instead of: hubspot, google-calendar, slack

  personal:
    mcps:
      - activepieces  # Instead of: todoist, google-calendar

  dev:
    mcps:
      - activepieces  # Instead of: github, linear, slack
```

## Benefits

| Aspect | Current (Individual MCPs) | With ActivePieces |
|--------|---------------------------|-------------------|
| OAuth handling | We manage each | Done in their UI |
| Sandbox installs | NPX install per MCP | Single remote URL |
| Spin-up time | ~35s (with installs) | Faster (no installs) |
| Available tools | ~10 configured | 280+ available |
| Adding new tools | Edit yaml + add env vars | Click in their UI |

## Considerations

### Pros
- Massively simplified MCP management
- OAuth flows handled by ActivePieces
- No sandbox installation overhead for npx MCPs
- One token instead of many API keys
- SOC 2 Type II compliant

### Cons
- Adds dependency on ActivePieces service
- Premium pieces (Slack, Google Sheets) require paid plan
- Less control over individual MCP behavior
- Potential latency if their servers are slow

## Pricing

- Free tier available (limited pieces)
- Paid plans for premium integrations
- Check https://www.activepieces.com/pricing for current rates

## Architecture Comparison

```
Current:
  Sandbox → Install npx MCPs → Run CLI → Each MCP server
  Sandbox → Remote HTTP MCPs (Exa) → Exa servers

With ActivePieces:
  Sandbox → Remote HTTP MCP → ActivePieces → All connected tools
```

## Decision Points

1. **Keep Exa separate or use ActivePieces for search too?**
   - ActivePieces may have web search capabilities
   - Exa is specialized for AI search

2. **Hybrid approach?**
   - Use ActivePieces for OAuth-heavy tools (Slack, Google, etc.)
   - Keep Exa for web search
   - Keep specific MCPs where we need fine control

3. **Self-host vs Cloud?**
   - Cloud: Simpler, managed
   - Self-host: More control, no dependency

## Resources

- Website: https://www.activepieces.com
- MCP Page: https://www.activepieces.com/mcp
- GitHub: https://github.com/activepieces/activepieces (19.8k stars)
- Docs: https://www.activepieces.com/docs

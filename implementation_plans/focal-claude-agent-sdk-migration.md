# Focal Migration to Claude Agent SDK

## Executive Summary

Migrate Focal from Agno-based workflows to Claude Agent SDK architecture, gaining true agentic capabilities while preserving Focal's enterprise-grade infrastructure (Composio OAuth, Convex real-time, Braintrust evals).

---

## Why Migrate?

### Current Focal (Agno)

| Aspect | Implementation | Limitation |
|--------|----------------|------------|
| Workflow | Predefined steps (Researcher → Writer → Reviewer) | Rigid, can't adapt |
| Quality loops | Coded iteration until score ≥ 8 | Fixed criteria |
| Tool selection | Explicit in workflow definition | Can't pivot |
| Error recovery | Coded retry logic | Brittle |

### Proposed (Claude Agent SDK)

| Aspect | Implementation | Advantage |
|--------|----------------|-----------|
| Workflow | Claude decides dynamically | Adapts to any task |
| Quality loops | Prompt-based ("iterate until excellent") | Flexible criteria |
| Tool selection | Claude picks tools as needed | Can pivot on discovery |
| Error recovery | Claude reasons about failures | Self-healing |

### Anthropic's Proof Points

- **90.2% improvement** over single-agent on research tasks
- **Production-ready** - Powers Claude's Research feature
- **Multi-session support** - Initializer + Worker pattern for long-running tasks

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         FOCAL 2.0                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Convex     │    │   Vercel     │    │   Composio   │       │
│  │  (Real-time  │◄──►│  Sandbox     │◄──►│   (OAuth +   │       │
│  │   State)     │    │  + Claude    │    │   200+ tools)│       │
│  └──────────────┘    │  Agent SDK   │    └──────────────┘       │
│         ▲            └──────────────┘           ▲               │
│         │                   │                   │               │
│         │            ┌──────┴──────┐            │               │
│         │            │             │            │               │
│    ┌────┴────┐  ┌────┴────┐  ┌────┴────┐  ┌────┴────┐          │
│    │ Tasks   │  │ Lead    │  │ Sub-    │  │ Composio │          │
│    │ (from   │  │ Agent   │  │ agents  │  │ MCP      │          │
│    │ Convex) │  │ (Opus)  │  │(Sonnet) │  │ Server   │          │
│    └─────────┘  └─────────┘  └─────────┘  └──────────┘          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Mapping

### What We Keep from Focal

| Component | Purpose | How It Integrates |
|-----------|---------|-------------------|
| **Convex** | Real-time state, user data | Tasks/drafts stored here |
| **Composio OAuth** | Multi-account tool access | Exposed as MCP server |
| **Braintrust** | Quality evaluation | LLM-as-judge validation |
| **Helicone** | Cost/latency monitoring | Wrap Claude API calls |
| **Next.js UI** | User interface | Shows agent progress |

### What We Replace

| Old (Agno) | New (Claude Agent SDK) | Benefit |
|------------|------------------------|---------|
| `transcript_workflow_v2.py` | Lead Agent prompt | Dynamic, not coded |
| `agents.py` (Researcher, Writer, Reviewer) | Subagent definitions | Claude orchestrates |
| Quality loops (score ≥ 8) | Prompt: "iterate until excellent" | More flexible |
| Pydantic output schemas | JSON Schema in prompts | Same capability |
| Step-based DSL | Progress files + git | More robust |

---

## Implementation Plan

### Phase 1: Composio MCP Server (Week 1)

Create an MCP server that wraps Composio, making all 200+ tools available to Claude.

```typescript
// lib/mcp/composio-mcp.ts
import { createMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { Composio } from "composio-core";

export function createComposioMcp(userEntityId: string) {
  const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

  return createMcpServer({
    name: "composio",
    tools: [
      {
        name: "gmail_send",
        description: "Send an email via Gmail",
        parameters: {
          to: { type: "string", description: "Recipient email" },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body (HTML supported)" }
        },
        handler: async (args) => {
          const result = await composio.executeAction({
            action: "GMAIL_SEND_EMAIL",
            entityId: userEntityId,
            params: args
          });
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
      },
      // ... 200+ more tools
    ]
  });
}
```

**Deliverable:** All Composio actions available as MCP tools

### Phase 2: Lead Agent + Subagents (Week 2)

Define the agent architecture using Claude Agent SDK patterns.

```typescript
// lib/agents/focal-agents.ts
import { ClaudeAgentOptions, AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

export const focalAgentOptions: ClaudeAgentOptions = {
  model: "claude-opus-4-5",  // Lead agent uses Opus

  agents: {
    researcher: {
      description: "Research companies, contacts, and context for sales tasks",
      prompt: `You are a sales intelligence researcher. Given a company or contact:
        1. Find company overview, funding, team size
        2. Identify key decision makers
        3. Find recent news, product launches
        4. Return structured findings

        Use Exa for web search, LinkedIn for people.
        Be thorough but focused on sales-relevant intelligence.`,
      tools: ["mcp__exa__*", "mcp__composio__linkedin_*"],
      model: "claude-sonnet-4"
    },

    writer: {
      description: "Draft sales emails, follow-ups, and proposals",
      prompt: `You are a sales copywriter. Given context and a task:
        1. Draft compelling, personalized copy
        2. Use the research provided
        3. Match the user's tone (check their previous emails)
        4. Keep it concise and action-oriented

        Return drafts in the exact format needed for the tool.`,
      tools: ["mcp__composio__gmail_*", "mcp__composio__hubspot_*"],
      model: "claude-sonnet-4"
    },

    reviewer: {
      description: "Review and improve drafts before execution",
      prompt: `You are a sales quality reviewer. For each draft:
        1. Check personalization (does it reference specific context?)
        2. Check tone (professional but warm?)
        3. Check call-to-action (clear next step?)
        4. Score 1-10 and suggest improvements

        Only approve drafts scoring 8+.`,
      tools: ["Read"],
      model: "claude-sonnet-4"
    }
  },

  mcp_servers: {
    composio: createComposioMcp(userEntityId),
    exa: { type: "http", url: "https://mcp.exa.ai/mcp?exaApiKey=..." }
  }
};
```

**Deliverable:** Agent definitions that Claude orchestrates dynamically

### Phase 3: Transcript Processing Endpoint (Week 2-3)

Replace Agno workflow with Claude Agent SDK execution.

```typescript
// app/api/process-transcript/route.ts
import { query, ClaudeAgentOptions } from "@anthropic-ai/claude-agent-sdk";
import { ConvexHttpClient } from "convex/browser";

export async function POST(req: Request) {
  const { transcriptId, userId } = await req.json();

  // Get transcript from Convex
  const convex = new ConvexHttpClient(process.env.CONVEX_URL!);
  const transcript = await convex.query(api.transcripts.get, { id: transcriptId });

  // Get user's connected accounts for Composio
  const accounts = await convex.query(api.accounts.list, { userId });

  // Create agent options with user's Composio entity
  const options: ClaudeAgentOptions = {
    ...focalAgentOptions,
    mcp_servers: {
      composio: createComposioMcp(userId),
      exa: { type: "http", url: process.env.EXA_MCP_URL }
    }
  };

  // The Lead Agent prompt
  const systemPrompt = `You are Focal, an AI Chief of Staff for sales professionals.

## Your Task
Analyze this call transcript and extract actionable tasks. For each task:
1. Use the researcher subagent to gather context
2. Use the writer subagent to draft the deliverable
3. Use the reviewer subagent to ensure quality (must score 8+)
4. Save the draft for user approval (do NOT execute yet)

## Connected Tools
The user has connected: ${accounts.map(a => a.app).join(', ')}

## Output Format
For each task, save to the tasks array:
{
  "type": "email" | "crm_update" | "calendar" | "slack",
  "title": "Brief description",
  "draft": "The actual content",
  "target": "Who/what this targets",
  "confidence": 0.0-1.0,
  "requires_approval": true
}

## Quality Standards
- Every email must reference specific context from the call
- Every CRM update must include accurate meeting notes
- Every follow-up must have a clear next step
- If unsure, ask for clarification rather than guessing`;

  // Execute with Claude Agent SDK
  const tasks: Task[] = [];

  for await (const message of query({
    prompt: `Process this transcript and extract tasks:\n\n${transcript.content}`,
    options: {
      ...options,
      system: systemPrompt
    }
  })) {
    // Stream progress to Convex for real-time UI updates
    if (message.type === "assistant" && message.content) {
      await convex.mutation(api.transcripts.updateProgress, {
        id: transcriptId,
        progress: message.content
      });
    }

    // Capture extracted tasks
    if (message.type === "result") {
      tasks.push(...message.tasks);
    }
  }

  // Save tasks to Convex for approval
  await convex.mutation(api.tasks.createBatch, {
    transcriptId,
    tasks
  });

  return Response.json({ success: true, taskCount: tasks.length });
}
```

**Deliverable:** Working transcript → tasks pipeline

### Phase 4: Pause/Resume with Progress Files (Week 3)

Implement Anthropic's initializer + worker pattern for long-running tasks.

```typescript
// lib/agents/progress-manager.ts

interface FocalProgress {
  transcriptId: string;
  tasksTotal: number;
  tasksCompleted: number;
  currentTask: string | null;
  history: {
    timestamp: string;
    action: string;
    result: string;
  }[];
}

export async function initializeSession(transcriptId: string): Promise<FocalProgress> {
  // Initializer agent creates progress structure
  return {
    transcriptId,
    tasksTotal: 0,
    tasksCompleted: 0,
    currentTask: null,
    history: [{
      timestamp: new Date().toISOString(),
      action: "session_start",
      result: "Initialized progress tracking"
    }]
  };
}

export async function resumeSession(progress: FocalProgress): Promise<string> {
  // Generate context prompt for resuming agent
  return `## Session Resume

You are continuing work on transcript ${progress.transcriptId}.

### Progress So Far
- Tasks total: ${progress.tasksTotal}
- Tasks completed: ${progress.tasksCompleted}
- Currently working on: ${progress.currentTask || "Nothing (pick next task)"}

### History
${progress.history.map(h => `[${h.timestamp}] ${h.action}: ${h.result}`).join('\n')}

### Instructions
1. Read the history above to understand what's been done
2. Continue from where you left off
3. Work on ONE task at a time
4. Update progress after each task`;
}
```

**Deliverable:** Robust pause/resume across sessions

### Phase 5: User-Facing Features (Week 4)

Surface the agentic capabilities to users.

#### Skills System

```typescript
// lib/skills/index.ts
export const focalSkills = {
  "post-call-processing": {
    name: "Post-Call Processing",
    description: "Extract tasks, draft follow-ups, update CRM",
    prompt: "Process this call transcript and create actionable tasks"
  },
  "prospect-research": {
    name: "Prospect Research",
    description: "Deep research on a company or contact before a call",
    prompt: "Research {target} and prepare a briefing document"
  },
  "weekly-digest": {
    name: "Weekly Digest",
    description: "Summarize all calls and tasks from the past week",
    prompt: "Create a weekly summary of sales activity"
  },
  "deal-analysis": {
    name: "Deal Analysis",
    description: "Analyze a deal's health and suggest next steps",
    prompt: "Analyze the {deal} deal and recommend actions"
  }
};
```

#### Real-Time Progress UI

```typescript
// components/agent-progress.tsx
"use client";
import { useQuery } from "convex/react";

export function AgentProgress({ transcriptId }: { transcriptId: string }) {
  const progress = useQuery(api.transcripts.getProgress, { id: transcriptId });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Spinner className={progress?.isRunning ? "animate-spin" : ""} />
        <span>{progress?.currentAction || "Waiting..."}</span>
      </div>

      <div className="space-y-2">
        {progress?.subagents?.map((agent) => (
          <div key={agent.id} className="flex items-center gap-2 text-sm">
            <Badge variant={agent.status}>{agent.type}</Badge>
            <span>{agent.task}</span>
          </div>
        ))}
      </div>

      <Progress value={(progress?.tasksCompleted / progress?.tasksTotal) * 100} />
    </div>
  );
}
```

**Deliverable:** Skills users can invoke + real-time agent visibility

---

## Migration Checklist

### Phase 1: Foundation
- [ ] Create Composio MCP server wrapper
- [ ] Test all 18 Composio actions as MCP tools
- [ ] Verify OAuth token refresh works

### Phase 2: Agent Architecture
- [ ] Define Lead Agent system prompt
- [ ] Define Researcher, Writer, Reviewer subagents
- [ ] Test multi-agent orchestration in sandbox

### Phase 3: Core Pipeline
- [ ] Replace Agno transcript workflow
- [ ] Implement task extraction with Claude
- [ ] Connect to Convex for state management
- [ ] Add Helicone for monitoring

### Phase 4: Robustness
- [ ] Implement progress file pattern
- [ ] Add session resume capability
- [ ] Test long-running workflows (10+ tasks)
- [ ] Add error recovery prompts

### Phase 5: User Experience
- [ ] Create skills system
- [ ] Build real-time progress component
- [ ] Add approval workflow UI
- [ ] User testing with design partners

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Claude token costs higher | Use Sonnet for subagents, Haiku for routing |
| Composio MCP latency | Cache OAuth tokens, batch operations |
| User trust (autonomous actions) | Require approval for all actions initially |
| Quality regression | Keep Braintrust evals, compare to Agno baseline |

---

## Success Metrics

| Metric | Current (Agno) | Target (Claude SDK) |
|--------|----------------|---------------------|
| Task extraction accuracy | 97% | 97%+ |
| Draft quality score | 7.8/10 avg | 8.5/10 avg |
| Time to first draft | 45s | 30s |
| User approval rate | 72% | 85% |
| Tasks per transcript | 3.2 avg | 5+ avg (finds more) |

---

## Timeline

| Week | Milestone |
|------|-----------|
| 1 | Composio MCP server working |
| 2 | Multi-agent orchestration tested |
| 3 | Full transcript pipeline migrated |
| 4 | User features + design partner testing |

---

## Resources

- [Claude Agent SDK Docs](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Anthropic: Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Anthropic: Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Claude Agent SDK Quickstart](https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding)

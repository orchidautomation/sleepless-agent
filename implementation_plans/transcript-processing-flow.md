# Transcript Processing Flow

## Overview

This document describes how an AI sales assistant should process a call transcript and generate actionable follow-ups. This flow is designed for Claude Agent SDK with MCP tools.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TRANSCRIPT PROCESSING PIPELINE                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │ Ingest   │───►│ Extract  │───►│ Research │───►│ Draft    │      │
│  │ Call     │    │ Entities │    │ Context  │    │ Actions  │      │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘      │
│       │               │               │               │             │
│       ▼               ▼               ▼               ▼             │
│  Transcript     People, Cos,    LinkedIn,      Emails, CRM,        │
│  (raw text)     Topics, Tasks   Web Search     Calendar            │
│                                                                      │
│                         ┌──────────┐                                │
│                         │ Approve  │◄── User reviews drafts        │
│                         │ & Execute│                                │
│                         └──────────┘                                │
│                              │                                      │
│                              ▼                                      │
│                    ┌─────────────────┐                             │
│                    │ Composio Tools  │                             │
│                    │ Gmail, HubSpot, │                             │
│                    │ Calendar, Slack │                             │
│                    └─────────────────┘                             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Entity Extraction

**Input:** Raw transcript text
**Output:** Structured entities

### What to Extract

| Entity Type | Examples | Why It Matters |
|-------------|----------|----------------|
| **People** | Names, titles, companies | CRM contacts |
| **Companies** | Names, domains, context | Account records |
| **Topics** | Products discussed, pain points | Meeting notes |
| **Commitments** | "I'll send you...", "Let's schedule..." | Follow-up tasks |
| **Signals** | Budget mentions, timeline, authority | Deal qualification |
| **Questions** | Unanswered questions from either party | Follow-up content |

### Example Extraction

```json
{
  "participants": {
    "them": {
      "name": "Devreet",
      "title": "Founder / AI Ops Consultant",
      "company": "[To Research]",
      "location": "Vancouver, BC",
      "background": "Ex-Respell (Employee #2), Gumloop advisor"
    }
  },
  "companies_mentioned": [
    { "name": "Respell", "context": "Previous employer, acquired" },
    { "name": "Gumloop", "context": "Current partner, friends with team" }
  ],
  "topics_discussed": [
    "AI automation consulting",
    "Build vs strategy division of labor",
    "Zapier vs Gumloop tool selection",
    "People Ops use cases"
  ],
  "commitments_made": [
    {
      "by": "them",
      "action": "Send scope and compensation details",
      "timeline": "Soon"
    }
  ],
  "signals": {
    "intent": "High - actively looking for build partner",
    "budget": "Exists - billing own clients",
    "timeline": "Immediate - capacity constrained",
    "authority": "Full - owns the business"
  },
  "open_questions": [
    "What's her company name/domain?",
    "What's the specific People Ops client?",
    "What are the exact 3-5 automations needed?"
  ]
}
```

---

## Step 2: Research & Enrichment

**Input:** Extracted entities
**Output:** Enriched context

### Research Tasks

| Entity | Research Action | Tools |
|--------|----------------|-------|
| Person | LinkedIn profile, recent posts | `linkedin_search`, `exa` |
| Company | Website, funding, team size | `exa`, `company_research` |
| Domain | Industry news, competitors | `web_search` |

### Mock Tool Calls

```
→ mcp__exa__linkedin_search({
    query: "Devreet Vancouver AI automation Respell consultant"
  })

→ mcp__exa__web_search({
    query: "Respell AI automation platform acquired"
  })

→ mcp__exa__company_research({
    query: "[her_company_domain]",
    subpages: 5
  })
```

### Enrichment Output

```json
{
  "them": {
    "name": "Devreet [Last Name]",
    "linkedin": "linkedin.com/in/devreet-...",
    "title": "Founder @ [Company]",
    "location": "Vancouver, BC",
    "background": {
      "respell": "Employee #2, helped build from ground up, acquired 2024",
      "gumloop": "Advisor, helped with enterprise strategy",
      "focus": "AI Ops - strategy + automation builds"
    },
    "content_signals": [
      "Recent post about AI in operations",
      "Commented on automation ROI"
    ]
  }
}
```

---

## Step 3: Task Generation

**Input:** Enriched entities + transcript context
**Output:** Actionable tasks with drafts

### Task Categories

| Category | Examples | Tools Used |
|----------|----------|------------|
| **CRM** | Create contact, log meeting, create deal | HubSpot |
| **Email** | Follow-up, thank you, proposal | Gmail |
| **Calendar** | Reminder, schedule next meeting | Google Calendar |
| **Slack** | Notify team, share update | Slack |
| **Notes** | Meeting summary, action items | Notion |

### Task Schema

```typescript
interface Task {
  id: string;
  type: "crm_contact" | "crm_company" | "crm_meeting" | "crm_deal" |
        "email" | "calendar" | "slack" | "notion";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";

  // The actual content/payload
  draft: {
    tool: string;           // Which Composio action
    params: Record<string, any>;  // Tool parameters
  };

  // Metadata
  confidence: number;       // 0-1, how confident is the agent
  requires_approval: boolean;
  reasoning: string;        // Why this task was generated
}
```

---

## Step 4: Draft Generation

### CRM: Create Contact

```
→ mcp__composio__hubspot_create_contact({
    firstName: "Devreet",
    lastName: "[FROM_LINKEDIN]",
    email: "[FROM_LINKEDIN]",
    city: "Vancouver",
    country: "Canada",
    company: "[HER_CONSULTANCY]",
    title: "Founder / AI Ops Consultant",
    leadSource: "LinkedIn Inbound",
    leadStatus: "Open",
    notes: "Ex-Respell #2, Gumloop advisor. Looking for build partner."
  })
```

### CRM: Log Meeting

```
→ mcp__composio__hubspot_create_engagement({
    type: "MEETING",
    contactId: "[CONTACT_ID]",
    title: "Discovery Call - Contract Partnership",
    body: `
## Summary
Devreet runs AI Ops consultancy, looking for build partner.
She handles strategy/architecture, needs someone to build automations.

## Her Background
- Employee #2 at Respell (acquired)
- Gumloop advisor and friend
- Philosophy: Meet clients where they're at

## Opportunity
- Contract work: strategy (her) + build (me)
- First client: People Ops team on Gumloop
- Scope: 3-5 simple automations

## Pricing Discussion
- I quoted $6.5-7k/mo backend, $10k GTM
- She's open to retainer or project %
- Will send proposal

## Next Steps
- Await her scope/compensation proposal
- Start with 1 client trial
    `,
    timestamp: "2024-12-10T13:00:00-05:00"
  })
```

### CRM: Create Deal

```
→ mcp__composio__hubspot_create_deal({
    name: "Devreet - Contract Build Partner",
    stage: "Discovery Completed",
    pipeline: "Partnerships",
    amount: 5000,
    closeDate: "2025-01-15",
    contactId: "[CONTACT_ID]",
    notes: "Trial with 1 client, potential to scale"
  })
```

### Email: Follow-Up Draft

```
→ mcp__composio__gmail_create_draft({
    to: "[DEVREET_EMAIL]",
    subject: "Great chatting - excited about the potential partnership",
    body: `
Hey Devreet,

Really enjoyed our conversation today. Your background at Respell and
the way you think about meeting clients where they're at resonates
with how I approach this work too.

Quick recap:
- You handle client relationships, strategy, and architecture
- I come in to build the automations (Gumloop, Zapier, etc.)
- Start with one client to test the working relationship
- Your People Ops client on Gumloop sounds like a good fit

I'm wrapping up my current engagement over the next ~30 days, so
timing works well on my end.

Looking forward to seeing the details when you have them.

Talk soon,
Brandon
    `
  })
```

### Calendar: Follow-Up Reminder

```
→ mcp__composio__google_calendar_create_event({
    title: "Follow up with Devreet if no response",
    startTime: "2024-12-17T09:00:00-05:00",
    endTime: "2024-12-17T09:30:00-05:00",
    description: "Check if she sent scope/compensation. If not, gentle nudge."
  })
```

---

## Step 5: Quality Review

Before presenting to user, each draft is reviewed:

### Review Criteria

| Criterion | Question | Weight |
|-----------|----------|--------|
| **Personalization** | Does it reference specific call context? | 30% |
| **Accuracy** | Are facts from the call correct? | 25% |
| **Tone** | Does it match the conversation tone? | 20% |
| **Action clarity** | Is there a clear next step? | 15% |
| **Completeness** | Are all necessary fields filled? | 10% |

### Scoring

```
Score >= 8: Auto-approve, present to user
Score 6-7: Flag for review, suggest improvements
Score < 6: Regenerate with feedback
```

---

## Step 6: User Approval

Present all tasks to user for approval:

```
═══════════════════════════════════════════════════════════════
                    TASKS FROM: Brandon <> Devreet
═══════════════════════════════════════════════════════════════

[1] CREATE CONTACT - Devreet (AI Ops Consultant)
    Confidence: 95%
    [APPROVE] [EDIT] [SKIP]

[2] LOG MEETING - Discovery Call Notes
    Confidence: 90%
    [APPROVE] [EDIT] [SKIP]

[3] CREATE DEAL - $5,000 Partnership Opportunity
    Confidence: 85%
    [APPROVE] [EDIT] [SKIP]

[4] DRAFT EMAIL - Follow-up (awaiting send)
    Confidence: 88%
    [APPROVE] [EDIT] [SKIP]

[5] CALENDAR - Reminder to follow up Dec 17
    Confidence: 95%
    [APPROVE] [EDIT] [SKIP]

───────────────────────────────────────────────────────────────
[APPROVE ALL]  [REVIEW EACH]  [CANCEL]
```

---

## Step 7: Execution

Once approved, execute via Composio MCP:

```
Executing 5 tasks...

✓ Contact created: Devreet (ID: 12345)
✓ Meeting logged: Discovery Call (ID: 67890)
✓ Deal created: $5,000 Partnership (ID: 11111)
✓ Email draft saved (ready to send)
✓ Calendar reminder set: Dec 17, 9am

All tasks completed successfully.
```

---

## Error Handling

| Error Type | Response |
|------------|----------|
| **Missing data** | Skip field, flag for user |
| **API failure** | Retry 3x, then queue for later |
| **Low confidence** | Ask user for clarification |
| **Duplicate detected** | Show existing record, ask to update |

---

## Session State (for Pause/Resume)

```json
{
  "transcript_id": "abc123",
  "status": "drafts_ready",
  "tasks_total": 5,
  "tasks_approved": 0,
  "tasks_executed": 0,
  "current_step": "awaiting_approval",
  "drafts": [...],
  "history": [
    { "time": "10:30", "action": "transcript_ingested" },
    { "time": "10:31", "action": "entities_extracted", "count": 12 },
    { "time": "10:32", "action": "research_completed" },
    { "time": "10:35", "action": "drafts_generated", "count": 5 }
  ]
}
```

If session interrupted, resume from `current_step` with full context.

---

## Metrics to Track

| Metric | Target | Why |
|--------|--------|-----|
| Extraction accuracy | >95% | Correct entities found |
| Draft quality score | >8/10 | User satisfaction |
| Approval rate | >80% | Drafts accepted without edit |
| Time to drafts | <60s | User experience |
| Tasks per transcript | 4-6 avg | Value delivered |

---

## Example: Full Processing Run

**Input:** Brandon <> Devreet call transcript (see above)

**Processing Time:** ~45 seconds

**Output:**
- 1 Contact (Devreet)
- 1 Company (her consultancy)
- 1 Meeting engagement (logged)
- 1 Deal ($5k pipeline)
- 1 Email draft (follow-up)
- 1 Calendar event (reminder)
- 1 Pipeline tracker entry

**Confidence:** 89% average across all tasks

**User Action Required:** Review and approve drafts before execution

# Composio Integration Strategy

## Overview

Strategic integration roadmap for Focal - AI Chief of Staff for Sales AEs. Composio provides 1200+ integrations; this document prioritizes what matters for our target market (Series A-D AEs).

---

## Current State

| Integration | Actions | Status |
|-------------|---------|--------|
| **Gmail** | Send, Reply | ✅ Done |
| **HubSpot** | 12 actions (contacts, companies, deals, notes, tasks, search) | ✅ Done |
| **Google Calendar** | Create, Update, Find Free Slots, Free/Busy | ✅ Done |

**Total: 18 actions across 3 platforms**

---

## Integration Tiers

### Tier 0: Launch Requirements (Before First Customer)

| Integration | Why | Actions Needed |
|-------------|-----|----------------|
| **Salesforce** | 50%+ of target market uses it | Create/update contact, Create/update opportunity, Log activity, Create task, Search |
| **Slack** | Team collab, deal rooms, manager updates | Send message, Post to channel, DM user |

**Rationale:** HubSpot + Salesforce covers ~90% of CRM market for funded startups. Slack is ubiquitous for team communication.

### Tier 1: Month 2 (Post-Launch)

| Integration | Why | Actions Needed |
|-------------|-----|----------------|
| **Linear** | SE handoffs, technical follow-ups | Create issue, Add comment, Update status |
| **Zoom** | Schedule calls directly from drafts | Create meeting, Get meeting link |
| **Outlook** | Microsoft-shop customers | Send email, Reply to thread |
| **Microsoft Teams** | Enterprise communication | Send message, Post to channel |

### Tier 2: Based on Customer Demand

| Integration | Use Case | Add When |
|-------------|----------|----------|
| **Pipedrive** | SMB CRM alternative | Customer requests |
| **Close** | Sales-first CRM crowd | Customer requests |
| **Apollo** | Prospecting data enrichment | Research features |
| **Gong** | Pull call insights, context | Deep integrations phase |
| **Calendly** | Scheduling link generation | Booking features |
| **Notion** | Deal rooms, account plans | Documentation features |
| **Docusign** | Contract workflows | Deal closing features |
| **Outreach** | Sequence enrollment | Outbound features |
| **Reply.io** | Sequence enrollment | Outbound features |
| **Attio** | Modern CRM alternative | Customer requests |

### Tier 3: Future Consideration

| Integration | Use Case | Notes |
|-------------|----------|-------|
| **LinkedIn** | Prospect research | API restrictions, compliance risk |
| **Fireflies** | Transcript source | Alternative to Fathom |
| **Loom** | Async video follow-ups | Nice to have |
| **Airtable** | Custom workflows | Power users |

---

## Integration Priority Matrix

```
                        MARKET SIZE
                    Small ←────────→ Large

    HIGH VALUE      │ Close        │ Salesforce ★
    (Core CRM/      │ Pipedrive    │ HubSpot ✓
     Comms)         │ Attio        │ Slack ★
                    │              │ Gmail ✓
    ────────────────┼──────────────┼──────────────
    MEDIUM VALUE    │ Notion       │ Zoom
    (Productivity)  │ Linear       │ Outlook
                    │ Calendly     │ MS Teams
                    │              │ Google Calendar ✓
    ────────────────┼──────────────┼──────────────
    LOWER VALUE     │ Loom         │ Gong
    (Nice to have)  │ Docusign     │ Apollo
                    │              │ Outreach

★ = Launch requirement
✓ = Already done
```

---

## V1 Launch Stack

```
┌─────────────────────────────────────────────────────┐
│                  FOCAL V1 INTEGRATIONS              │
├─────────────────────────────────────────────────────┤
│                                                     │
│   CRM (pick one per customer)                       │
│   ├── HubSpot ✅                                    │
│   └── Salesforce 🔜                                 │
│                                                     │
│   Email                                             │
│   └── Gmail ✅                                      │
│                                                     │
│   Calendar                                          │
│   └── Google Calendar ✅                            │
│                                                     │
│   Team Communication                                │
│   └── Slack 🔜                                      │
│                                                     │
└─────────────────────────────────────────────────────┘

Coverage: ~90% of Series A-D startup AEs
```

---

## Salesforce Actions to Implement

Mirror HubSpot functionality:

| Action | Description |
|--------|-------------|
| `SALESFORCE_CREATE_CONTACT` | Create a new contact |
| `SALESFORCE_UPDATE_CONTACT` | Update contact fields |
| `SALESFORCE_CREATE_ACCOUNT` | Create a new account (company) |
| `SALESFORCE_UPDATE_ACCOUNT` | Update account fields |
| `SALESFORCE_CREATE_OPPORTUNITY` | Create a new opportunity (deal) |
| `SALESFORCE_UPDATE_OPPORTUNITY` | Update opportunity stage, amount |
| `SALESFORCE_CREATE_TASK` | Create a follow-up task |
| `SALESFORCE_LOG_ACTIVITY` | Log a call/meeting activity |
| `SALESFORCE_SEARCH_CONTACTS` | Search contacts by criteria |
| `SALESFORCE_SEARCH_ACCOUNTS` | Search accounts by criteria |
| `SALESFORCE_GET_USER_INFO` | Get current user (owner ID) |

---

## Slack Actions to Implement

| Action | Description | Use Case |
|--------|-------------|----------|
| `SLACK_SEND_MESSAGE` | Send message to channel | "Deal update posted to #sales" |
| `SLACK_SEND_DM` | Direct message a user | "Notify manager about big deal" |
| `SLACK_POST_TO_CHANNEL` | Post formatted message | "Weekly call summary to #team" |

---

## Implementation Checklist

### Before Launch
- [ ] Add Salesforce OAuth flow
- [ ] Implement 11 Salesforce actions (mirror HubSpot)
- [ ] Test Salesforce actions with sandbox
- [ ] Add Slack OAuth flow
- [ ] Implement 3 Slack actions
- [ ] Test Slack actions
- [ ] Update onboarding to support CRM choice (HubSpot vs Salesforce)

### Month 2
- [ ] Add Linear integration (3 actions)
- [ ] Add Zoom integration (2 actions)
- [ ] Evaluate Outlook/MS Teams based on customer feedback

### Ongoing
- [ ] Track customer integration requests
- [ ] Prioritize based on frequency of requests
- [ ] Add integrations that unlock new customer segments

---

## Pricing Implications

All integrations included in base price:

```
Starter:    $79/seat/mo   - All integrations
Pro:        $149/seat/mo  - All integrations + team features
Enterprise: Custom        - All integrations + SSO + support
```

**Philosophy:** Don't nickel-and-dime on integrations. The value is in the AI, not the connections.

---

## Competitive Context

| Competitor | Integrations | Our Advantage |
|------------|--------------|---------------|
| Gong | 100+ | We execute actions, they just read |
| Fathom | 10-20 | We do full post-call workflow |
| Fireflies | 30+ | We're CRM-native, they're transcript-first |
| Generic AI assistants | Varies | We're sales-specialized |

---

## Technical Notes

### Composio SDK Usage

```typescript
// Current pattern in focal-app/lib/composio-actions.ts
export async function executeComposioAction(
  actionSlug: string,
  params: Record<string, unknown>,
  userId: string
) {
  return composio.tools.execute(actionSlug, {
    arguments: params,
    userId,
    dangerouslySkipVersionCheck: true, // TODO: Pin versions for prod
  });
}
```

### Multi-CRM Support

Users connect ONE CRM (HubSpot OR Salesforce). The agent detects which is connected and uses appropriate actions.

```typescript
// Pseudocode for CRM-agnostic actions
async function createContact(data, userId) {
  const connectedCRM = await getConnectedCRM(userId);

  if (connectedCRM === 'hubspot') {
    return executeComposioAction('HUBSPOT_CREATE_CONTACT', data, userId);
  } else if (connectedCRM === 'salesforce') {
    return executeComposioAction('SALESFORCE_CREATE_CONTACT', data, userId);
  }
}
```

---

## Summary

**Launch with 5 integrations:**
1. HubSpot ✅
2. Gmail ✅
3. Google Calendar ✅
4. Salesforce 🔜
5. Slack 🔜

**That covers 90% of the market.** Everything else can wait for customer demand.

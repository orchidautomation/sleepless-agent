# Sleepless Agent for Raycast

AI assistant powered by Sleepless Agent with access to 500+ MCP tools for CRM, email, calendar, GitHub, and more.

## Features

- **Ask Sleepless Agent**: Full-featured form to ask questions or request tasks
- **Quick Ask**: Quickly process selected text, clipboard content, or inline arguments
- **Task History**: View and search your recent tasks and their results

## Installation

### From Source (Development)

1. Clone this repository or navigate to the `raycast-extension` directory
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start development mode:
   ```bash
   npm run dev
   ```
4. The extension will appear in Raycast automatically

### Configuration

1. Open Raycast Preferences (`Cmd + ,`)
2. Navigate to Extensions > Sleepless Agent
3. Enter your **API Key** (this is the `PERSONAL_OS_API_KEY` from your Sleepless Agent deployment)

### Optional Settings

- **API Endpoint**: Custom endpoint if you're running a self-hosted version
- **Stream Response**: Enable/disable streaming (for future enhancement)
- **Save History**: Toggle local task history storage

## Commands

### Ask Sleepless Agent
Open a form to type your task or question. Best for complex, multi-line requests.

**Hotkey suggestion**: `Cmd + Shift + A`

### Quick Ask
Instantly process:
1. Text you provide as an argument
2. Selected text in any application
3. Clipboard content

Great for quick questions or processing highlighted text.

**Hotkey suggestion**: `Cmd + Shift + Q`

### Task History
Browse and search your recent tasks. View full results, copy responses, or re-run tasks.

## Examples

Try asking things like:
- "Check my calendar for tomorrow"
- "Find recent emails from John about the project"
- "Create a GitHub issue for the login bug"
- "What's the weather like today?"
- "Summarize the last 5 Slack messages in #general"

## Development

```bash
# Install dependencies
npm install

# Start development mode
npm run dev

# Lint code
npm run lint

# Fix lint issues
npm run fix-lint

# Build for production
npm run build

# Publish to Raycast Store
npm run publish
```

## API Reference

This extension uses the `/api/task` endpoint:

```typescript
POST /api/task
Headers: {
  "Content-Type": "application/json",
  "X-API-Key": "<YOUR_API_KEY>"
}
Body: {
  "task": "Your prompt here",
  "async": false  // Set to true for background processing
}
```

## License

MIT

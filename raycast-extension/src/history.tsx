import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Detail,
  Icon,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { clearHistory, getHistory, removeFromHistory } from "./history";
import type { HistoryItem } from "./types";

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

function HistoryDetail({ item }: { item: HistoryItem }) {
  const markdown = `# ${item.task}

${item.result}

---

**Task ID:** \`${item.id}\`
**Time:** ${new Date(item.timestamp).toLocaleString()}
${item.duration ? `**Duration:** ${(item.duration / 1000).toFixed(1)}s` : ""}
${item.stepsUsed ? `**Steps Used:** ${item.stepsUsed}` : ""}
`;

  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Result" content={item.result} />
          <Action.CopyToClipboard title="Copy Task" content={item.task} shortcut={{ modifiers: ["cmd"], key: "t" }} />
        </ActionPanel>
      }
    />
  );
}

export default function HistoryCommand() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function loadHistory() {
    setIsLoading(true);
    const items = await getHistory();
    setHistory(items);
    setIsLoading(false);
  }

  useEffect(() => {
    loadHistory();
  }, []);

  async function handleClearHistory() {
    const confirmed = await confirmAlert({
      title: "Clear History",
      message: "Are you sure you want to clear all task history? This cannot be undone.",
      primaryAction: {
        title: "Clear",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (confirmed) {
      await clearHistory();
      setHistory([]);
      showToast({
        style: Toast.Style.Success,
        title: "History Cleared",
      });
    }
  }

  async function handleRemoveItem(id: string) {
    await removeFromHistory(id);
    await loadHistory();
    showToast({
      style: Toast.Style.Success,
      title: "Item Removed",
    });
  }

  if (history.length === 0 && !isLoading) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Clock}
          title="No History Yet"
          description="Your task history will appear here after you ask Sleepless Agent something."
        />
      </List>
    );
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search history...">
      {history.map((item) => (
        <List.Item
          key={item.id}
          title={truncate(item.task, 60)}
          subtitle={truncate(item.result, 50)}
          accessories={[
            { text: formatDate(item.timestamp), icon: Icon.Clock },
            ...(item.duration
              ? [{ tag: { value: `${(item.duration / 1000).toFixed(1)}s`, color: Color.Blue } }]
              : []),
          ]}
          actions={
            <ActionPanel>
              <Action.Push title="View Details" icon={Icon.Eye} target={<HistoryDetail item={item} />} />
              <Action.CopyToClipboard title="Copy Result" content={item.result} />
              <Action.CopyToClipboard
                title="Copy Task"
                content={item.task}
                shortcut={{ modifiers: ["cmd"], key: "t" }}
              />
              <ActionPanel.Section>
                <Action
                  title="Remove from History"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  shortcut={{ modifiers: ["ctrl"], key: "x" }}
                  onAction={() => handleRemoveItem(item.id)}
                />
                <Action
                  title="Clear All History"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  shortcut={{ modifiers: ["ctrl", "shift"], key: "x" }}
                  onAction={handleClearHistory}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

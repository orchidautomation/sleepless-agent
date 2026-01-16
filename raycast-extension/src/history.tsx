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
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { clearHistory, getHistory, removeFromHistory } from "./historyStorage";
import type { HistoryItem } from "./types";

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

function truncate(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

function HistoryDetail({ item }: { item: HistoryItem }) {
  const markdown = item.result;

  return (
    <Detail
      markdown={markdown}
      navigationTitle="Task Details"
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.TagList title="Status">
            <Detail.Metadata.TagList.Item
              text={item.status === "failed" ? "Failed" : "Completed"}
              color={item.status === "failed" ? Color.Red : Color.Green}
            />
          </Detail.Metadata.TagList>
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Task" text={item.task} />
          <Detail.Metadata.Label
            title="Time"
            text={new Date(item.timestamp).toLocaleString()}
            icon={Icon.Calendar}
          />
          {item.duration && (
            <Detail.Metadata.Label
              title="Duration"
              text={`${(item.duration / 1000).toFixed(1)}s`}
              icon={Icon.Clock}
            />
          )}
          {item.stepsUsed && (
            <Detail.Metadata.Label
              title="Steps"
              text={String(item.stepsUsed)}
              icon={Icon.List}
            />
          )}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            title="Copy Result"
            content={item.result}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
          <Action.Paste
            title="Paste Result"
            content={item.result}
            shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
          />
          <Action.CopyToClipboard
            title="Copy Task"
            content={item.task}
            shortcut={{ modifiers: ["cmd"], key: "t" }}
          />
        </ActionPanel>
      }
    />
  );
}

export default function HistoryCommand() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { push } = useNavigation();

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
          title={truncate(item.task, 80)}
          subtitle={truncate(item.result, 100)}
          accessories={[
            {
              tag: {
                value: item.status === "failed" ? "✗" : "✓",
                color: item.status === "failed" ? Color.Red : Color.Green,
              },
            },
            ...(item.duration
              ? [
                  {
                    text: `${(item.duration / 1000).toFixed(1)}s`,
                    icon: Icon.Clock,
                  },
                ]
              : []),
            { text: formatRelativeTime(item.timestamp) },
          ]}
          actions={
            <ActionPanel>
              <Action.Push
                title="View Details"
                icon={Icon.Eye}
                target={<HistoryDetail item={item} />}
              />
              <Action.CopyToClipboard
                title="Copy Result"
                content={item.result}
                shortcut={{ modifiers: ["cmd"], key: "c" }}
              />
              <Action.Paste
                title="Paste Result"
                content={item.result}
                shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
              />
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

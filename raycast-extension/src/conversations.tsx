import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { getConversations, deleteConversation as apiDeleteConversation } from "./api";
import type { ConversationSummary } from "./types";
import AskCommand from "./ask";

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const date = new Date(timestamp);
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

export default function ConversationsCommand() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { push } = useNavigation();

  async function loadConversations() {
    setIsLoading(true);
    try {
      const convs = await getConversations(50);
      setConversations(convs);
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to load conversations",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadConversations();
  }, []);

  async function handleDelete(conversationId: string) {
    const confirmed = await confirmAlert({
      title: "Delete Conversation",
      message: "Are you sure you want to delete this conversation? This cannot be undone.",
      primaryAction: {
        title: "Delete",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (confirmed) {
      const success = await apiDeleteConversation(conversationId);
      if (success) {
        setConversations((prev) => prev.filter((c) => c.id !== conversationId));
        showToast({
          style: Toast.Style.Success,
          title: "Conversation Deleted",
        });
      } else {
        showToast({
          style: Toast.Style.Failure,
          title: "Failed to delete conversation",
        });
      }
    }
  }

  if (conversations.length === 0 && !isLoading) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Message}
          title="No Conversations Yet"
          description="Start a conversation with Ask Orchid and it will appear here."
          actions={
            <ActionPanel>
              <Action
                title="New Chat"
                icon={Icon.Plus}
                onAction={() => push(<AskCommand />)}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search conversations...">
      <List.Section title="Recent Conversations">
        {conversations.map((conv) => (
          <List.Item
            key={conv.id}
            icon={Icon.Message}
            title={conv.title}
            subtitle={`${conv.messageCount} messages`}
            accessories={[
              { text: formatRelativeTime(conv.updatedAt) },
            ]}
            actions={
              <ActionPanel>
                <Action
                  title="Resume"
                  icon={Icon.ArrowRight}
                  onAction={() => push(<AskCommand conversationId={conv.id} />)}
                />
                <Action
                  title="New Chat"
                  icon={Icon.Plus}
                  shortcut={{ modifiers: ["cmd"], key: "n" }}
                  onAction={() => push(<AskCommand />)}
                />
                <ActionPanel.Section>
                  <Action
                    title="Delete"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    shortcut={{ modifiers: ["ctrl"], key: "x" }}
                    onAction={() => handleDelete(conv.id)}
                  />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action
                    title="Refresh"
                    icon={Icon.ArrowClockwise}
                    shortcut={{ modifiers: ["cmd"], key: "r" }}
                    onAction={loadConversations}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}

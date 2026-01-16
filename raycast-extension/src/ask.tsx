import {
  Action,
  ActionPanel,
  Color,
  Detail,
  getPreferenceValues,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useState, useEffect, useRef } from "react";
import { executeTaskStreaming } from "./api";
import { addToHistory } from "./historyStorage";
import type { ConversationMessage, Preferences, TaskResponse } from "./types";

interface Template {
  id: string;
  title: string;
  subtitle: string;
  icon: Icon;
  task?: string; // If set, runs immediately. If not, prefills search.
}

const TEMPLATES: Template[] = [
  {
    id: "calendar",
    title: "Check my calendar today",
    subtitle: "See upcoming meetings and events",
    icon: Icon.Calendar,
    task: "What's on my calendar today?",
  },
  {
    id: "email",
    title: "Read my recent emails",
    subtitle: "Summarize unread messages",
    icon: Icon.Envelope,
    task: "Summarize my recent unread emails",
  },
  {
    id: "research",
    title: "Research a company or person",
    subtitle: "Deep dive with web search",
    icon: Icon.MagnifyingGlass,
  },
  {
    id: "draft",
    title: "Draft an email",
    subtitle: "Compose and send messages",
    icon: Icon.Pencil,
  },
  {
    id: "github",
    title: "Check GitHub notifications",
    subtitle: "PRs, issues, and mentions",
    icon: Icon.Code,
    task: "What are my recent GitHub notifications?",
  },
  {
    id: "notion",
    title: "Search my Notion",
    subtitle: "Find notes and documents",
    icon: Icon.Document,
  },
];

function ResultView({
  task,
  response,
  conversationHistory,
  toolsUsed,
  onRetry,
}: {
  task: string;
  response: TaskResponse;
  conversationHistory?: ConversationMessage[];
  toolsUsed?: string[];
  onRetry?: () => void;
}) {
  const { push } = useNavigation();

  // Build markdown with result and subtle activity footer
  let markdown = response.result || "_No response received._";

  // Add activity summary footer
  const activityParts: string[] = [];
  if (toolsUsed && toolsUsed.length > 0) {
    activityParts.push(`${toolsUsed.length} tool${toolsUsed.length > 1 ? "s" : ""}`);
  }
  if (response.duration) {
    activityParts.push(`${(response.duration / 1000).toFixed(1)}s`);
  }
  if (activityParts.length > 0) {
    markdown += `\n\n---\n*${activityParts.join(" · ")}*`;
  }

  // Build updated history including this exchange
  const updatedHistory: ConversationMessage[] = [
    ...(conversationHistory || []),
    { role: "user", content: task },
    { role: "assistant", content: response.result || "" },
  ];

  return (
    <Detail
      markdown={markdown}
      navigationTitle={response.status === "completed" ? "Done" : "Failed"}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.CopyToClipboard
              title="Copy Result"
              content={response.result || ""}
              shortcut={{ modifiers: ["cmd"], key: "c" }}
            />
            <Action.Paste
              title="Paste Result"
              content={response.result || ""}
              shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              title="Ask Follow-up"
              icon={Icon.Message}
              shortcut={{ modifiers: ["cmd"], key: "n" }}
              onAction={() => push(<AskCommand initialHistory={updatedHistory} />)}
            />
            {onRetry && (
              <Action
                title="Retry Task"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={onRetry}
              />
            )}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function StreamingView({
  task,
  conversationHistory,
}: {
  task: string;
  conversationHistory?: ConversationMessage[];
}) {
  const [streamedText, setStreamedText] = useState("");
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [toolsUsed, setToolsUsed] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [response, setResponse] = useState<TaskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preferences = getPreferenceValues<Preferences>();
  const hasStarted = useRef(false);
  const { push, pop } = useNavigation();

  const startStreaming = async () => {
    try {
      const result = await executeTaskStreaming(
        task,
        {
          onText: (text) => {
            setStreamedText(text);
            setCurrentTool(null);
          },
          onTool: (toolName) => {
            setCurrentTool(toolName);
            setToolsUsed((prev) => {
              if (!prev.includes(toolName)) {
                return [...prev, toolName];
              }
              return prev;
            });
          },
        },
        conversationHistory
      );

      setResponse(result);
      setIsLoading(false);

      // Save to history if enabled
      if (preferences.saveHistory && result.result) {
        await addToHistory({
          id: result.id,
          task,
          result: result.result,
          status: result.status,
          duration: result.duration,
          stepsUsed: result.stepsUsed,
        });
      }

      showToast({
        style: result.status === "completed" ? Toast.Style.Success : Toast.Style.Failure,
        title: result.status === "completed" ? "Done!" : "Task Failed",
        message:
          result.status === "completed"
            ? `${result.duration ? `${(result.duration / 1000).toFixed(1)}s` : ""}`
            : result.error || "Unknown error",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      setIsLoading(false);
      showToast({
        style: Toast.Style.Failure,
        title: "Task Failed",
        message: errorMessage,
      });
    }
  };

  useEffect(() => {
    // Prevent double execution in React strict mode
    if (hasStarted.current) return;
    hasStarted.current = true;
    startStreaming();
  }, [task, preferences.saveHistory]);

  const handleRetry = () => {
    setError(null);
    setStreamedText("");
    setCurrentTool(null);
    setToolsUsed([]);
    setResponse(null);
    setIsLoading(true);
    hasStarted.current = false;
    startStreaming();
  };

  if (error) {
    return (
      <Detail
        markdown={`**Error:** ${error}

_Press ⌘R to retry_`}
        navigationTitle="Error"
        actions={
          <ActionPanel>
            <Action
              title="Retry"
              icon={Icon.ArrowClockwise}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
              onAction={handleRetry}
            />
            <Action.CopyToClipboard title="Copy Error" content={error} />
            <Action
              title="Go Back"
              icon={Icon.ArrowLeft}
              shortcut={{ modifiers: ["cmd"], key: "backspace" }}
              onAction={pop}
            />
          </ActionPanel>
        }
      />
    );
  }

  // Show final result view when done - USE response.result as authoritative
  if (!isLoading && response) {
    return (
      <ResultView
        task={task}
        response={response}
        conversationHistory={conversationHistory}
        toolsUsed={toolsUsed}
        onRetry={handleRetry}
      />
    );
  }

  // Show streaming view while loading - full width, progress in nav title
  const markdown = streamedText || "_Thinking..._";
  const navTitle = currentTool
    ? `${currentTool}${toolsUsed.length > 1 ? ` (${toolsUsed.length})` : ""}`
    : "Working...";

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      navigationTitle={navTitle}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Current Text" content={streamedText} />
        </ActionPanel>
      }
    />
  );
}

export default function AskCommand({
  initialHistory,
}: {
  initialHistory?: ConversationMessage[];
} = {}) {
  const [searchText, setSearchText] = useState("");
  const { push } = useNavigation();
  const isFollowUp = initialHistory && initialHistory.length > 0;

  function runTask(task: string) {
    if (!task.trim()) {
      showToast({
        style: Toast.Style.Failure,
        title: "Enter a task",
      });
      return;
    }
    push(<StreamingView task={task} conversationHistory={initialHistory} />);
  }

  // Filter templates based on search text
  const filteredTemplates = searchText.trim()
    ? TEMPLATES.filter(
        (t) =>
          t.title.toLowerCase().includes(searchText.toLowerCase()) ||
          t.subtitle.toLowerCase().includes(searchText.toLowerCase())
      )
    : TEMPLATES;

  return (
    <List
      searchBarPlaceholder={isFollowUp ? "Ask a follow-up..." : "Ask anything..."}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
    >
      {/* Show custom query option when user types */}
      {searchText.trim() && (
        <List.Section title={isFollowUp ? "Follow-up" : ""}>
          <List.Item
            icon={Icon.ArrowRight}
            title={searchText}
            subtitle="Run this query"
            actions={
              <ActionPanel>
                <Action
                  title="Run"
                  icon={Icon.Play}
                  onAction={() => runTask(searchText)}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      )}

      {/* Template suggestions */}
      <List.Section title={searchText.trim() ? "Suggestions" : isFollowUp ? "Or try..." : "Quick actions"}>
        {filteredTemplates.map((template) => (
          <List.Item
            key={template.id}
            icon={template.icon}
            title={template.title}
            subtitle={template.subtitle}
            actions={
              <ActionPanel>
                {template.task ? (
                  <Action
                    title="Run"
                    icon={Icon.Play}
                    onAction={() => runTask(template.task!)}
                  />
                ) : (
                  <Action
                    title="Use Template"
                    icon={Icon.Pencil}
                    onAction={() => setSearchText(template.title + " ")}
                  />
                )}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      {/* Follow-up context indicator */}
      {isFollowUp && (
        <List.Section title="Context">
          <List.Item
            icon={Icon.Message}
            title={`${initialHistory.length} messages in conversation`}
            subtitle="AI remembers previous context"
            accessories={[{ tag: { value: "Active", color: Color.Green } }]}
          />
        </List.Section>
      )}
    </List>
  );
}

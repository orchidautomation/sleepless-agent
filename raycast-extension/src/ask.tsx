import {
  Action,
  ActionPanel,
  Color,
  Detail,
  Form,
  getPreferenceValues,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useState, useEffect, useRef } from "react";
import { executeTaskStreaming } from "./api";
import { addToHistory } from "./historyStorage";
import type { ConversationMessage, Preferences, TaskResponse } from "./types";

function ResultView({
  task,
  response,
  conversationHistory,
  onRetry,
}: {
  task: string;
  response: TaskResponse;
  conversationHistory?: ConversationMessage[];
  onRetry?: () => void;
}) {
  const { push } = useNavigation();
  // Clean markdown - only show the actual result, no headers or metadata
  const markdown = response.result || "_No response received._";

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
        markdown={`Something went wrong while processing your request.

**Error:** ${error}

_Press ⌘R to retry_`}
        navigationTitle="Error"
        metadata={
          <Detail.Metadata>
            <Detail.Metadata.TagList title="Status">
              <Detail.Metadata.TagList.Item text="Failed" color={Color.Red} />
            </Detail.Metadata.TagList>
            <Detail.Metadata.Separator />
            <Detail.Metadata.Label title="Task" text={task.slice(0, 50)} />
          </Detail.Metadata>
        }
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
        onRetry={handleRetry}
      />
    );
  }

  // Show streaming view while loading - clean markdown, metadata in sidebar
  const markdown = streamedText || "_Thinking..._";

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      navigationTitle={currentTool || "Working..."}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label
            title=""
            text="Running"
            icon={{ source: Icon.Clock, tintColor: Color.Blue }}
          />
          {currentTool && (
            <Detail.Metadata.Label
              title="Tool"
              text={currentTool}
              icon={Icon.Gear}
            />
          )}
          {toolsUsed.length > 0 && (
            <Detail.Metadata.Label
              title="Steps"
              text={String(toolsUsed.length)}
              icon={Icon.Layers}
            />
          )}
        </Detail.Metadata>
      }
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { push } = useNavigation();

  async function handleSubmit(values: { task: string }) {
    if (!values.task.trim()) {
      showToast({
        style: Toast.Style.Failure,
        title: "Enter a task",
      });
      return;
    }

    setIsSubmitting(true);
    push(<StreamingView task={values.task} conversationHistory={initialHistory} />);
    setIsSubmitting(false);
  }

  return (
    <Form
      isLoading={isSubmitting}
      enableDrafts
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Run" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="task"
        title=""
        placeholder="Ask anything... Check my calendar, read emails, search the web..."
        autoFocus
        enableMarkdown={false}
      />
      <Form.Description
        title="Try"
        text="Check my calendar · Read recent emails · Create a GitHub issue · Search the web"
      />
    </Form>
  );
}

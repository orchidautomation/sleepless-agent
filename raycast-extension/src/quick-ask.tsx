import {
  Action,
  ActionPanel,
  Detail,
  getPreferenceValues,
  Icon,
  LaunchProps,
  showToast,
  Toast,
  Clipboard,
  getSelectedText,
} from "@raycast/api";
import { useEffect, useState, useRef } from "react";
import { executeTaskStreaming } from "./api";
import { addToHistory } from "./historyStorage";
import type { Preferences, TaskResponse } from "./types";

interface QuickAskArguments {
  query?: string;
}

export default function QuickAskCommand(props: LaunchProps<{ arguments: QuickAskArguments }>) {
  const [isLoading, setIsLoading] = useState(true);
  const [task, setTask] = useState<string>("");
  const [streamedText, setStreamedText] = useState("");
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [toolsUsed, setToolsUsed] = useState<string[]>([]);
  const [response, setResponse] = useState<TaskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preferences = getPreferenceValues<Preferences>();
  const hasStarted = useRef(false);

  const runTask = async (taskText: string) => {
    try {
      showToast({
        style: Toast.Style.Animated,
        title: "Processing...",
      });

      const result = await executeTaskStreaming(taskText, {
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
      });

      setResponse(result);

      // Save to history if enabled
      if (preferences.saveHistory && result.result) {
        await addToHistory({
          id: result.id,
          task: taskText,
          result: result.result,
          status: result.status,
          duration: result.duration,
          stepsUsed: result.stepsUsed,
        });
      }

      showToast({
        style: Toast.Style.Success,
        title: "Done!",
        message: result.duration ? `${(result.duration / 1000).toFixed(1)}s` : "",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      showToast({
        style: Toast.Style.Failure,
        title: "Failed",
        message: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Prevent double execution in React strict mode
    if (hasStarted.current) return;
    hasStarted.current = true;

    async function run() {
      // Determine the task: argument > selected text > clipboard
      let taskText = props.arguments.query;

      if (!taskText) {
        try {
          taskText = await getSelectedText();
        } catch {
          // No selected text, try clipboard
        }
      }

      if (!taskText) {
        try {
          const clipboard = await Clipboard.readText();
          if (clipboard) {
            taskText = clipboard;
          }
        } catch {
          // No clipboard content
        }
      }

      if (!taskText) {
        setError("No query provided. Please provide a query, select text, or copy text to clipboard.");
        setIsLoading(false);
        return;
      }

      setTask(taskText);
      await runTask(taskText);
    }

    run();
  }, [props.arguments.query, preferences.saveHistory]);

  const handleRetry = () => {
    if (!task) return;
    setError(null);
    setStreamedText("");
    setCurrentTool(null);
    setToolsUsed([]);
    setResponse(null);
    setIsLoading(true);
    runTask(task);
  };

  if (error) {
    return (
      <Detail
        markdown={`**Error:** ${error}

_Press ⌘R to retry_`}
        navigationTitle="Error"
        actions={
          <ActionPanel>
            {task && (
              <Action
                title="Retry"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={handleRetry}
              />
            )}
            <Action.CopyToClipboard title="Copy Error" content={error} />
          </ActionPanel>
        }
      />
    );
  }

  // Show final result when done - USE response.result as authoritative
  if (!isLoading && response) {
    let markdown = `> ${task}\n\n${response.result || "_No response received._"}`;

    // Add activity summary footer
    const activityParts: string[] = [];
    if (toolsUsed.length > 0) {
      activityParts.push(`${toolsUsed.length} tool${toolsUsed.length > 1 ? "s" : ""}`);
    }
    if (response.duration) {
      activityParts.push(`${(response.duration / 1000).toFixed(1)}s`);
    }
    if (activityParts.length > 0) {
      markdown += `\n\n---\n*${activityParts.join(" · ")}*`;
    }

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
                title="Retry"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={handleRetry}
              />
            </ActionPanel.Section>
          </ActionPanel>
        }
      />
    );
  }

  // Show streaming view while loading - full width, progress in nav title
  const responseText = streamedText || "_Thinking..._";
  const markdown = `> ${task}\n\n${responseText}`;
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

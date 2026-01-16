import {
  Action,
  ActionPanel,
  Color,
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
        markdown={`Something went wrong.

**Error:** ${error}

${task ? `**Task:** ${task}` : ""}

_Press ⌘R to retry_`}
        navigationTitle="Error"
        metadata={
          <Detail.Metadata>
            <Detail.Metadata.TagList title="Status">
              <Detail.Metadata.TagList.Item text="Failed" color={Color.Red} />
            </Detail.Metadata.TagList>
          </Detail.Metadata>
        }
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
    const finalResult = response.result || "";

    return (
      <Detail
        markdown={finalResult || "_No response received._"}
        navigationTitle={response.status === "completed" ? "Done" : "Failed"}
        actions={
          <ActionPanel>
            <ActionPanel.Section>
              <Action.CopyToClipboard
                title="Copy Result"
                content={finalResult}
                shortcut={{ modifiers: ["cmd"], key: "c" }}
              />
              <Action.Paste
                title="Paste Result"
                content={finalResult}
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

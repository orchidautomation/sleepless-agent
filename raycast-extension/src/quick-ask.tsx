import {
  Action,
  ActionPanel,
  Detail,
  getPreferenceValues,
  LaunchProps,
  showToast,
  Toast,
  Clipboard,
  getSelectedText,
} from "@raycast/api";
import { useEffect, useState, useRef } from "react";
import { executeTaskStreaming } from "./api";
import { addToHistory } from "./history";
import type { Preferences, TaskResponse } from "./types";

interface QuickAskArguments {
  query?: string;
}

export default function QuickAskCommand(props: LaunchProps<{ arguments: QuickAskArguments }>) {
  const [isLoading, setIsLoading] = useState(true);
  const [task, setTask] = useState<string>("");
  const [streamedText, setStreamedText] = useState("");
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [response, setResponse] = useState<TaskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preferences = getPreferenceValues<Preferences>();
  const hasStarted = useRef(false);

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

      try {
        showToast({
          style: Toast.Style.Animated,
          title: "Processing...",
          message: "Sleepless Agent is working",
        });

        const result = await executeTaskStreaming(taskText, {
          onText: (text) => {
            setStreamedText(text);
            setCurrentTool(null);
          },
          onTool: (toolName) => {
            setCurrentTool(toolName);
          },
        });

        setResponse(result);

        // Save to history if enabled
        if (preferences.saveHistory && result.result) {
          await addToHistory({
            id: result.id,
            task: taskText,
            result: result.result,
            duration: result.duration,
            stepsUsed: result.stepsUsed,
          });
        }

        showToast({
          style: Toast.Style.Success,
          title: "Done!",
          message: `Completed in ${result.duration ? `${(result.duration / 1000).toFixed(1)}s` : "N/A"}`,
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
    }

    run();
  }, [props.arguments.query, preferences.saveHistory]);

  if (error) {
    return (
      <Detail
        markdown={`# Error

${error}

${task ? `**Task:** ${task}` : ""}

Please check your API key and try again.`}
        actions={
          <ActionPanel>
            <Action.CopyToClipboard title="Copy Error" content={error} />
          </ActionPanel>
        }
      />
    );
  }

  // Show final result when done
  if (!isLoading && response) {
    const finalText = streamedText || response.result || "";
    const markdown = `# Result

${finalText}

---

**Task:** ${task}
**Duration:** ${response.duration ? `${(response.duration / 1000).toFixed(1)}s` : "N/A"}
**Steps Used:** ${response.stepsUsed || "N/A"}
`;

    return (
      <Detail
        markdown={markdown}
        actions={
          <ActionPanel>
            <Action.CopyToClipboard title="Copy Result" content={finalText} />
            <Action.Paste title="Paste Result" content={finalText} />
            <Action.CopyToClipboard
              title="Copy Task ID"
              content={response.id}
              shortcut={{ modifiers: ["cmd"], key: "i" }}
            />
          </ActionPanel>
        }
      />
    );
  }

  // Show streaming view while loading
  const statusLine = currentTool ? `🔧 Using: \`${currentTool}\`` : "⏳ _Thinking..._";

  const markdown = `# Processing...

${task ? `**Task:** ${task}` : "Loading..."}

${statusLine}

---

${streamedText || "_Waiting for response..._"}`;

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Current Text" content={streamedText} />
        </ActionPanel>
      }
    />
  );
}

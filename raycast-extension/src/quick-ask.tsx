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
import { useEffect, useState } from "react";
import { executeTask } from "./api";
import { addToHistory } from "./history";
import type { Preferences, TaskResponse } from "./types";

interface QuickAskArguments {
  query?: string;
}

export default function QuickAskCommand(props: LaunchProps<{ arguments: QuickAskArguments }>) {
  const [isLoading, setIsLoading] = useState(true);
  const [task, setTask] = useState<string>("");
  const [response, setResponse] = useState<TaskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preferences = getPreferenceValues<Preferences>();

  useEffect(() => {
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

        const result = await executeTask(taskText);
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
  }, []);

  if (error) {
    return (
      <Detail
        markdown={`# Error

${error}

${task ? `**Task:** ${task}` : ""}

Please check your API key and try again.`}
      />
    );
  }

  if (isLoading || !response) {
    return (
      <Detail
        isLoading={true}
        markdown={`# Processing...

${task ? `**Task:** ${task}` : "Loading..."}

The Sleepless Agent is working on your request.`}
      />
    );
  }

  const markdown = `# Result

${response.result || "No response received."}

---

**Task:** ${task}
**Duration:** ${response.duration ? `${(response.duration / 1000).toFixed(1)}s` : "N/A"}
`;

  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Result" content={response.result || ""} />
          <Action.Paste title="Paste Result" content={response.result || ""} />
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

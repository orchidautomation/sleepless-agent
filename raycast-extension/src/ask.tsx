import {
  Action,
  ActionPanel,
  Detail,
  Form,
  getPreferenceValues,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useState, useEffect, useRef } from "react";
import { executeTaskStreaming } from "./api";
import { addToHistory } from "./history";
import type { Preferences, TaskResponse } from "./types";

function ResultView({ task, response }: { task: string; response: TaskResponse }) {
  const markdown = `# Result

${response.result || "No response received."}

---

**Task ID:** \`${response.id}\`
**Duration:** ${response.duration ? `${(response.duration / 1000).toFixed(1)}s` : "N/A"}
**Steps Used:** ${response.stepsUsed || "N/A"}
`;

  return (
    <Detail
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Status" text={response.status} />
          <Detail.Metadata.Label title="Task" text={task} />
          {response.duration && (
            <Detail.Metadata.Label title="Duration" text={`${(response.duration / 1000).toFixed(1)}s`} />
          )}
          {response.stepsUsed && <Detail.Metadata.Label title="Steps" text={String(response.stepsUsed)} />}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Result" content={response.result || ""} />
          <Action.CopyToClipboard title="Copy Task ID" content={response.id} shortcut={{ modifiers: ["cmd"], key: "i" }} />
        </ActionPanel>
      }
    />
  );
}

function StreamingView({ task }: { task: string }) {
  const [streamedText, setStreamedText] = useState("");
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [response, setResponse] = useState<TaskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preferences = getPreferenceValues<Preferences>();
  const hasStarted = useRef(false);

  useEffect(() => {
    // Prevent double execution in React strict mode
    if (hasStarted.current) return;
    hasStarted.current = true;

    async function startStreaming() {
      try {
        const result = await executeTaskStreaming(task, {
          onText: (text) => {
            setStreamedText(text);
            setCurrentTool(null);
          },
          onTool: (toolName) => {
            setCurrentTool(toolName);
          },
        });

        setResponse(result);
        setIsLoading(false);

        // Save to history if enabled
        if (preferences.saveHistory && result.result) {
          await addToHistory({
            id: result.id,
            task,
            result: result.result,
            duration: result.duration,
            stepsUsed: result.stepsUsed,
          });
        }

        showToast({
          style: result.status === "completed" ? Toast.Style.Success : Toast.Style.Failure,
          title: result.status === "completed" ? "Task Completed" : "Task Failed",
          message:
            result.status === "completed"
              ? `Completed in ${result.duration ? `${(result.duration / 1000).toFixed(1)}s` : "N/A"}`
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
    }

    startStreaming();
  }, [task, preferences.saveHistory]);

  if (error) {
    return (
      <Detail
        markdown={`# Error

Something went wrong while processing your request.

**Error:** ${error}

**Task:** ${task}

Please check your API key and try again.`}
        actions={
          <ActionPanel>
            <Action.CopyToClipboard title="Copy Error" content={error} />
          </ActionPanel>
        }
      />
    );
  }

  // Show final result view when done
  if (!isLoading && response) {
    return <ResultView task={task} response={{ ...response, result: streamedText || response.result }} />;
  }

  // Show streaming view while loading
  const statusLine = currentTool ? `🔧 Using: \`${currentTool}\`` : "⏳ _Thinking..._";

  const markdown = `# Processing...

**Task:** ${task}

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

export default function AskCommand() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { push } = useNavigation();

  async function handleSubmit(values: { task: string }) {
    if (!values.task.trim()) {
      showToast({
        style: Toast.Style.Failure,
        title: "Task Required",
        message: "Please enter a task or question",
      });
      return;
    }

    setIsSubmitting(true);

    showToast({
      style: Toast.Style.Animated,
      title: "Processing...",
      message: "Sleepless Agent is working",
    });

    // Navigate to streaming view
    push(<StreamingView task={values.task} />);

    setIsSubmitting(false);
  }

  return (
    <Form
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Ask Sleepless Agent" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="task"
        title="Task"
        placeholder="What would you like me to do? e.g., 'Check my calendar for tomorrow' or 'Find recent emails from John'"
        enableMarkdown={false}
      />
      <Form.Description
        title="Capabilities"
        text="Sleepless Agent has access to 500+ tools including CRM, email, calendar, GitHub, web search, and more."
      />
    </Form>
  );
}

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
import { useState } from "react";
import { executeTask } from "./api";
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

function LoadingView({ task }: { task: string }) {
  return (
    <Detail
      isLoading={true}
      markdown={`# Processing...

**Task:** ${task}

The Sleepless Agent is working on your request. This may take a moment as it accesses various tools and services.

_Please wait..._`}
    />
  );
}

export default function AskCommand() {
  const [isLoading, setIsLoading] = useState(false);
  const [currentTask, setCurrentTask] = useState<string | null>(null);
  const [response, setResponse] = useState<TaskResponse | null>(null);
  const { push } = useNavigation();
  const preferences = getPreferenceValues<Preferences>();

  async function handleSubmit(values: { task: string }) {
    if (!values.task.trim()) {
      showToast({
        style: Toast.Style.Failure,
        title: "Task Required",
        message: "Please enter a task or question",
      });
      return;
    }

    setCurrentTask(values.task);
    setIsLoading(true);

    // Navigate to loading view
    push(<LoadingView task={values.task} />);

    try {
      const result = await executeTask(values.task);
      setResponse(result);

      // Save to history if enabled
      if (preferences.saveHistory && result.result) {
        await addToHistory({
          id: result.id,
          task: values.task,
          result: result.result,
          duration: result.duration,
          stepsUsed: result.stepsUsed,
        });
      }

      // Navigate to result view
      push(<ResultView task={values.task} response={result} />);

      showToast({
        style: Toast.Style.Success,
        title: "Task Completed",
        message: `Completed in ${result.duration ? `${(result.duration / 1000).toFixed(1)}s` : "N/A"}`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      showToast({
        style: Toast.Style.Failure,
        title: "Task Failed",
        message: errorMessage,
      });

      // Show error in detail view
      push(
        <Detail
          markdown={`# Error

Something went wrong while processing your request.

**Error:** ${errorMessage}

**Task:** ${values.task}

Please check your API key and try again.`}
        />
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form
      isLoading={isLoading}
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

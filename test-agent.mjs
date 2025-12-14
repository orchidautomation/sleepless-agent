import { query } from "@anthropic-ai/claude-agent-sdk";

async function testAgent() {
  console.log("Testing Agent SDK directly...");
  console.log("ANTHROPIC_API_KEY present:", !!process.env.ANTHROPIC_API_KEY);
  
  try {
    for await (const message of query({
      prompt: "What is 2+2? Reply with just the number.",
      options: {
        allowedTools: [],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    })) {
      if (message.type === "assistant") {
        const content = message.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text") {
              console.log("Response:", block.text);
            }
          }
        }
      } else if (message.type === "result") {
        console.log("Result:", message.subtype, message.result || message.errors);
      } else if (message.type === "system") {
        console.log("System:", message.subtype);
      }
    }
    console.log("Test complete!");
  } catch (error) {
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
  }
}

testAgent();

import ms from 'ms';
import { Sandbox } from '@vercel/sandbox';

async function main() {
  console.log('Creating Vercel Sandbox...');

  const sandbox = await Sandbox.create({
    resources: { vcpus: 4 },
    timeout: ms('10m'),
    runtime: 'node22',
  });

  console.log(`Sandbox created: ${sandbox.sandboxId}`);

  // Step 1: Install Claude Code CLI globally
  console.log(`\nInstalling Claude Code CLI...`);
  const installCLI = await sandbox.runCommand({
    cmd: 'npm',
    args: ['install', '-g', '@anthropic-ai/claude-code'],
    stderr: process.stderr,
    stdout: process.stdout,
    sudo: true,
  });

  if (installCLI.exitCode != 0) {
    console.log('Installing Claude Code CLI failed');
    await sandbox.stop();
    process.exit(1);
  }
  console.log(`\n✓ Claude Code CLI installed`);

  // Step 2: Install Agent SDK
  console.log(`\nInstalling Claude Agent SDK...`);
  const installSDK = await sandbox.runCommand({
    cmd: 'npm',
    args: ['install', '@anthropic-ai/claude-agent-sdk', '@anthropic-ai/sdk'],
    stderr: process.stderr,
    stdout: process.stdout,
  });

  if (installSDK.exitCode != 0) {
    console.log('Installing Agent SDK failed');
    await sandbox.stop();
    process.exit(1);
  }
  console.log(`\n✓ Claude Agent SDK installed`);

  // Step 3: Create and run a simple test agent
  console.log(`\nRunning test agent (2+2)...`);

  const agentScript = `
import { query } from '@anthropic-ai/claude-agent-sdk';

async function runTest() {
  for await (const message of query({
    prompt: "What is 2+2? Reply with just the number.",
    options: {
      allowedTools: [],
      permissionMode: "bypassPermissions",
    },
  })) {
    if (message.type === "assistant") {
      const content = message.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text") {
            console.log("Agent response:", block.text);
          }
        }
      }
    } else if (message.type === "result") {
      console.log("Result:", message.subtype);
      if (message.result) console.log("Final:", message.result);
    }
  }
}

runTest().catch(console.error);
`;

  await sandbox.writeFiles([{
    path: '/vercel/sandbox/test-agent.mjs',
    content: Buffer.from(agentScript),
  }]);

  const agentRun = await sandbox.runCommand({
    cmd: 'node',
    args: ['test-agent.mjs'],
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
    },
    stderr: process.stderr,
    stdout: process.stdout,
  });

  if (agentRun.exitCode != 0) {
    console.log('\nAgent test failed');
  } else {
    console.log('\n✓ Agent test passed!');
  }

  // Cleanup
  console.log('\nStopping sandbox...');
  await sandbox.stop();
  console.log('Done!');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

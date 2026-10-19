// Fail closed. Exit 0 allows, exit 2 blocks. A crash of this process is also a block.
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
let body;
try {
  body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
} catch {
  process.stderr.write("pre-tool-guard: unreadable hook input\n");
  process.exit(2);
}

const tool = String(body.tool_name || body.tool || "");
const input = body.tool_input || body.input || {};
const command = String(input.command || "");
const paths = [input.file_path, input.path, input.notebook_path, ...(Array.isArray(input.paths) ? input.paths : [])]
  .filter(Boolean)
  .map(String);

const blockedPath = (value) => {
  const text = value.replaceAll("\\", "/");
  return (
    /(^|\/)\.env(\.|$|\/)/.test(text) ||
    text.includes("/.ssh/") ||
    text.endsWith("/.ssh") ||
    text.includes("/.aws/") ||
    text.endsWith("/.aws") ||
    text.endsWith(".pem") ||
    text.includes("id_rsa")
  );
};

if (paths.some(blockedPath)) {
  process.stderr.write(`blocked path for ${tool}\n`);
  process.exit(2);
}
if (/\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\b/.test(command) || /\brm\s+--recursive\b/.test(command)) {
  process.stderr.write("blocked recursive force-delete\n");
  process.exit(2);
}
process.exit(0);

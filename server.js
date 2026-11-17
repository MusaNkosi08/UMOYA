const http = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.MODEL || "openai/gpt-4o-mini";
const endpoint = "https://models.github.ai/inference/chat/completions";
const systemPrompt = `You are UMOYA, an African learning assistant. Users often code-switch between English, isiXhosa, isiZulu, Sesotho and Afrikaans. Understand the full mixed meaning and reply in the same language mix the user used. First line must be exactly "DETECTED: <languages>". Then explain in style {mode}: simple = short, plain words; student = numbered steps with one check question; professional = precise and concise; african = use a familiar African everyday analogy (taxi rank, spaza shop, stokvel, load shedding). If unsure of a cultural fact, say so. Never invent proverbs or history.`;

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}

async function readJson(req) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 100000) throw new Error("Request too large");
  }
  return JSON.parse(data || "{}");
}

async function chat(req, res) {
  let input;
  try {
    input = await readJson(req);
  } catch {
    return send(res, 400, { error: "Please send valid JSON." });
  }
  if (!Array.isArray(input.messages) || !input.messages.length) {
    return send(res, 400, { error: "Messages are required." });
  }

  const messages = input.messages.slice(-6).map((message) => ({
    role: message && ["user", "assistant"].includes(message.role) ? message.role : "user",
    content: String(message && message.content || "").slice(0, 500)
  }));
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + (process.env["GITHUB_" + "TOKEN"] || "")
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: systemPrompt.replace("{mode}", String(input.mode || "african")) }, ...messages],
        max_tokens: 450
      })
    });
    const result = await response.json();
    if (!response.ok) return send(res, response.status >= 500 ? 502 : response.status, { error: result.error?.message || "The learning assistant is unavailable." });
    const reply = result.choices?.[0]?.message?.content;
    if (typeof reply !== "string") return send(res, 502, { error: "The learning assistant returned an unexpected response." });
    return send(res, 200, { reply });
  } catch {
    return send(res, 502, { error: "Could not reach the learning assistant. Please try again." });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/") {
    try {
      return send(res, 200, await readFile(path.join(__dirname, "index.html"), "utf8"), "text/html; charset=utf-8");
    } catch {
      return send(res, 500, "Unable to load UMOYA.", "text/plain; charset=utf-8");
    }
  }
  if (req.url === "/api/chat") {
    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed." });
    return chat(req, res);
  }
  return send(res, 404, { error: "Not found." });
});

server.listen(PORT, () => console.log(`UMOYA listening on http://localhost:${PORT}`));

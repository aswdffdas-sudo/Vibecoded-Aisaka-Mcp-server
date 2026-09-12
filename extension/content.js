// content.js - Injects Aisaka 2021 Studio Bar & Run buttons into AI web chats
const BRIDGE_URL = "http://127.0.0.1:3021";

// Create and inject toolbar above composer/input
function injectToolbar() {
  if (document.getElementById("aisaka-studio-bar")) return;

  // Locate composer container across ChatGPT, Claude, and DeepSeek
  const composer =
    document.querySelector("form textarea, form [contenteditable='true'], div[contenteditable='true']") ||
    document.querySelector("textarea");

  if (!composer) return;

  const parent = composer.closest("form") || composer.parentElement;
  if (!parent) return;

  const bar = document.createElement("div");
  bar.id = "aisaka-studio-bar";
  bar.className = "aisaka-bar";
  bar.innerHTML = `
    <div class="aisaka-badge">
      <span class="aisaka-dot"></span>
      <span>2021 Studio</span>
    </div>
    <button class="aisaka-btn" id="aisaka-btn-shot">📸 Screen to Chat</button>
    <button class="aisaka-btn" id="aisaka-btn-tree">🌳 Insert Game Tree</button>
    <button class="aisaka-btn" id="aisaka-btn-logs">📜 Insert Logs</button>
  `;

  parent.insertBefore(bar, parent.firstChild);

  // 1. Screen Capture to Chat
  document.getElementById("aisaka-btn-shot").addEventListener("click", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("aisaka-btn-shot");
    btn.textContent = "⏳ Capturing...";

    try {
      const res = await fetch(`${BRIDGE_URL}/api/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "screen_capture", args: {} }),
      });
      const data = await res.json();
      if (data.success && data.result && data.result.imageBase64) {
        // Convert base64 to clipboard image blob so user can Ctrl+V immediately
        const byteCharacters = atob(data.result.imageBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "image/png" });

        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);

        btn.textContent = "✅ Screenshot in Clipboard (Ctrl+V)";
        setTimeout(() => { btn.textContent = "📸 Screen to Chat"; }, 3500);
      } else {
        btn.textContent = "❌ Failed";
        setTimeout(() => { btn.textContent = "📸 Screen to Chat"; }, 2500);
      }
    } catch (err) {
      btn.textContent = "❌ Bridge Offline";
      setTimeout(() => { btn.textContent = "📸 Screen to Chat"; }, 2500);
    }
  });

  // 2. Insert Game Tree
  document.getElementById("aisaka-btn-tree").addEventListener("click", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("aisaka-btn-tree");
    btn.textContent = "⏳ Fetching Tree...";

    try {
      const res = await fetch(`${BRIDGE_URL}/api/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "get_tree", args: { root: "game.Workspace", maxDepth: 2 } }),
      });
      const data = await res.json();
      if (data.success) {
        insertTextIntoComposer("Here is the current 2021 Roblox Studio game hierarchy:\n```json\n" + JSON.stringify(data.result, null, 2) + "\n```\n");
        btn.textContent = "✅ Inserted";
        setTimeout(() => { btn.textContent = "🌳 Insert Game Tree"; }, 2500);
      }
    } catch (err) {
      btn.textContent = "❌ Offline";
      setTimeout(() => { btn.textContent = "🌳 Insert Game Tree"; }, 2500);
    }
  });

  // 3. Insert Logs
  document.getElementById("aisaka-btn-logs").addEventListener("click", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("aisaka-btn-logs");
    btn.textContent = "⏳ Reading Logs...";

    try {
      const res = await fetch(`${BRIDGE_URL}/api/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "get_output_log", args: { limit: 20 } }),
      });
      const data = await res.json();
      if (data.success) {
        insertTextIntoComposer("Here are the recent Roblox Studio output logs:\n```text\n" + data.result + "\n```\n");
        btn.textContent = "✅ Inserted";
        setTimeout(() => { btn.textContent = "📜 Insert Logs"; }, 2500);
      }
    } catch (err) {
      btn.textContent = "❌ Offline";
      setTimeout(() => { btn.textContent = "📜 Insert Logs"; }, 2500);
    }
  });
}

function insertTextIntoComposer(text) {
  const composer =
    document.querySelector("form textarea, form [contenteditable='true'], div[contenteditable='true']") ||
    document.querySelector("textarea");

  if (!composer) return;

  if (composer.tagName === "TEXTAREA") {
    composer.value = (composer.value ? composer.value + "\n" : "") + text;
    composer.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    composer.focus();
    document.execCommand("insertText", false, text);
  }
}

// Attach "Run in 2021 Studio" button to generated Lua/Luau code blocks
function attachCodeBlockButtons() {
  const codeBlocks = document.querySelectorAll("pre code, pre");
  codeBlocks.forEach((block) => {
    if (block.dataset.aisakaAttached) return;
    block.dataset.aisakaAttached = "true";

    const text = block.textContent || "";
    // Only attach to blocks containing lua/roblox keywords
    if (
      text.includes("game:GetService") or
      text.includes("Instance.new") or
      text.includes("Vector3.new") or
      text.includes("CFrame.new") or
      text.includes("Workspace") or
      text.includes("local ")
    ) {
      const pre = block.closest("pre") || block;
      if (pre.style.position !== "relative") {
        pre.style.position = "relative";
      }

      const runBtn = document.createElement("button");
      runBtn.className = "aisaka-run-btn";
      runBtn.textContent = "▶ Run in 2021 Studio";

      runBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        runBtn.textContent = "⏳ Running...";
        runBtn.className = "aisaka-run-btn running";

        try {
          const res = await fetch(`${BRIDGE_URL}/api/call`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tool: "execute_luau",
              args: { code: text },
            }),
          });
          const data = await res.json();
          if (data.success) {
            runBtn.textContent = "✅ Executed!";
            runBtn.className = "aisaka-run-btn done";
            setTimeout(() => {
              runBtn.textContent = "▶ Run in 2021 Studio";
              runBtn.className = "aisaka-run-btn";
            }, 3000);
          } else {
            runBtn.textContent = "❌ Error: " + (data.error ? data.error.slice(0, 20) : "Failed");
            setTimeout(() => {
              runBtn.textContent = "▶ Run in 2021 Studio";
              runBtn.className = "aisaka-run-btn";
            }, 4000);
          }
        } catch (err) {
          runBtn.textContent = "❌ Bridge Offline";
          setTimeout(() => {
            runBtn.textContent = "▶ Run in 2021 Studio";
            runBtn.className = "aisaka-run-btn";
          }, 3000);
        }
      });

      pre.appendChild(runBtn);
    }
  });
}

// Continuous observer for new chat messages and input boxes
setInterval(() => {
  injectToolbar();
  attachCodeBlockButtons();
}, 1500);

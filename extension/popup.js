// popup.js
const statusDot = document.getElementById("statusDot");
const statusBadge = document.getElementById("statusBadge");
const btnScreenshot = document.getElementById("btnScreenshot");
const btnGetTree = document.getElementById("btnGetTree");
const btnGetLogs = document.getElementById("btnGetLogs");
const btnRunCode = document.getElementById("btnRunCode");
const codeInput = document.getElementById("codeInput");
const previewContainer = document.getElementById("previewContainer");
const screenshotImg = document.getElementById("screenshotImg");
const outputBox = document.getElementById("outputBox");

// Check connection status
function updateStatus() {
  chrome.runtime.sendMessage({ action: "check_status" }, (res) => {
    if (res && res.ok) {
      statusDot.className = "status-dot online";
      statusBadge.className = "badge online";
      statusBadge.textContent = "CONNECTED";
    } else {
      statusDot.className = "status-dot offline";
      statusBadge.className = "badge offline";
      statusBadge.textContent = "OFFLINE";
    }
  });
}

function showOutput(text) {
  outputBox.style.display = "block";
  outputBox.textContent = typeof text === "string" ? text : JSON.stringify(text, null, 2);
}

// Screenshot action
btnScreenshot.addEventListener("click", () => {
  btnScreenshot.textContent = "📸 Capturing...";
  chrome.runtime.sendMessage({ action: "call_tool", tool: "screen_capture", args: {} }, (res) => {
    btnScreenshot.textContent = "📸 View Screenshot";
    if (res && res.success && res.result && res.result.imageBase64) {
      screenshotImg.src = `data:image/png;base64,${res.result.imageBase64}`;
      previewContainer.style.display = "block";
      outputBox.style.display = "none";
    } else {
      showOutput("Screenshot failed: " + (res ? res.error : "Unknown error"));
    }
  });
});

// Get Tree action
btnGetTree.addEventListener("click", () => {
  btnGetTree.textContent = "🌳 Fetching...";
  chrome.runtime.sendMessage({ action: "call_tool", tool: "get_tree", args: { root: "game.Workspace", maxDepth: 2 } }, (res) => {
    btnGetTree.textContent = "🌳 Copy Game Tree";
    if (res && res.success) {
      const json = JSON.stringify(res.result, null, 2);
      navigator.clipboard.writeText(json);
      showOutput("Game tree copied to clipboard!\n\n" + json.slice(0, 300) + "...");
    } else {
      showOutput("Error fetching tree: " + (res ? res.error : "Unknown"));
    }
  });
});

// Get Logs action
btnGetLogs.addEventListener("click", () => {
  btnGetLogs.textContent = "📜 Loading...";
  chrome.runtime.sendMessage({ action: "call_tool", tool: "get_output_log", args: { limit: 25 } }, (res) => {
    btnGetLogs.textContent = "📜 View Console Logs";
    if (res && res.success) {
      showOutput(res.result);
    } else {
      showOutput("Error fetching logs: " + (res ? res.error : "Unknown"));
    }
  });
});

// Run Code action
btnRunCode.addEventListener("click", () => {
  const code = codeInput.value.trim();
  if (!code) return;
  btnRunCode.textContent = "⏳ Running...";
  chrome.runtime.sendMessage({ action: "call_tool", tool: "execute_luau", args: { code } }, (res) => {
    btnRunCode.textContent = "▶ Run in Studio";
    if (res && res.success) {
      showOutput("Result: " + res.result);
    } else {
      showOutput("Error: " + (res ? res.error : "Failed"));
    }
  });
});

updateStatus();

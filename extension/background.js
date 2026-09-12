// background.js - Aisaka 2021 Studio Extension Service Worker
const BRIDGE_URL = "http://127.0.0.1:3021";

// Check if local bridge is running
async function checkBridgeStatus() {
  try {
    const res = await fetch(`${BRIDGE_URL}/api/status`, { cache: "no-store" });
    if (res.ok) {
      return await res.json();
    }
    return { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Call a tool on the bridge
async function callBridgeTool(tool, args) {
  try {
    const res = await fetch(`${BRIDGE_URL}/api/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, args: args || {} }),
    });
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "check_status") {
    checkBridgeStatus().then(sendResponse);
    return true;
  }
  if (request.action === "call_tool") {
    callBridgeTool(request.tool, request.args).then(sendResponse);
    return true;
  }
});

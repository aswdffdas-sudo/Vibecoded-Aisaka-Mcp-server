# Aisaka 2021 Roblox Studio - Browser Extension 🌐🎮

A browser extension that connects web AI chats (**ChatGPT**, **Claude**, and **DeepSeek**) directly to **2021 Roblox Studio / Aisaka Studio**.

---

## 🚀 How to Install (Chrome, Edge, Brave, Opera)

1. Open your browser and navigate to the Extensions page:
   * **Chrome**: `chrome://extensions`
   * **Edge**: `edge://extensions`
   * **Brave**: `brave://extensions`
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** (top-left button).
4. Select this folder:
   ```text
   C:\Users\Daniel\Downloads\aisaka studio mcp for githuib\extension
   ```
5. The extension icon will appear in your browser toolbar!

---

## 🌟 What It Does

1. **Popup Window (Click the extension icon)**:
   * Displays live connection status with your 2021 Studio bridge (`http://127.0.0.1:3021`).
   * **📸 View Screenshot**: Captures Studio viewport and displays a live preview.
   * **🌳 Copy Game Tree**: Grabs the Workspace instance hierarchy and copies it to your clipboard.
   * **📜 View Console Logs**: Reads recent Studio output messages.
   * **▶ Quick Luau Exec**: Type or paste any Luau code and run it directly in Studio!

2. **In-Chat Assistant Bar (on ChatGPT, Claude, and DeepSeek)**:
   * Injects a floating bar above the chat input box:
     * **📸 Screen to Chat**: Captures Studio's screen and copies the PNG image straight to your clipboard so you can `Ctrl + V` to send it to the AI.
     * **🌳 Insert Game Tree**: Automatically writes the current game hierarchy into your chat prompt.
     * **📜 Insert Logs**: Inserts recent Studio output into the prompt.
   * **▶ Run in 2021 Studio Button**: Whenever the AI writes Luau code in the chat, a green **"▶ Run in 2021 Studio"** button appears on the code block. Click it, and the code runs in your Studio immediately!

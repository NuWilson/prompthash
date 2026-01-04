# Prompt Hash

Prompt Hash is a Chrome Extension (Manifest V3) that expands short #hashtags into full AI prompt templates in any text field, plus popular AI chat inputs.

## Install (Load Unpacked)
1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Pin the extension for quick access.

## How to Use
- Type a saved shortcode (like `#investigate`) in any text field.
- Press the hotkey **Ctrl+Shift+E** (Windows/Linux) or **Cmd+Shift+E** (Mac) to expand it.
- Optional: enable auto-expand on Space/Enter in the settings page.
- Use the popup to add, edit, delete, or favorite shortcuts.

## Template Variables
- `{clipboard}`: current clipboard text (if available)
- `{selection}`: selected text on the page
- `{url}`: current tab URL
- `{title}`: current tab title
- `{cursor}`: caret placement marker

## Supported AI Sites
- ChatGPT (chat.openai.com / chatgpt.com)
- Claude (claude.ai)
- Perplexity (perplexity.ai)
- Gemini (gemini.google.com)

## Privacy
All data is stored locally (or synced via Chrome sync). No external network calls or analytics.

"use strict";
// StatusResponse / PopupRequest are declared globally in src/types.d.ts
// (shared with background.ts).
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
function render(res) {
    if (!res) {
        statusEl.textContent = "service worker not ready";
        statusEl.className = "status bad";
        startBtn.disabled = false;
        stopBtn.disabled = false;
        return;
    }
    if (!res.enabled) {
        statusEl.textContent = "■ Stopped";
        statusEl.className = "status off";
    }
    else if (res.connected) {
        statusEl.textContent = "✓ Connected to app";
        statusEl.className = "status ok";
    }
    else {
        statusEl.textContent = "… Connecting (is the app running?)";
        statusEl.className = "status bad";
    }
    // Enable only the action that makes sense next.
    startBtn.disabled = res.enabled;
    stopBtn.disabled = !res.enabled;
}
function query(req) {
    chrome.runtime.sendMessage(req, (res) => {
        if (chrome.runtime.lastError) {
            render(undefined);
            return;
        }
        render(res);
    });
}
startBtn.addEventListener("click", () => query("start-socket"));
stopBtn.addEventListener("click", () => query("stop-socket"));
// Initial state, then poll while the popup is open so "Connecting…" flips to
// "Connected" once the socket comes up.
query("get-status");
const poll = setInterval(() => query("get-status"), 1000);
window.addEventListener("unload", () => clearInterval(poll));

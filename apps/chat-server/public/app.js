const messagesEl = document.getElementById("messages");
const activityEl = document.getElementById("activity");
const inputEl = document.getElementById("input");
const composer = document.getElementById("composer");
const statusPill = document.getElementById("status-pill");
const statusText = document.getElementById("status-text");
const interruptBtn = document.getElementById("interrupt-btn");
const clearActivityBtn = document.getElementById("clear-activity");

let ws;
let reconnectTimer;
let isRunning = false;

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => {
    statusPill.classList.add("connected");
    statusText.textContent = isRunning ? "Agent working…" : "Ready";
  };

  ws.onclose = () => {
    statusPill.classList.remove("connected", "running");
    statusText.textContent = "Reconnecting…";
    reconnectTimer = setTimeout(connect, 2000);
  };

  ws.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    handleEvent(data);
  };
}

function handleEvent(data) {
  switch (data.type) {
    case "status":
      setRunning(data.running, data.goal, data.parallelTasks ?? 0);
      break;
    case "run_started":
      setRunning(true, data.goal, data.parallel);
      if (data.parallel) {
        appendMessage("steer", "▶ Side task started…");
      } else {
        appendMessage("thinking", "…");
      }
      break;
    case "run_finished":
      removeThinking();
      break;
    case "steering_applied":
      appendMessage("steer", `↪ Steering current task: ${data.message.slice(0, 120)}`);
      break;
    case "parallel_task":
      appendMessage("steer", `▶ Separate task: ${data.goal.slice(0, 120)}`);
      break;
    case "interrupted":
      appendMessage("steer", `⏹ ${data.reason}`);
      setRunning(false, null, 0);
      break;
    case "reply":
      removeThinking();
      appendMessage("assistant", data.text);
      break;
    case "error":
      removeThinking();
      appendMessage("error", data.message);
      break;
    case "activity":
      appendActivity(data.line);
      break;
  }
}

function setRunning(running, goal, parallelTasks = 0) {
  isRunning = running;
  interruptBtn.disabled = !running;
  statusPill.classList.toggle("running", running);
  if (!running) {
    statusText.textContent = "Ready";
    return;
  }
  const parallelNote = parallelTasks > 0 ? ` (+${parallelTasks} parallel)` : "";
  statusText.textContent = `Working: ${(goal ?? "").slice(0, 36)}${(goal?.length ?? 0) > 36 ? "…" : ""}${parallelNote}`;
}

function appendMessage(kind, text) {
  const el = document.createElement("div");
  el.className = `msg ${kind}`;
  el.textContent = text;
  if (kind === "thinking") el.dataset.thinking = "1";
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeThinking() {
  messagesEl.querySelectorAll('[data-thinking="1"]').forEach((n) => n.remove());
}

function appendActivity(line) {
  const el = document.createElement("div");
  el.className = "activity-line";
  if (line.includes("AGENT")) el.classList.add("agent");
  else if (line.includes("TOOL")) el.classList.add("tool");
  else if (line.includes("STEP")) el.classList.add("step");
  el.textContent = line;
  activityEl.appendChild(el);
  activityEl.scrollTop = activityEl.scrollHeight;
  while (activityEl.children.length > 200) {
    activityEl.removeChild(activityEl.firstChild);
  }
}

function send(text) {
  if (!text.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;
  appendMessage("user", text.trim());
  ws.send(JSON.stringify({ type: "message", text: text.trim() }));
  inputEl.value = "";
  inputEl.style.height = "auto";
}

composer.addEventListener("submit", (e) => {
  e.preventDefault();
  send(inputEl.value);
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send(inputEl.value);
  }
});

inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 160)}px`;
});

interruptBtn.addEventListener("click", () => {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "interrupt" }));
  }
});

clearActivityBtn.addEventListener("click", () => {
  activityEl.innerHTML = "";
});

connect();

const panel = document.getElementById("panel");
const endpoints = {
  approvals: "/api/approvals",
  risks: "/api/risks",
  "open-loops": "/api/open-loops",
  memories: "/api/memories",
  people: "/api/people",
  projects: "/api/projects",
  logs: "/api/logs",
};

async function load(name) {
  panel.textContent = "Loading…";
  const res = await fetch(endpoints[name]);
  const data = await res.json();
  panel.textContent = JSON.stringify(data, null, 2);
}

document.querySelectorAll(".control-nav button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".control-nav button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    load(btn.dataset.panel);
  });
});

load("approvals");

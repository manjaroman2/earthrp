interface Difficulty {
  low: number;
  high: number;
  avg: number;
  label: string;
}

interface Task {
  desc: string;
  diff: Difficulty;
}

interface ParsedImportTask extends Task {
  diffStr: string;
}

interface ParseResult {
  ok: boolean;
  tasks: ParsedImportTask[];
  error: string | null;
}

interface PlayerResult {
  player: string;
  taskList: Task[];
  total: number;
}

function renumberTasks(): void {
  const rows = document.querySelectorAll(".task-row");
  rows.forEach((row, i) => {
    row.querySelector(".task-number")!.textContent = `${i + 1}.`;
  });
}

function autoResizeDesc(el: HTMLTextAreaElement): void {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
  el.addEventListener("input", () => {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  });
}

function addTask(): void {
  const list = document.getElementById("taskList")!;
  const row = document.createElement("div");
  row.className = "task-row";
  row.innerHTML = `
    <span class="task-number"></span>
    <input type="text" class="task-diff" placeholder="e.g. 5 or 3-7">
    <textarea class="task-desc" placeholder="Task description" rows="1"></textarea>
    <button class="btn-icon btn-remove" onclick="removeTask(this)" title="Remove task">&times;</button>
  `;
  list.appendChild(row);
  autoResizeDesc(row.querySelector(".task-desc") as HTMLTextAreaElement);
  renumberTasks();
}

function removeTask(btn: HTMLElement): void {
  const list = document.getElementById("taskList")!;
  if (list.children.length > 1) {
    btn.closest(".task-row")!.remove();
    renumberTasks();
  }
}

function parseDifficulty(str: string): Difficulty | null {
  str = str.trim();
  const rangeMatch = str.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (rangeMatch) {
    const low = parseFloat(rangeMatch[1]);
    const high = parseFloat(rangeMatch[2]);
    if (low > high) return null;
    return { low, high, avg: (low + high) / 2, label: `${low}-${high}` };
  }
  const num = parseFloat(str);
  if (isNaN(num) || num <= 0) return null;
  return { low: num, high: num, avg: num, label: `${num}` };
}

function gatherTasks(): Task[] {
  const rows = document.querySelectorAll(".task-row");
  const tasks: Task[] = [];
  for (const row of rows) {
    const desc = (row.querySelector(".task-desc") as HTMLTextAreaElement).value.trim();
    const diffStr = (row.querySelector(".task-diff") as HTMLInputElement).value.trim();
    if (!desc || !diffStr) continue;
    const diff = parseDifficulty(diffStr);
    if (!diff) continue;
    tasks.push({ desc, diff });
  }
  return tasks;
}

function gatherPlayers(): string[] {
  const inputs = document.querySelectorAll(".player-name") as NodeListOf<HTMLInputElement>;
  const names: string[] = [];
  for (const input of inputs) {
    const name = input.value.trim();
    if (name) names.push(name);
  }
  return names;
}

function generateForPlayer(tasks: Task[], target: number): Task[] {
  const epsilon = 0.01;

  for (let attempt = 0; attempt < 2000; attempt++) {
    const selected: Task[] = [];
    const usedIndices = new Set<number>();
    let remaining = target;

    while (remaining > epsilon) {
      const candidates: number[] = [];
      for (let i = 0; i < tasks.length; i++) {
        if (!usedIndices.has(i) && tasks[i].diff.avg <= remaining + epsilon) {
          candidates.push(i);
        }
      }
      if (candidates.length === 0) break;

      const idx = candidates[Math.floor(Math.random() * candidates.length)];
      usedIndices.add(idx);
      selected.push(tasks[idx]);
      remaining -= tasks[idx].diff.avg;
    }

    if (Math.abs(remaining) < epsilon) {
      return selected;
    }
  }

  const sorted = tasks.map((t, i) => ({ task: t, idx: i })).sort((a, b) => b.task.diff.avg - a.task.diff.avg);
  return greedyFillUnique(sorted.map((s) => s.task), target, epsilon);
}

function generateForPlayerByCount(tasks: Task[], count: number, target: number): Task[] {
  const epsilon = 0.01;

  for (let attempt = 0; attempt < 3000; attempt++) {
    const selected: Task[] = [];
    const usedIndices = new Set<number>();
    let remaining = target;

    while (selected.length < count && remaining > -epsilon) {
      const slotsLeft = count - selected.length;
      const candidates: number[] = [];
      for (let i = 0; i < tasks.length; i++) {
        if (!usedIndices.has(i) && tasks[i].diff.avg <= remaining + epsilon) {
          candidates.push(i);
        }
      }
      if (candidates.length === 0) break;

      if (slotsLeft === 1) {
        // Last slot: find an exact match
        const exact = candidates.filter((i) => Math.abs(tasks[i].diff.avg - remaining) < epsilon);
        if (exact.length > 0) {
          const idx = exact[Math.floor(Math.random() * exact.length)];
          usedIndices.add(idx);
          selected.push(tasks[idx]);
          remaining -= tasks[idx].diff.avg;
        }
        break;
      } else {
        const idx = candidates[Math.floor(Math.random() * candidates.length)];
        usedIndices.add(idx);
        selected.push(tasks[idx]);
        remaining -= tasks[idx].diff.avg;
      }
    }

    if (selected.length === count && Math.abs(remaining) < epsilon) {
      return selected;
    }
  }

  // Fallback: greedy pick closest to target/count average
  const avgTarget = target / count;
  const sorted = [...tasks].sort((a, b) => Math.abs(a.diff.avg - avgTarget) - Math.abs(b.diff.avg - avgTarget));
  const selected: Task[] = [];
  const usedIndices = new Set<number>();
  let remaining = target;
  for (let i = 0; i < sorted.length && selected.length < count; i++) {
    if (!usedIndices.has(tasks.indexOf(sorted[i]))) {
      usedIndices.add(tasks.indexOf(sorted[i]));
      selected.push(sorted[i]);
      remaining -= sorted[i].diff.avg;
    }
  }
  return selected;
}

function getMinScoreForCount(tasks: Task[], count: number): number {
  const sorted = [...tasks].map((t) => t.diff.avg).sort((a, b) => a - b);
  let sum = 0;
  for (let i = 0; i < Math.min(count, sorted.length); i++) {
    sum += sorted[i];
  }
  return sum;
}

function greedyFillUnique(tasks: Task[], target: number, epsilon: number): Task[] {
  const selected: Task[] = [];
  const usedIndices = new Set<number>();
  let remaining = target;

  for (let i = 0; i < tasks.length; i++) {
    if (!usedIndices.has(i) && tasks[i].diff.avg <= remaining + epsilon) {
      usedIndices.add(i);
      selected.push(tasks[i]);
      remaining -= tasks[i].diff.avg;
      if (Math.abs(remaining) < epsilon) return selected;
    }
  }

  for (let i = 0; i < tasks.length; i++) {
    if (!usedIndices.has(i) && Math.abs(tasks[i].diff.avg - remaining) < epsilon) {
      selected.push(tasks[i]);
      return selected;
    }
  }

  return selected;
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function getGenMode(): string {
  const radios = document.querySelectorAll('input[name="genMode"]') as NodeListOf<HTMLInputElement>;
  for (const r of radios) {
    if (r.checked) return r.value;
  }
  return "totalScore";
}

function formatTasksAsText(taskList: Task[]): string {
  return taskList.map((t, i) => `${i + 1}. ${t.diff.label}/ ${t.desc}`).join("\n");
}

function copyPlayerTasks(player: string, taskList: Task[]): void {
  const text = formatTasksAsText(taskList);

  navigator.clipboard.writeText(text).then(() => {
    // Find the button that was just clicked and give feedback
    const buttons = document.querySelectorAll(".btn-copy");
    for (const btn of buttons) {
      if (btn.getAttribute("data-player") === player) {
        btn.textContent = "Copied!";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = "Copy";
          btn.classList.remove("copied");
        }, 1500);
        break;
      }
    }
  });
}

function generate(): void {
  const tasks = gatherTasks();
  const players = gatherPlayers();
  const mode = getGenMode();

  const errors: string[] = [];
  if (tasks.length === 0) errors.push("Add at least one task with description and valid difficulty.");
  if (players.length === 0) errors.push("Enter at least one player name.");

  let target = 0;
  let taskCount = 0;

  if (mode === "totalScore") {
    const targetInput = document.getElementById("targetDifficulty") as HTMLInputElement;
    target = parseFloat(targetInput.value);
    if (isNaN(target) || target <= 0) errors.push("Enter a valid target total difficulty.");

    if (tasks.length > 0 && !isNaN(target) && target > 0) {
      const minAvg = Math.min(...tasks.map((t) => t.diff.avg));
      if (minAvg > target) {
        errors.push(`Smallest task difficulty (${minAvg}) exceeds target (${target}).`);
      }
    }
  } else {
    const countInput = document.getElementById("tasksPerPlayer") as HTMLInputElement;
    taskCount = parseInt(countInput.value);
    if (isNaN(taskCount) || taskCount <= 0) errors.push("Enter a valid number of tasks per player.");

    if (tasks.length > 0 && !isNaN(taskCount) && taskCount > 0) {
      if (taskCount > tasks.length) {
        errors.push(`Not enough tasks (${tasks.length}) for ${taskCount} per player.`);
      } else {
        const targetInput = document.getElementById("taskCountTarget") as HTMLInputElement;
        const targetVal = parseFloat(targetInput.value);
        if (!isNaN(targetVal) && targetVal > 0) {
          target = targetVal;
        } else {
          target = getMinScoreForCount(tasks, taskCount);
        }
      }
    }
  }

  const resultsSection = document.getElementById("results")!;
  const resultsGrid = document.getElementById("resultsGrid")!;

  if (errors.length > 0) {
    resultsGrid.innerHTML = `<div class="error-msg">${errors.join("<br>")}</div>`;
    resultsSection.style.display = "block";
    return;
  }

  const allowDuplicates = (document.getElementById("allowDuplicates") as HTMLInputElement).checked;
  const usedTaskDescs = new Set<string>();

  const results: PlayerResult[] = [];
  let failed = false;
  for (const player of players) {
    const availableTasks = allowDuplicates
      ? tasks
      : tasks.filter((t) => !usedTaskDescs.has(t.desc));

    if (availableTasks.length === 0) {
      results.push({ player, taskList: [], total: 0 });
      failed = true;
      continue;
    }

    const taskList = mode === "taskCount"
      ? generateForPlayerByCount(availableTasks, taskCount, target)
      : generateForPlayer(availableTasks, target);
    const actualTotal = taskList.reduce((sum, t) => sum + t.diff.avg, 0);

    if (mode === "taskCount") {
      if (taskList.length !== taskCount || Math.abs(actualTotal - target) > 0.1) {
        failed = true;
      }
    } else {
      if (Math.abs(actualTotal - target) > 0.1) {
        failed = true;
      }
    }

    if (!allowDuplicates) {
      for (const t of taskList) {
        usedTaskDescs.add(t.desc);
      }
    }

    results.push({ player, taskList, total: actualTotal });
  }

  resultsGrid.innerHTML = "";

  if (failed) {
    const warning = document.createElement("div");
    warning.className = "error-msg";
    warning.textContent =
      "Could not exactly reach the target for all players. Try adjusting the target, the number of tasks, or adding tasks with smaller difficulties.";
    resultsGrid.appendChild(warning);
  }

  // Store results for copy/export handlers
  const resultsCopy: { player: string; taskList: Task[]; total: number }[] = [];
  lastResults = [];

  for (const result of results) {
    resultsCopy.push(result);
    lastResults.push(result);
    const card = document.createElement("div");
    card.className = "player-card";

    const totalLabel = Math.abs(result.total - target) < 0.01
      ? result.total
      : `${result.total.toFixed(1)} (target: ${target})`;

    let tasksHtml = "";
    result.taskList.forEach((task) => {
      tasksHtml += `
        <div class="task-item">
          <span class="task-item-diff">${escapeHtml(task.diff.label)}/</span>
          <span class="task-item-desc"> ${escapeHtml(task.desc)}</span>
        </div>
      `;
    });

    card.innerHTML = `
      <div class="player-card-header">
        <h3>${escapeHtml(result.player)}</h3>
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <span class="total-diff">Total: ${totalLabel}</span>
          <button class="btn-copy" data-player="${escapeHtml(result.player)}">Copy</button>
        </div>
      </div>
      <div class="player-card-body">
        ${tasksHtml || '<div class="task-item"><span class="task-item-desc" style="color:#666">No tasks assigned</span></div>'}
      </div>
    `;
    resultsGrid.appendChild(card);
  }

  // Attach copy handlers
  const copyButtons = resultsGrid.querySelectorAll(".btn-copy");
  copyButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const playerName = btn.getAttribute("data-player")!;
      const r = resultsCopy.find((rc) => rc.player === playerName);
      if (r) copyPlayerTasks(r.player, r.taskList);
    });
  });

  resultsSection.style.display = "block";
  resultsSection.scrollIntoView({ behavior: "smooth" });
}

// --- Import from Text ---

let parsedImportTasks: ParsedImportTask[] = [];

function parseImportText(text: string): ParseResult {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const tasks: ParsedImportTask[] = [];
  const lineRegex = /^(?:\d+[\.\)]\s*)?(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)\s*\/\s*(.+)$/;

  for (const line of lines) {
    const match = line.match(lineRegex);
    if (!match) return { ok: false, tasks: [], error: `Could not parse line: "${line}"` };

    const diffStr = match[1].trim();
    const desc = match[2].trim();
    const diff = parseDifficulty(diffStr);
    if (!diff) return { ok: false, tasks: [], error: `Invalid difficulty "${diffStr}" in line: "${line}"` };

    tasks.push({ desc, diff, diffStr });
  }

  if (tasks.length === 0) return { ok: false, tasks: [], error: "No tasks found in text." };
  return { ok: true, tasks, error: null };
}

function openImportModal(): void {
  const modal = document.getElementById("importModal")!;
  const textarea = document.getElementById("importText") as HTMLTextAreaElement;
  const preview = document.getElementById("importPreview")!;
  const confirmBtn = document.getElementById("importConfirmBtn") as HTMLButtonElement;

  textarea.value = "";
  preview.innerHTML = "";
  confirmBtn.disabled = true;
  parsedImportTasks = [];
  modal.classList.add("active");
  textarea.focus();
}

function closeImportModal(): void {
  document.getElementById("importModal")!.classList.remove("active");
}

function updateImportPreview(): void {
  const text = (document.getElementById("importText") as HTMLTextAreaElement).value;
  const preview = document.getElementById("importPreview")!;
  const confirmBtn = document.getElementById("importConfirmBtn") as HTMLButtonElement;

  if (!text.trim()) {
    preview.innerHTML = "";
    confirmBtn.disabled = true;
    parsedImportTasks = [];
    return;
  }

  const result = parseImportText(text);
  if (result.ok) {
    parsedImportTasks = result.tasks;
    confirmBtn.disabled = false;
    let html = `<div class="import-success">Parsed ${result.tasks.length} task${result.tasks.length !== 1 ? "s" : ""} successfully:</div>`;
    html += '<div class="import-task-list">';
    result.tasks.forEach((t, i) => {
      html += `<div class="import-task-item"><span class="import-task-num">${i + 1}.</span><span class="import-task-diff">[${escapeHtml(t.diff.label)}]</span> ${escapeHtml(t.desc)}</div>`;
    });
    html += "</div>";
    preview.innerHTML = html;
  } else {
    parsedImportTasks = [];
    confirmBtn.disabled = true;
    preview.innerHTML = `<div class="import-error">${escapeHtml(result.error!)}</div>`;
  }
}

function confirmImport(): void {
  if (parsedImportTasks.length === 0) return;

  const list = document.getElementById("taskList")!;
  list.innerHTML = "";

  for (const task of parsedImportTasks) {
    const row = document.createElement("div");
    row.className = "task-row";
    row.innerHTML = `
      <span class="task-number"></span>
      <input type="text" class="task-diff" placeholder="e.g. 5 or 3-7" value="${escapeHtml(task.diffStr)}">
      <textarea class="task-desc" placeholder="Task description" rows="1">${escapeHtml(task.desc)}</textarea>
      <button class="btn-icon btn-remove" onclick="removeTask(this)" title="Remove task">&times;</button>
    `;
    list.appendChild(row);
    autoResizeDesc(row.querySelector(".task-desc") as HTMLTextAreaElement);
  }
  renumberTasks();
  closeImportModal();
}

// --- Export Tasks Input ---

function openExportInputModal(): void {
  const modal = document.getElementById("exportInputModal")!;
  const exportText = document.getElementById("exportInputText")!;
  const tasks = gatherTasks();
  exportText.textContent = tasks.map((t, i) => `${i + 1}. ${t.diff.label}/ ${t.desc}`).join("\n");
  modal.classList.add("active");
}

function closeExportInputModal(): void {
  document.getElementById("exportInputModal")!.classList.remove("active");
}

document.getElementById("exportInputCopyBtn")!.addEventListener("click", () => {
  const text = document.getElementById("exportInputText")!.textContent || "";
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById("exportInputCopyBtn")!;
    btn.textContent = "Copied!";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.textContent = "Copy All";
      btn.classList.remove("copied");
    }, 1500);
  });
});

document.getElementById("exportInputModal")!.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeExportInputModal();
});

// --- Export to Pastebin ---

let lastResults: PlayerResult[] = [];

let lastPastebinUrl: string | null = null;

document.getElementById("exportPastebinBtn")!.addEventListener("click", async () => {
  const sections: string[] = [];
  for (const result of lastResults) {
    let section = `${result.player}\n`;
    section += formatTasksAsText(result.taskList);
    sections.push(section);
  }
  const text = sections.join("\n\n");

  const btn = document.getElementById("exportPastebinBtn")!;
  btn.textContent = "Uploading...";

  try {
    const res = await fetch("https://dpaste.com/api/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ content: text, expiry_days: "30" }),
    });
    if (!res.ok) throw new Error("Upload failed");
    const url = (await res.text()).trim();
    lastPastebinUrl = url;
    await navigator.clipboard.writeText(url);
    btn.textContent = "Link Copied!";
    btn.classList.add("copied");
    const link = document.getElementById("pastebinLink") as HTMLAnchorElement;
    link.href = url;
    link.textContent = url;
    link.style.display = "";
    setTimeout(() => {
      btn.textContent = "Export to Pastebin";
      btn.classList.remove("copied");
    }, 2000);
  } catch {
    btn.textContent = "Failed - try again";
    setTimeout(() => { btn.textContent = "Export to Pastebin"; }, 2000);
  }
});

// Listen for textarea input to live-update preview
document.getElementById("importText")!.addEventListener("input", updateImportPreview);

// Close modal on overlay click
document.getElementById("importModal")!.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeImportModal();
});

// Mode switching
const modeRadios = document.querySelectorAll('input[name="genMode"]') as NodeListOf<HTMLInputElement>;
modeRadios.forEach((radio) => {
  radio.addEventListener("change", () => {
    const totalScoreSettings = document.getElementById("totalScoreSettings")!;
    const taskCountSettings = document.getElementById("taskCountSettings")!;
    if (radio.value === "totalScore") {
      totalScoreSettings.style.display = "";
      taskCountSettings.style.display = "none";
    } else {
      totalScoreSettings.style.display = "none";
      taskCountSettings.style.display = "";
      updateTaskCountHint();
    }
  });
});

function updateTaskCountHint(): void {
  const hint = document.getElementById("taskCountHint")!;
  const countInput = document.getElementById("tasksPerPlayer") as HTMLInputElement;
  const count = parseInt(countInput.value);
  const tasks = gatherTasks();

  if (isNaN(count) || count <= 0 || tasks.length === 0) {
    hint.textContent = "";
    return;
  }

  if (count > tasks.length) {
    hint.textContent = `Only ${tasks.length} tasks available.`;
    return;
  }

  const minScore = getMinScoreForCount(tasks, count);
  hint.textContent = `Lowest possible score with ${count} tasks: ${minScore}`;
}

document.getElementById("tasksPerPlayer")!.addEventListener("input", updateTaskCountHint);

// Also update hint when tasks change
const taskListObserver = new MutationObserver(() => {
  if (getGenMode() === "taskCount") updateTaskCountHint();
});
taskListObserver.observe(document.getElementById("taskList")!, { childList: true, subtree: true });

// Expose functions used by inline onclick handlers
(window as any).addTask = addTask;
(window as any).removeTask = removeTask;
(window as any).generate = generate;
(window as any).openImportModal = openImportModal;
(window as any).closeImportModal = closeImportModal;
(window as any).confirmImport = confirmImport;
(window as any).openExportInputModal = openExportInputModal;
(window as any).closeExportInputModal = closeExportInputModal;

// --- LocalStorage Persistence ---

function saveTasksToStorage(): void {
  const rows = document.querySelectorAll(".task-row");
  const tasks: { diff: string; desc: string }[] = [];
  for (const row of rows) {
    const desc = (row.querySelector(".task-desc") as HTMLTextAreaElement).value;
    const diff = (row.querySelector(".task-diff") as HTMLInputElement).value;
    tasks.push({ diff, desc });
  }
  localStorage.setItem("earthrp_tasks", JSON.stringify(tasks));
}

function savePlayersToStorage(): void {
  const inputs = document.querySelectorAll(".player-name") as NodeListOf<HTMLInputElement>;
  const players: string[] = [];
  for (const input of inputs) {
    players.push(input.value);
  }
  localStorage.setItem("earthrp_players", JSON.stringify(players));
}

function loadFromStorage(): void {
  const tasksJson = localStorage.getItem("earthrp_tasks");
  if (tasksJson) {
    try {
      const tasks: { diff: string; desc: string }[] = JSON.parse(tasksJson);
      if (tasks.length > 0) {
        const list = document.getElementById("taskList")!;
        list.innerHTML = "";
        for (const task of tasks) {
          const row = document.createElement("div");
          row.className = "task-row";
          row.innerHTML = `
            <span class="task-number"></span>
            <input type="text" class="task-diff" placeholder="e.g. 5 or 3-7" value="${escapeHtml(task.diff)}">
            <textarea class="task-desc" placeholder="Task description" rows="1">${escapeHtml(task.desc)}</textarea>
            <button class="btn-icon btn-remove" onclick="removeTask(this)" title="Remove task">&times;</button>
          `;
          list.appendChild(row);
          autoResizeDesc(row.querySelector(".task-desc") as HTMLTextAreaElement);
        }
        renumberTasks();
      }
    } catch { /* ignore corrupt data */ }
  }

  const playersJson = localStorage.getItem("earthrp_players");
  if (playersJson) {
    try {
      const players: string[] = JSON.parse(playersJson);
      const inputs = document.querySelectorAll(".player-name") as NodeListOf<HTMLInputElement>;
      for (let i = 0; i < inputs.length && i < players.length; i++) {
        inputs[i].value = players[i];
      }
    } catch { /* ignore corrupt data */ }
  }
}

function clearTasks(): void {
  localStorage.removeItem("earthrp_tasks");

  const list = document.getElementById("taskList")!;
  list.innerHTML = "";
  const row = document.createElement("div");
  row.className = "task-row";
  row.innerHTML = `
    <span class="task-number">1.</span>
    <input type="text" class="task-diff" placeholder="e.g. 5 or 3-7">
    <textarea class="task-desc" placeholder="Task description" rows="1"></textarea>
    <button class="btn-icon btn-remove" onclick="removeTask(this)" title="Remove task">&times;</button>
  `;
  list.appendChild(row);
  autoResizeDesc(row.querySelector(".task-desc") as HTMLTextAreaElement);
}

function clearPlayers(): void {
  localStorage.removeItem("earthrp_players");

  const inputs = document.querySelectorAll(".player-name") as NodeListOf<HTMLInputElement>;
  for (const input of inputs) {
    input.value = "";
  }
}

// Load saved data on startup
loadFromStorage();

// Attach storage listeners to tasks
function attachTaskStorageListeners(): void {
  const taskList = document.getElementById("taskList")!;
  taskList.addEventListener("input", saveTasksToStorage);
}
attachTaskStorageListeners();

// Save tasks when rows are added/removed
const taskStorageObserver = new MutationObserver(saveTasksToStorage);
taskStorageObserver.observe(document.getElementById("taskList")!, { childList: true });

// Attach storage listeners to players
document.querySelectorAll<HTMLInputElement>(".player-name").forEach((input) => {
  input.addEventListener("input", savePlayersToStorage);
});

document.getElementById("clearTasksBtn")!.addEventListener("click", clearTasks);
document.getElementById("clearPlayersBtn")!.addEventListener("click", clearPlayers);

// Auto-resize initial textareas
document.querySelectorAll<HTMLTextAreaElement>(".task-desc").forEach(autoResizeDesc);

function addTask() {
  const list = document.getElementById("taskList");
  const row = document.createElement("div");
  row.className = "task-row";
  row.innerHTML = `
    <input type="text" class="task-desc" placeholder="Task description">
    <input type="text" class="task-diff" placeholder="e.g. 5 or 3-7">
    <button class="btn-icon btn-remove" onclick="removeTask(this)" title="Remove task">&times;</button>
  `;
  list.appendChild(row);
}

function removeTask(btn) {
  const list = document.getElementById("taskList");
  if (list.children.length > 1) {
    btn.closest(".task-row").remove();
  }
}

function parseDifficulty(str) {
  str = str.trim();
  // Range format: "3-7" or "3 - 7"
  const rangeMatch = str.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (rangeMatch) {
    const low = parseFloat(rangeMatch[1]);
    const high = parseFloat(rangeMatch[2]);
    if (low > high) return null;
    return { low, high, avg: (low + high) / 2, label: `${low}-${high}` };
  }
  // Single number
  const num = parseFloat(str);
  if (isNaN(num) || num <= 0) return null;
  return { low: num, high: num, avg: num, label: `${num}` };
}

function gatherTasks() {
  const rows = document.querySelectorAll(".task-row");
  const tasks = [];
  for (const row of rows) {
    const desc = row.querySelector(".task-desc").value.trim();
    const diffStr = row.querySelector(".task-diff").value.trim();
    if (!desc || !diffStr) continue;
    const diff = parseDifficulty(diffStr);
    if (!diff) continue;
    tasks.push({ desc, diff });
  }
  return tasks;
}

function gatherPlayers() {
  const inputs = document.querySelectorAll(".player-name");
  const names = [];
  for (const input of inputs) {
    const name = input.value.trim();
    if (name) names.push(name);
  }
  return names;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Generate a task list for one player that sums to targetDifficulty (by avg).
// Uses randomized attempts with backtracking.
function generateForPlayer(tasks, target) {
  const epsilon = 0.01;

  // Try many random attempts
  for (let attempt = 0; attempt < 2000; attempt++) {
    const selected = [];
    let remaining = target;

    while (remaining > epsilon) {
      // Find tasks that fit
      const candidates = tasks.filter((t) => t.diff.avg <= remaining + epsilon);
      if (candidates.length === 0) break;

      // Pick a random candidate
      const task = candidates[Math.floor(Math.random() * candidates.length)];
      selected.push(task);
      remaining -= task.diff.avg;
    }

    if (Math.abs(remaining) < epsilon) {
      return selected;
    }
  }

  // Fallback: try a more structured approach using sorted tasks
  const sorted = [...tasks].sort((a, b) => b.diff.avg - a.diff.avg);
  return greedyFill(sorted, target, epsilon);
}

function greedyFill(tasks, target, epsilon) {
  const selected = [];
  let remaining = target;

  // Greedy: largest first
  for (const task of tasks) {
    while (task.diff.avg <= remaining + epsilon) {
      selected.push(task);
      remaining -= task.diff.avg;
      if (Math.abs(remaining) < epsilon) return selected;
    }
  }

  // If we couldn't hit exactly, try smallest tasks to fill gap
  const sorted = [...tasks].sort((a, b) => a.diff.avg - b.diff.avg);
  for (const task of sorted) {
    if (Math.abs(task.diff.avg - remaining) < epsilon) {
      selected.push(task);
      return selected;
    }
  }

  return selected; // Best effort
}

function generate() {
  const tasks = gatherTasks();
  const players = gatherPlayers();
  const targetInput = document.getElementById("targetDifficulty");
  const target = parseFloat(targetInput.value);

  // Validation
  const errors = [];
  if (tasks.length === 0) errors.push("Add at least one task with description and valid difficulty.");
  if (players.length === 0) errors.push("Enter at least one player name.");
  if (isNaN(target) || target <= 0) errors.push("Enter a valid target total difficulty.");

  if (tasks.length > 0 && !isNaN(target) && target > 0) {
    const maxAvg = Math.max(...tasks.map((t) => t.diff.avg));
    if (maxAvg > target) {
      // Not necessarily an error - individual tasks can exceed target if they exactly match
    }
    const minAvg = Math.min(...tasks.map((t) => t.diff.avg));
    if (minAvg > target) {
      errors.push(`Smallest task difficulty (${minAvg}) exceeds target (${target}).`);
    }
  }

  const resultsSection = document.getElementById("results");
  const resultsGrid = document.getElementById("resultsGrid");

  if (errors.length > 0) {
    resultsGrid.innerHTML = `<div class="error-msg">${errors.join("<br>")}</div>`;
    resultsSection.style.display = "block";
    return;
  }

  // Generate for each player
  const results = [];
  let failed = false;
  for (const player of players) {
    const taskList = generateForPlayer(tasks, target);
    const actualTotal = taskList.reduce((sum, t) => sum + t.diff.avg, 0);
    if (Math.abs(actualTotal - target) > 0.1) {
      failed = true;
    }
    results.push({ player, taskList, total: actualTotal });
  }

  // Render results
  resultsGrid.innerHTML = "";

  if (failed) {
    const warning = document.createElement("div");
    warning.className = "error-msg";
    warning.textContent =
      "Could not exactly reach the target difficulty for all players. The task difficulties may not combine to the exact target. Try adjusting the target or adding tasks with smaller difficulties.";
    resultsGrid.appendChild(warning);
  }

  for (const result of results) {
    const card = document.createElement("div");
    card.className = "player-card";

    const totalLabel = Math.abs(result.total - target) < 0.01
      ? result.total
      : `${result.total.toFixed(1)} (target: ${target})`;

    let tasksHtml = "";
    for (const task of result.taskList) {
      tasksHtml += `
        <div class="task-item">
          <span class="task-item-desc">${escapeHtml(task.desc)}</span>
          <span class="task-item-diff">${escapeHtml(task.diff.label)}</span>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="player-card-header">
        <h3>${escapeHtml(result.player)}</h3>
        <span class="total-diff">Total: ${totalLabel}</span>
      </div>
      <div class="player-card-body">
        ${tasksHtml || '<div class="task-item"><span class="task-item-desc" style="color:#666">No tasks assigned</span></div>'}
      </div>
    `;
    resultsGrid.appendChild(card);
  }

  resultsSection.style.display = "block";
  resultsSection.scrollIntoView({ behavior: "smooth" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Expose functions used by inline onclick handlers
window.addTask = addTask;
window.removeTask = removeTask;
window.generate = generate;

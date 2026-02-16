// --- Achievable score computation (subset-sum DP) ---

/** All achievable subset sums (any count) from task avg difficulties, in 0.5 steps */
function computeAchievableScores(avgs: number[]): Set<number> {
  // Work in half-integers to avoid float issues
  const halves = avgs.map((v) => Math.round(v * 2));
  const maxSum = halves.reduce((a, b) => a + b, 0);
  const dp = new Uint8Array(maxSum + 1);
  dp[0] = 1;
  for (const h of halves) {
    // iterate backwards so each task is used at most once
    for (let s = maxSum; s >= h; s--) {
      if (dp[s - h]) dp[s] = 1;
    }
  }
  const result = new Set<number>();
  for (let s = 1; s <= maxSum; s++) {
    if (dp[s]) result.add(s / 2);
  }
  return result;
}

/** All achievable sums using exactly `count` tasks */
function computeAchievableScoresForCount(avgs: number[], count: number): Set<number> {
  const halves = avgs.map((v) => Math.round(v * 2));
  const n = halves.length;
  const maxSum = halves.reduce((a, b) => a + b, 0);
  // dp[k][s] = reachable with exactly k items summing to s
  // Use flat arrays: index = k * (maxSum+1) + s
  const width = maxSum + 1;
  const dp = new Uint8Array((count + 1) * width);
  dp[0] = 1; // k=0, s=0
  for (const h of halves) {
    // iterate k downward, s downward
    for (let k = count - 1; k >= 0; k--) {
      for (let s = maxSum - h; s >= 0; s--) {
        if (dp[k * width + s]) {
          dp[(k + 1) * width + s + h] = 1;
        }
      }
    }
  }
  const result = new Set<number>();
  for (let s = 0; s <= maxSum; s++) {
    if (dp[count * width + s]) result.add(s / 2);
  }
  return result;
}

// --- Multi-player feasibility (greedy subset extraction with DP backtracking) ---

/** Find one subset (any size) from `avgs` summing to `target`. Returns indices or null. */
function findSubsetForSum(avgs: number[], target: number): number[] | null {
  const halves = avgs.map((v) => Math.round(v * 2));
  const targetH = Math.round(target * 2);
  const n = avgs.length;
  const maxSum = halves.reduce((a, b) => a + b, 0);
  if (targetH > maxSum || targetH <= 0) return null;

  const dp = new Uint8Array(maxSum + 1);
  dp[0] = 1;
  const states: Uint8Array[] = [new Uint8Array(dp)];
  for (let i = 0; i < n; i++) {
    for (let s = maxSum; s >= halves[i]; s--) {
      if (dp[s - halves[i]]) dp[s] = 1;
    }
    states.push(new Uint8Array(dp));
  }
  if (!dp[targetH]) return null;

  const result: number[] = [];
  let s = targetH;
  for (let i = n - 1; i >= 0; i--) {
    if (s >= halves[i] && states[i][s - halves[i]]) {
      result.push(i);
      s -= halves[i];
    }
  }
  return result;
}

/** Find one subset of exactly `count` items from `avgs` summing to `target`. Returns indices or null. */
function findSubsetForCount(avgs: number[], count: number, target: number): number[] | null {
  const halves = avgs.map((v) => Math.round(v * 2));
  const targetH = Math.round(target * 2);
  const n = avgs.length;
  if (count > n) return null;
  const maxSum = halves.reduce((a, b) => a + b, 0);
  if (targetH > maxSum || targetH < 0) return null;

  const width = maxSum + 1;
  const dp = new Uint8Array((count + 1) * width);
  dp[0] = 1;
  const states: Uint8Array[] = [new Uint8Array(dp)];
  for (let i = 0; i < n; i++) {
    const h = halves[i];
    for (let k = count - 1; k >= 0; k--) {
      for (let s = maxSum - h; s >= 0; s--) {
        if (dp[k * width + s]) dp[(k + 1) * width + s + h] = 1;
      }
    }
    states.push(new Uint8Array(dp));
  }
  if (!dp[count * width + targetH]) return null;

  const result: number[] = [];
  let k = count, s = targetH;
  for (let i = n - 1; i >= 0; i--) {
    const h = halves[i];
    if (k > 0 && s >= h && states[i][(k - 1) * width + (s - h)]) {
      result.push(i);
      k--;
      s -= h;
    }
  }
  return k === 0 ? result : null;
}

/** Check if `numPlayers` can each get a disjoint subset summing to `target` */
function canServeAllPlayers(
  avgs: number[], numPlayers: number, count: number | null, target: number,
): boolean {
  let remaining = avgs.map((_, i) => i);
  for (let p = 0; p < numPlayers; p++) {
    const remAvgs = remaining.map((i) => avgs[i]);
    const subset = count !== null
      ? findSubsetForCount(remAvgs, count, target)
      : findSubsetForSum(remAvgs, target);
    if (!subset) return false;
    const used = new Set(subset);
    remaining = remaining.filter((_, localIdx) => !used.has(localIdx));
  }
  return true;
}

// --- Score Slider (segmented bar) ---

class ScoreSlider {
  container: HTMLElement;
  valueEl: HTMLElement;
  barEl: HTMLElement;
  boundsEl: HTMLElement;
  achievable: number[] = [];
  achievableSet: Set<number> = new Set();
  allValues: number[] = [];
  selectedValue: number | null = null;
  emptyText: string;
  onChange: ((value: number | null) => void) | null = null;
  private isDragging = false;

  constructor(containerId: string, emptyText: string) {
    this.container = document.getElementById(containerId)!;
    this.emptyText = emptyText;

    this.valueEl = document.createElement("div");
    this.valueEl.className = "score-slider-value";

    this.barEl = document.createElement("div");
    this.barEl.className = "score-bar";

    this.boundsEl = document.createElement("div");
    this.boundsEl.className = "score-slider-bounds";

    this.container.appendChild(this.valueEl);
    this.container.appendChild(this.barEl);
    this.container.appendChild(this.boundsEl);

    this.barEl.addEventListener("mousedown", (e) => this.onPointerDown(e));
    document.addEventListener("mousemove", (e) => this.onPointerMove(e));
    document.addEventListener("mouseup", () => this.onPointerUp());
    this.barEl.addEventListener("touchstart", (e) => this.onTouchStart(e), { passive: false });
    document.addEventListener("touchmove", (e) => this.onTouchMove(e), { passive: false });
    document.addEventListener("touchend", () => this.onPointerUp());

    this.showEmpty();
  }

  private showEmpty(message?: string): void {
    this.valueEl.innerHTML = `<span class="score-slider-empty">${message ?? this.emptyText}</span>`;
    this.barEl.innerHTML = "";
    this.boundsEl.innerHTML = "";
    this.selectedValue = null;
    this.allValues = [];
    this.achievable = [];
    this.achievableSet = new Set();
  }

  update(achievable: Set<number>, emptyMessage?: string): void {
    this.achievable = [...achievable].sort((a, b) => a - b);
    this.achievableSet = new Set(this.achievable);

    if (this.achievable.length === 0) {
      this.showEmpty(emptyMessage);
      return;
    }

    const min = this.achievable[0];
    const max = this.achievable[this.achievable.length - 1];

    this.allValues = [];
    for (let v = min; v <= max + 0.01; v += 0.5) {
      this.allValues.push(Math.round(v * 2) / 2);
    }

    if (this.selectedValue !== null && achievable.has(this.selectedValue)) {
      // keep current selection
    } else {
      this.selectedValue = min;
    }

    this.renderBar();
    this.updateDisplay();
  }

  private renderBar(): void {
    this.barEl.innerHTML = "";

    for (const v of this.allValues) {
      const seg = document.createElement("div");
      seg.className = "score-segment";
      if (this.achievableSet.has(v)) seg.classList.add("achievable");
      if (v === this.selectedValue) seg.classList.add("selected");
      seg.dataset.value = String(v);
      this.barEl.appendChild(seg);
    }

    if (this.allValues.length > 0) {
      const min = this.allValues[0];
      const max = this.allValues[this.allValues.length - 1];
      if (min === max) {
        this.boundsEl.innerHTML = `<span>${min}</span>`;
      } else {
        this.boundsEl.innerHTML = `<span>${min}</span><span>${max}</span>`;
      }
    }
  }

  private selectFromPosition(clientX: number): void {
    if (this.allValues.length === 0) return;
    const rect = this.barEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const ratio = x / rect.width;
    const index = Math.round(ratio * (this.allValues.length - 1));
    const clamped = Math.max(0, Math.min(index, this.allValues.length - 1));
    const value = this.allValues[clamped];

    const snapped = this.snapToAchievable(value);
    if (snapped !== this.selectedValue) {
      this.selectedValue = snapped;
      this.updateDisplay();
      this.updateSegmentClasses();
      if (this.onChange) this.onChange(this.selectedValue);
    }
  }

  private onPointerDown(e: MouseEvent): void {
    if (this.allValues.length === 0) return;
    this.isDragging = true;
    this.selectFromPosition(e.clientX);
    e.preventDefault();
  }

  private onPointerMove(e: MouseEvent): void {
    if (!this.isDragging) return;
    this.selectFromPosition(e.clientX);
  }

  private onPointerUp(): void {
    this.isDragging = false;
  }

  private onTouchStart(e: TouchEvent): void {
    if (this.allValues.length === 0) return;
    this.isDragging = true;
    this.selectFromPosition(e.touches[0].clientX);
    e.preventDefault();
  }

  private onTouchMove(e: TouchEvent): void {
    if (!this.isDragging) return;
    this.selectFromPosition(e.touches[0].clientX);
    e.preventDefault();
  }

  private snapToAchievable(value: number): number {
    if (this.achievable.length === 0) return value;
    let closest = this.achievable[0];
    let minDist = Math.abs(value - closest);
    for (const v of this.achievable) {
      const dist = Math.abs(value - v);
      if (dist < minDist) {
        minDist = dist;
        closest = v;
      }
    }
    return closest;
  }

  private updateSegmentClasses(): void {
    const segments = this.barEl.querySelectorAll(".score-segment");
    for (const seg of segments) {
      const v = parseFloat((seg as HTMLElement).dataset.value!);
      seg.classList.toggle("selected", v === this.selectedValue);
    }
  }

  private updateDisplay(): void {
    if (this.selectedValue === null) {
      this.valueEl.innerHTML = `<span class="score-slider-empty">${this.emptyText}</span>`;
    } else {
      this.valueEl.textContent = String(this.selectedValue);
    }
  }

  getValue(): number | null {
    return this.selectedValue;
  }

  setValue(v: number): void {
    if (this.achievable.includes(v)) {
      this.selectedValue = v;
      this.updateDisplay();
      this.updateSegmentClasses();
    }
  }
}

interface Difficulty {
  low: number;
  high: number;
  avg: number;
  label: string;
}

interface Task {
  num: number;
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
    <input type="text" class="task-diff" placeholder="3-7">
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

  for (const [index, row] of rows.entries()) { 
      const desc = (row.querySelector(".task-desc") as HTMLTextAreaElement).value.trim();
      const diffStr = (row.querySelector(".task-diff") as HTMLInputElement).value.trim();
      if (!desc || !diffStr) continue;
      const diff = parseDifficulty(diffStr);
      if (!diff) continue;
      tasks.push({ num: index + 1, desc, diff });
   }

  // for (const row of rows) {
  //   const desc = (row.querySelector(".task-desc") as HTMLTextAreaElement).value.trim();
  //   const diffStr = (row.querySelector(".task-diff") as HTMLInputElement).value.trim();
  //   if (!desc || !diffStr) continue;
  //   const diff = parseDifficulty(diffStr);
  //   if (!diff) continue;
  //   tasks.push({ desc, diff });
  // }
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
  return taskList.map((t) => `${t.num}. ${t.diff.label}/ ${t.desc}`).join("\n");
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

function clearPanelError(id: string): void {
  const el = document.getElementById(id)!;
  el.textContent = "";
  el.closest(".panel")?.classList.remove("panel-has-error");
}

function clearPanelErrors(): void {
  clearPanelError("tasksError");
  clearPanelError("playersError");
  clearPanelError("modeError");
}

function setPanelError(id: string, message: string): void {
  const el = document.getElementById(id)!;
  el.textContent = message;
  el.closest(".panel")?.classList.add("panel-has-error");
}

function generate(): void {
  clearPanelErrors();

  const tasks = gatherTasks();
  const players = gatherPlayers();
  const mode = getGenMode();

  let hasErrors = false;
  if (tasks.length === 0) {
    setPanelError("tasksError", "Add at least one task with description and valid difficulty.");
    hasErrors = true;
  }
  if (players.length === 0) {
    setPanelError("playersError", "Enter at least one player name.");
    hasErrors = true;
  }

  let target = 0;
  let taskCount = 0;

  if (mode === "totalScore") {
    const val = totalScoreSlider.getValue();
    if (val === null || val <= 0) {
      setPanelError("modeError", "Add tasks to set a target total difficulty.");
      hasErrors = true;
    } else {
      target = val;
    }
  } else {
    const countInput = document.getElementById("tasksPerPlayer") as HTMLInputElement;
    taskCount = parseInt(countInput.value);
    if (isNaN(taskCount) || taskCount <= 0) {
      setPanelError("modeError", "Enter a valid number of tasks per player.");
      hasErrors = true;
    }

    if (tasks.length > 0 && !isNaN(taskCount) && taskCount > 0) {
      if (taskCount > tasks.length) {
        setPanelError("modeError", `Not enough tasks (${tasks.length}) for ${taskCount} per player.`);
        hasErrors = true;
      } else {
        const val = taskCountTargetSlider.getValue();
        if (val !== null && val > 0) {
          target = val;
        } else {
          target = getMinScoreForCount(tasks, taskCount);
        }
      }
    }
  }

  const resultsSection = document.getElementById("results")!;
  const resultsGrid = document.getElementById("resultsGrid")!;

  if (hasErrors) {
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
    setPanelError("modeError", "Could not exactly reach the target for all players. Try adjusting the target, the number of tasks, or adding tasks with smaller difficulties.");
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
          <span class="task-item-desc">${escapeHtml(task.desc)}</span>
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

    tasks.push({ num: tasks.length + 1, desc, diff, diffStr });
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
      <input type="text" class="task-diff" placeholder="3-7" value="${escapeHtml(task.diffStr)}">
      <textarea class="task-desc" placeholder="Task description" rows="1">${escapeHtml(task.desc)}</textarea>
      <button class="btn-icon btn-remove" onclick="removeTask(this)" title="Remove task">&times;</button>
    `;
    list.appendChild(row);
    autoResizeDesc(row.querySelector(".task-desc") as HTMLTextAreaElement);
  }
  renumberTasks();
  clearPanelError("tasksError");
  closeImportModal();
}

// --- Export Tasks Input ---

function openExportInputModal(): void {
  const modal = document.getElementById("exportInputModal")!;
  const exportText = document.getElementById("exportInputText")!;
  const tasks = gatherTasks();
  exportText.textContent = tasks.map((t) => `${t.num}. ${t.diff.label}/ ${t.desc}`).join("\n");
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
function applyModeSettings(): void {
  const mode = getGenMode();
  const totalScoreSettings = document.getElementById("totalScoreSettings")!;
  const taskCountSettings = document.getElementById("taskCountSettings")!;
  if (mode === "totalScore") {
    totalScoreSettings.style.display = "";
    taskCountSettings.style.display = "none";
    refreshTotalScoreSlider();
  } else {
    totalScoreSettings.style.display = "none";
    taskCountSettings.style.display = "";
    refreshTaskCountSlider();
  }
}

const modeRadios = document.querySelectorAll('input[name="genMode"]') as NodeListOf<HTMLInputElement>;
modeRadios.forEach((radio) => {
  radio.addEventListener("change", () => {
    applyModeSettings();
    document.querySelector(".mode-panel")!.scrollIntoView({ behavior: "smooth", block: "center" });
  });
});

// --- Slider instances ---

const totalScoreSlider = new ScoreSlider("targetDifficultySlider", "Add tasks to see options");
const taskCountTargetSlider = new ScoreSlider("taskCountTargetSlider", "Set tasks per player first");

function refreshTotalScoreSlider(): void {
  const tasks = gatherTasks();
  if (tasks.length === 0) {
    totalScoreSlider.update(new Set());
    return;
  }
  const avgs = tasks.map((t) => t.diff.avg);
  const numPlayers = gatherPlayers().length;
  const allowDuplicates = (document.getElementById("allowDuplicates") as HTMLInputElement).checked;

  let achievable = computeAchievableScores(avgs);
  if (!allowDuplicates && numPlayers > 1) {
    const filtered = new Set<number>();
    for (const score of achievable) {
      if (canServeAllPlayers(avgs, numPlayers, null, score)) {
        filtered.add(score);
      }
    }
    achievable = filtered;
  }
  totalScoreSlider.update(achievable);
}

function refreshTaskCountSlider(): void {
  const countInput = document.getElementById("tasksPerPlayer") as HTMLInputElement;
  const count = parseInt(countInput.value);
  const tasks = gatherTasks();
  const numPlayers = gatherPlayers().length;
  const allowDuplicates = (document.getElementById("allowDuplicates") as HTMLInputElement).checked;

  if (isNaN(count) || count <= 0) {
    taskCountTargetSlider.update(new Set(), "Set tasks per player first");
    return;
  }
  if (tasks.length === 0) {
    taskCountTargetSlider.update(new Set(), "Add tasks to see options");
    return;
  }
  if (count > tasks.length) {
    taskCountTargetSlider.update(new Set(), `Not enough tasks — need at least ${count}, have ${tasks.length}`);
    return;
  }
  if (!allowDuplicates && numPlayers > 1 && count * numPlayers > tasks.length) {
    taskCountTargetSlider.update(new Set(), `Need at least ${count * numPlayers} tasks for ${numPlayers} players without duplicates`);
    return;
  }

  const avgs = tasks.map((t) => t.diff.avg);
  let achievable = computeAchievableScoresForCount(avgs, count);
  if (!allowDuplicates && numPlayers > 1) {
    const filtered = new Set<number>();
    for (const score of achievable) {
      if (canServeAllPlayers(avgs, numPlayers, count, score)) {
        filtered.add(score);
      }
    }
    achievable = filtered;
  }
  taskCountTargetSlider.update(achievable);
}

function refreshSliders(): void {
  const mode = getGenMode();
  if (mode === "totalScore") {
    refreshTotalScoreSlider();
  } else {
    refreshTaskCountSlider();
  }
}

// Sync initial display state with whichever radio the browser has checked
applyModeSettings();

document.getElementById("tasksPerPlayer")!.addEventListener("input", refreshTaskCountSlider);

// Update sliders when tasks change
const taskListObserver = new MutationObserver(() => refreshSliders());
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
            <input type="text" class="task-diff" placeholder="3-7" value="${escapeHtml(task.diff)}">
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
    <input type="text" class="task-diff" placeholder="3-7">
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
refreshSliders();

// Attach storage listeners to tasks
function attachTaskStorageListeners(): void {
  const taskList = document.getElementById("taskList")!;
  taskList.addEventListener("input", () => {
    saveTasksToStorage();
    refreshSliders();
  });
}
attachTaskStorageListeners();

// Save tasks when rows are added/removed
const taskStorageObserver = new MutationObserver(saveTasksToStorage);
taskStorageObserver.observe(document.getElementById("taskList")!, { childList: true });

// Attach storage listeners to players (also refresh sliders since player count affects achievable scores)
document.querySelectorAll<HTMLInputElement>(".player-name").forEach((input) => {
  input.addEventListener("input", () => {
    savePlayersToStorage();
    refreshSliders();
  });
});

// Refresh sliders when duplicates setting changes
document.getElementById("allowDuplicates")!.addEventListener("change", refreshSliders);

document.getElementById("clearTasksBtn")!.addEventListener("click", clearTasks);
document.getElementById("clearPlayersBtn")!.addEventListener("click", clearPlayers);

// Scroll to players panel on focus
document.querySelector(".players-panel")!.addEventListener("focusin", () => {
  document.querySelector(".players-panel")!.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

// Clear panel errors on user interaction
document.querySelector(".tasks-panel")!.addEventListener("input", () => clearPanelError("tasksError"));
document.querySelector(".players-panel")!.addEventListener("input", () => clearPanelError("playersError"));
document.querySelector(".mode-panel")!.addEventListener("input", () => clearPanelError("modeError"));

// Auto-resize initial textareas
document.querySelectorAll<HTMLTextAreaElement>(".task-desc").forEach(autoResizeDesc);

const EXAMPLE_ROWS = [
  ["Mês", "Região", "Cidade", "Clientes", "Receita", "Chamados", "Satisfação"],
  ["2026-01-01", "Norte", "Manaus", 420, 186000, 38, 4.2],
  ["2026-01-01", "Nordeste", "Recife", 610, 254000, 51, 4.0],
  ["2026-01-01", "Sudeste", "São Paulo", 980, 512000, 72, 3.8],
  ["2026-01-01", "Sul", "Curitiba", 540, 241000, 29, 4.5],
  ["2026-02-01", "Norte", "Belém", 390, 171000, 33, 4.3],
  ["2026-02-01", "Nordeste", "Salvador", 670, 288000, 47, 4.1],
  ["2026-02-01", "Sudeste", "Rio de Janeiro", 860, 447000, 64, 3.9],
  ["2026-02-01", "Sul", "Porto Alegre", 510, 229000, 26, 4.6],
  ["2026-03-01", "Norte", "Manaus", 450, 198000, 31, 4.4],
  ["2026-03-01", "Nordeste", "Fortaleza", 640, 273000, 44, 4.2],
  ["2026-03-01", "Sudeste", "Belo Horizonte", 730, 361000, 41, 4.1],
  ["2026-03-01", "Sul", "Florianópolis", 480, 236000, 22, 4.7],
  ["2026-04-01", "Norte", "Manaus", 470, 209000, 36, 4.1],
  ["2026-04-01", "Nordeste", "Recife", 700, 305000, 49, 4.0],
  ["2026-04-01", "Sudeste", "São Paulo", 1040, 548000, 80, 3.7],
  ["2026-04-01", "Sul", "Curitiba", 560, 252000, 27, 4.5],
  ["2026-05-01", "Norte", "Belém", 410, 184000, 30, 4.4],
  ["2026-05-01", "Nordeste", "Salvador", 720, 319000, 42, 4.3],
  ["2026-05-01", "Sudeste", "Campinas", 690, 334000, 35, 4.2],
  ["2026-05-01", "Sul", "Porto Alegre", 530, 247000, 24, 4.6],
  ["2026-06-01", "Norte", "Manaus", 495, 221000, 28, 4.5],
  ["2026-06-01", "Nordeste", "Fortaleza", 760, 341000, 39, 4.4],
  ["2026-06-01", "Sudeste", "São Paulo", 1110, 590000, 68, 4.0],
  ["2026-06-01", "Sul", "Joinville", 500, 239000, 21, 4.8]
];

const MONEY_RE = /(receita|fatur|valor|pre[cç]o|custo|venda)/i;
const AVG_RE = /(satisf|nota|nps|m[eé]dia|taxa|percent|índice|indice)/i;
const PAGE_SIZE = 12;
const PALETTE = ["#145c4a", "#c65a2e", "#d4a017", "#2f6f8f", "#6b4c7a", "#3d6b4f", "#a33b3b", "#7a6248"];

const state = {
  fileName: "",
  sheets: {},
  sheetNames: [],
  sheet: "",
  headers: [],
  rows: [],
  types: {},
  group: "",
  metric: "",
  agg: "sum",
  query: "",
  sortKey: "",
  sortDir: 1,
  page: 0,
  charts: {}
};

const $ = (id) => document.getElementById(id);

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const moneyFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 2 });

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  let text = value.trim();
  if (!text) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) text = text.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+(,\d+)?$/.test(text)) text = text.replace(",", ".");
  else if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function toDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string") return null;
  const text = value.trim();
  const match = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/) || text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match && match[0].includes("-") && match[1].length === 4) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  if (match && match[1].length <= 2) {
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    return new Date(year, Number(match[2]) - 1, Number(match[1]));
  }
  return null;
}

function countLabel(count, singular, plural) {
  return `${numberFormat.format(count)} ${count === 1 ? singular : plural}`;
}

function formatValue(header, value) {
  const date = toDate(value);
  if (date) return date.toLocaleDateString("pt-BR");
  const number = toNumber(value);
  if (number === null) return value === null || value === undefined || value === "" ? "—" : String(value);
  if (MONEY_RE.test(header)) return moneyFormat.format(number);
  return numberFormat.format(number);
}

function detectType(values) {
  const sample = values.filter((value) => value !== "" && value !== null && value !== undefined).slice(0, 80);
  if (!sample.length) return "vazio";
  const dates = sample.filter((value) => toDate(value)).length;
  const numbers = sample.filter((value) => toNumber(value) !== null && !(value instanceof Date)).length;
  if (dates / sample.length >= 0.7) return "data";
  if (numbers / sample.length >= 0.7) return "número";
  return "texto";
}

function rowsFromMatrix(matrix) {
  const headerRow = (matrix[0] || []).map((cell, index) => {
    const name = String(cell ?? "").trim();
    return name || `Coluna ${index + 1}`;
  });
  const seen = new Map();
  const headers = headerRow.map((name) => {
    const count = seen.get(name) || 0;
    seen.set(name, count + 1);
    return count ? `${name} (${count + 1})` : name;
  });
  const rows = matrix.slice(1).map((line) => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = line[index] ?? "";
    });
    return row;
  }).filter((row) => headers.some((header) => row[header] !== "" && row[header] !== null && row[header] !== undefined));
  return { headers, rows };
}

function analyze(headers, rows) {
  const types = {};
  headers.forEach((header) => {
    types[header] = detectType(rows.map((row) => row[header]));
  });
  return types;
}

function chooseDefaults() {
  const text = state.headers.find((header) => state.types[header] === "texto");
  const date = state.headers.find((header) => state.types[header] === "data");
  const numeric = state.headers.filter((header) => state.types[header] === "número");
  const preferred = numeric.find((header) => MONEY_RE.test(header)) || numeric[0] || "";
  state.group = text || date || state.headers[0] || "";
  state.metric = preferred;
  state.agg = preferred && AVG_RE.test(preferred) ? "avg" : "sum";
  state.sortKey = state.headers[0] || "";
  state.sortDir = 1;
  state.page = 0;
  state.query = "";
}

function loadWorkbook(workbook, fileName) {
  const sheets = {};
  workbook.SheetNames.forEach((name) => {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: "" });
    sheets[name] = rowsFromMatrix(matrix);
  });
  const usable = workbook.SheetNames.filter((name) => sheets[name].rows.length);
  if (!usable.length) {
    showStatus("A planilha não tem linhas de dados abaixo do cabeçalho.");
    return;
  }
  state.fileName = fileName;
  state.sheets = sheets;
  state.sheetNames = usable;
  state.sheet = usable[0];
  applySheet();
  showStatus("");
}

function applySheet() {
  const current = state.sheets[state.sheet];
  state.headers = current.headers;
  state.rows = current.rows;
  state.types = analyze(state.headers, state.rows);
  chooseDefaults();
  $("search").value = "";
  render();
}

function filteredRows() {
  const query = state.query.trim().toLowerCase();
  if (!query) return state.rows;
  return state.rows.filter((row) => state.headers.some((header) => String(row[header] ?? "").toLowerCase().includes(query)));
}

function aggregate(rows, groupHeader) {
  const buckets = new Map();
  rows.forEach((row) => {
    const key = labelOf(row[groupHeader]);
    if (!buckets.has(key)) buckets.set(key, { sum: 0, count: 0, numeric: 0 });
    const bucket = buckets.get(key);
    bucket.count += 1;
    const number = state.metric ? toNumber(row[state.metric]) : null;
    if (number !== null) {
      bucket.sum += number;
      bucket.numeric += 1;
    }
  });
  return [...buckets.entries()].map(([label, bucket]) => ({
    label,
    value: metricValue(bucket)
  })).sort((a, b) => b.value - a.value);
}

function metricValue(bucket) {
  if (!state.metric || state.agg === "count") return bucket.count;
  if (state.agg === "avg") return bucket.numeric ? bucket.sum / bucket.numeric : 0;
  return bucket.sum;
}

function labelOf(value) {
  const date = toDate(value);
  if (date) return date.toLocaleDateString("pt-BR");
  if (value === null || value === undefined || value === "") return "Sem valor";
  return String(value);
}

function monthKey(value) {
  const date = toDate(value);
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function trendSeries(rows) {
  const dateHeader = state.headers.find((header) => state.types[header] === "data");
  if (!dateHeader) return null;
  const buckets = new Map();
  rows.forEach((row) => {
    const key = monthKey(row[dateHeader]);
    if (!key) return;
    if (!buckets.has(key)) buckets.set(key, { sum: 0, count: 0, numeric: 0 });
    const bucket = buckets.get(key);
    bucket.count += 1;
    const number = state.metric ? toNumber(row[state.metric]) : null;
    if (number !== null) {
      bucket.sum += number;
      bucket.numeric += 1;
    }
  });
  return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, bucket]) => {
    const [year, month] = key.split("-");
    const label = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    return { label, value: metricValue(bucket) };
  });
}

function formatMetric(value) {
  if (state.agg === "count" || !state.metric) return numberFormat.format(value);
  return formatValue(state.metric, value);
}

function metricLabel() {
  if (state.agg === "count" || !state.metric) return "Contagem de linhas";
  const verb = state.agg === "avg" ? "Média" : "Soma";
  return `${verb} de ${state.metric}`;
}

function render() {
  const rows = filteredRows();
  $("workspace").hidden = false;
  $("dropzone").hidden = true;
  $("file-name").textContent = state.fileName;
  $("file-meta").textContent = `${countLabel(state.rows.length, "linha", "linhas")} · ${countLabel(state.headers.length, "coluna", "colunas")}`;

  const sheetField = $("sheet-field");
  sheetField.hidden = state.sheetNames.length < 2;
  $("sheet-select").innerHTML = state.sheetNames.map((name) => `<option ${name === state.sheet ? "selected" : ""}>${escapeHtml(name)}</option>`).join("");

  fillSelect($("group-select"), state.headers, state.group);
  const metrics = state.headers.filter((header) => state.types[header] === "número");
  $("metric-select").innerHTML = [`<option value="">Contagem de linhas</option>`]
    .concat(metrics.map((header) => `<option value="${escapeAttr(header)}" ${header === state.metric ? "selected" : ""}>${escapeHtml(header)}</option>`))
    .join("");
  $("agg-select").value = state.agg;

  $("column-chips").innerHTML = state.headers.map((header) => `<span class="chip">${escapeHtml(header)}<em>${state.types[header]}</em></span>`).join("");

  renderKpis(rows);
  renderCharts(rows);
  renderTable(rows);
}

function renderKpis(rows) {
  const grouped = state.group ? aggregate(rows, state.group) : [];
  const numericValues = state.metric ? rows.map((row) => toNumber(row[state.metric])).filter((value) => value !== null) : [];
  const total = numericValues.reduce((sum, value) => sum + value, 0);
  const average = numericValues.length ? total / numericValues.length : 0;
  const top = grouped[0];
  const cards = [
    ["Linhas nesta visão", numberFormat.format(rows.length)],
    [state.metric ? `Soma de ${state.metric}` : "Colunas", state.metric ? formatValue(state.metric, total) : String(state.headers.length)],
    [state.metric ? `Média de ${state.metric}` : "Abas", state.metric ? formatValue(state.metric, average) : String(state.sheetNames.length)],
    [state.group ? `Grupos em ${state.group}` : "Grupos", numberFormat.format(grouped.length)]
  ];
  $("kpis").innerHTML = cards.map(([label, value]) => `<article class="kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  if (top && grouped.reduce((sum, item) => sum + item.value, 0) > 0) {
    const share = top.value / grouped.reduce((sum, item) => sum + item.value, 0);
    $("insight").textContent = `${top.label} lidera ${state.group} com ${formatMetric(top.value)} (${numberFormat.format(share * 100)}% de ${metricLabel().toLowerCase()}).`;
  } else {
    $("insight").textContent = "Escolha uma coluna de agrupamento e uma métrica para ler o recorte.";
  }
}

function renderCharts(rows) {
  const groupedAll = state.group ? aggregate(rows, state.group) : [];
  const grouped = groupedAll.slice(0, 12);
  const isTimeGroup = state.types[state.group] === "data";
  $("main-title").textContent = isTimeGroup ? "Série do agrupamento" : "Comparativo";
  const extra = groupedAll.length > 12 ? " · 12 maiores" : "";
  $("main-sub").textContent = state.group ? `${metricLabel()} por ${state.group}${extra}` : "Sem coluna para agrupar";
  drawChart("chart-main", isTimeGroup ? "line" : "bar", grouped, false);

  const share = groupedAll.slice(0, 6);
  const rest = groupedAll.slice(6).reduce((sum, item) => sum + item.value, 0);
  if (rest > 0) share.push({ label: "Outros", value: rest });
  $("share-title").textContent = "Participação";
  $("share-sub").textContent = state.group ? `Peso de cada ${state.group}` : "";
  drawChart("chart-share", "doughnut", share, true);

  const trend = trendSeries(rows);
  const trendCard = $("trend-card");
  const sameAsMain = state.types[state.group] === "data";
  trendCard.hidden = !trend || trend.length < 2 || sameAsMain;
  if (trendCard.hidden) {
    if (state.charts["chart-trend"]) {
      state.charts["chart-trend"].destroy();
      delete state.charts["chart-trend"];
    }
  } else {
    $("trend-title").textContent = "Evolução no tempo";
    $("trend-sub").textContent = `${metricLabel()} por mês`;
    drawChart("chart-trend", "line", trend, false);
  }
}

function drawChart(id, type, series, doughnut) {
  const canvas = $(id);
  if (state.charts[id]) state.charts[id].destroy();
  const colorList = series.map((_, index) => PALETTE[index % PALETTE.length]);
  state.charts[id] = new Chart(canvas, {
    type,
    data: {
      labels: series.map((item) => item.label),
      datasets: [{
        label: metricLabel(),
        data: series.map((item) => item.value),
        backgroundColor: doughnut || type === "bar" ? colorList : "rgba(20, 92, 74, 0.18)",
        borderColor: doughnut ? "#fffdf8" : "#145c4a",
        borderWidth: type === "line" ? 2.5 : 1,
        tension: 0.35,
        fill: type === "line",
        pointRadius: 3,
        maxBarThickness: 42
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: doughnut, position: "bottom", labels: { boxWidth: 12, font: { family: "Outfit" } } },
        tooltip: {
          callbacks: {
            label: (item) => ` ${formatMetric(item.parsed?.y ?? item.raw ?? item.parsed)}`
          }
        }
      },
      scales: doughnut ? {} : {
        x: { grid: { display: false }, ticks: { font: { family: "Outfit" }, maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true, ticks: { font: { family: "Outfit" }, callback: (value) => formatMetric(value) } }
      }
    }
  });
}

function renderTable(rows) {
  const sorted = [...rows].sort((a, b) => compareValues(a[state.sortKey], b[state.sortKey]) * state.sortDir);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  state.page = Math.min(state.page, pages - 1);
  const slice = sorted.slice(state.page * PAGE_SIZE, state.page * PAGE_SIZE + PAGE_SIZE);
  $("table-meta").textContent = `${numberFormat.format(sorted.length)} linhas após o filtro`;
  $("data-table").querySelector("thead").innerHTML = `<tr>${state.headers.map((header) => {
    const mark = header === state.sortKey ? (state.sortDir > 0 ? " ↑" : " ↓") : "";
    const numeric = state.types[header] === "número" ? " num" : "";
    return `<th class="${numeric}" data-key="${escapeAttr(header)}">${escapeHtml(header)}${mark}</th>`;
  }).join("")}</tr>`;
  $("data-table").querySelector("tbody").innerHTML = slice.map((row) => `<tr>${state.headers.map((header) => {
    const numeric = state.types[header] === "número" ? " num" : "";
    return `<td class="${numeric}">${escapeHtml(formatValue(header, row[header]))}</td>`;
  }).join("")}</tr>`).join("");
  $("page-label").textContent = `${state.page + 1} / ${pages}`;
  $("page-prev").disabled = state.page === 0;
  $("page-next").disabled = state.page >= pages - 1;
}

function compareValues(a, b) {
  const dateA = toDate(a);
  const dateB = toDate(b);
  if (dateA && dateB) return dateA - dateB;
  const numberA = toNumber(a);
  const numberB = toNumber(b);
  if (numberA !== null && numberB !== null) return numberA - numberB;
  return String(a ?? "").localeCompare(String(b ?? ""), "pt-BR", { numeric: true });
}

function fillSelect(select, options, current) {
  select.innerHTML = options.map((option) => `<option value="${escapeAttr(option)}" ${option === current ? "selected" : ""}>${escapeHtml(option)}</option>`).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function showStatus(message) {
  const node = $("status");
  node.hidden = !message;
  node.textContent = message;
}

function detectDelimiter(text) {
  const line = text.split(/\r?\n/, 1)[0] || "";
  const score = (delimiter) => {
    let count = 0;
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') quoted = !quoted;
      else if (!quoted && char === delimiter) count += 1;
    }
    return count;
  };
  const semicolon = score(";");
  const comma = score(",");
  const tab = score("\t");
  if (semicolon > comma && semicolon >= tab) return ";";
  if (tab > comma && tab > semicolon) return "\t";
  return ",";
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

function readFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) {
        const text = new TextDecoder("utf-8").decode(reader.result).replace(/^\uFEFF/, "");
        const delimiter = lower.endsWith(".tsv") ? "\t" : detectDelimiter(text);
        const parsed = rowsFromMatrix(parseDelimited(text, delimiter));
        if (!parsed.rows.length) {
          showStatus("A planilha não tem linhas de dados abaixo do cabeçalho.");
          return;
        }
        state.fileName = file.name;
        state.sheets = { Planilha: parsed };
        state.sheetNames = ["Planilha"];
        state.sheet = "Planilha";
        applySheet();
        showStatus("");
        return;
      }
      const workbook = XLSX.read(reader.result, { type: "array", cellDates: true });
      loadWorkbook(workbook, file.name);
    } catch (error) {
      showStatus("Não foi possível ler este arquivo. Use .xlsx, .xls ou .csv com cabeçalho na primeira linha.");
    }
  };
  reader.readAsArrayBuffer(file);
}

function loadExample() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(EXAMPLE_ROWS);
  XLSX.utils.book_append_sheet(workbook, sheet, "Operação");
  loadWorkbook(workbook, "exemplo-nova-rede.csv");
}

function resetView() {
  Object.values(state.charts).forEach((chart) => chart.destroy());
  state.charts = {};
  state.rows = [];
  $("workspace").hidden = true;
  $("dropzone").hidden = false;
  $("file-input").value = "";
  showStatus("");
}

if (!window.XLSX || !window.Chart) {
  showStatus("Não foi possível carregar as bibliotecas. Abra a página com internet para ler Excel e desenhar os gráficos.");
}

$("file-input").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) readFile(file);
});

$("btn-sample").addEventListener("click", loadExample);
$("btn-clear").addEventListener("click", resetView);

["dragenter", "dragover"].forEach((name) => {
  document.body.addEventListener(name, (event) => {
    event.preventDefault();
    $("dropzone").classList.add("hot");
  });
});

["dragleave", "drop"].forEach((name) => {
  document.body.addEventListener(name, (event) => {
    event.preventDefault();
    if (name === "dragleave" && event.target !== document.body) return;
    $("dropzone").classList.remove("hot");
  });
});

document.body.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) readFile(file);
});

$("sheet-select").addEventListener("change", (event) => {
  state.sheet = event.target.value;
  applySheet();
});

$("group-select").addEventListener("change", (event) => {
  state.group = event.target.value;
  state.page = 0;
  render();
});

$("metric-select").addEventListener("change", (event) => {
  state.metric = event.target.value;
  if (!state.metric) state.agg = "count";
  else if (AVG_RE.test(state.metric)) state.agg = "avg";
  else state.agg = "sum";
  render();
});

$("agg-select").addEventListener("change", (event) => {
  state.agg = event.target.value;
  render();
});

$("search").addEventListener("input", (event) => {
  state.query = event.target.value;
  state.page = 0;
  render();
});

$("data-table").querySelector("thead").addEventListener("click", (event) => {
  const key = event.target.closest("th")?.dataset.key;
  if (!key) return;
  state.sortDir = state.sortKey === key ? state.sortDir * -1 : 1;
  state.sortKey = key;
  render();
});

$("page-prev").addEventListener("click", () => {
  state.page -= 1;
  render();
});

$("page-next").addEventListener("click", () => {
  state.page += 1;
  render();
});

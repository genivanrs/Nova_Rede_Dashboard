$ErrorActionPreference = "Stop"
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$profile = Join-Path $env:TEMP "nova-rede-chrome-profile"
$shot = Join-Path $env:TEMP "nova-rede-dashboard.png"
if (Test-Path $profile) { Remove-Item $profile -Recurse -Force }
$chromeProc = Start-Process $chrome -PassThru -ArgumentList @(
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--remote-debugging-port=9333",
  "--user-data-dir=$profile",
  "--window-size=1440,1700",
  "http://127.0.0.1:8765/"
)

$tabs = $null
for ($i = 0; $i -lt 40; $i++) {
  try {
    $tabs = Invoke-RestMethod "http://127.0.0.1:9333/json/list"
    if ($tabs) { break }
  } catch { Start-Sleep -Milliseconds 250 }
}
if (-not $tabs) { throw "Chrome DevTools nao abriu" }
$page = $tabs | Where-Object { $_.type -eq "page" } | Select-Object -First 1
$ws = [System.Net.WebSockets.ClientWebSocket]::new()
$ct = [Threading.CancellationToken]::None
$ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, $ct).Wait()

function Send-Text([string]$text) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($text)
  $seg = [ArraySegment[byte]]::new($bytes)
  $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
}
function Receive-Text {
  $buffer = New-Object byte[] 262144
  $ms = New-Object IO.MemoryStream
  do {
    $seg = [ArraySegment[byte]]::new($buffer)
    $result = $ws.ReceiveAsync($seg, $ct).Result
    $ms.Write($buffer, 0, $result.Count)
  } while (-not $result.EndOfMessage)
  [Text.Encoding]::UTF8.GetString($ms.ToArray())
}
$script:nextId = 0
function Invoke-Cdp([string]$method, $params) {
  $script:nextId++
  $payload = @{ id = $script:nextId; method = $method }
  if ($null -ne $params) { $payload.params = $params }
  Send-Text ($payload | ConvertTo-Json -Compress -Depth 12)
  $want = $script:nextId
  while ($true) {
    $raw = Receive-Text
    $msg = $raw | ConvertFrom-Json
    if ($msg.id -eq $want) { return $msg }
  }
}

Invoke-Cdp "Runtime.enable" $null | Out-Null
Invoke-Cdp "Page.enable" $null | Out-Null
Start-Sleep -Seconds 2

$expression = @'
(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let i = 0; i < 40 && !(window.XLSX && window.Chart); i++) await sleep(200);
  const report = { libs: !!(window.XLSX && window.Chart) };
  async function upload(name, bytes, type) {
    const file = new File([bytes], name, { type });
    const data = new DataTransfer();
    data.items.add(file);
    const input = document.getElementById("file-input");
    input.files = data.files;
    input.dispatchEvent(new Event("change"));
    await sleep(250);
  }
  const csv = await (await fetch("sample/exemplo.csv")).arrayBuffer();
  await upload("exemplo.csv", csv, "text/csv");
  const main = Chart.getChart(document.getElementById("chart-main"));
  const trend = Chart.getChart(document.getElementById("chart-trend"));
  report.csv = {
    file: document.getElementById("file-name").textContent,
    meta: document.getElementById("file-meta").textContent,
    insight: document.getElementById("insight").textContent,
    kpis: [...document.querySelectorAll(".kpi strong")].map((node) => node.textContent),
    labels: main ? main.data.labels : [],
    values: main ? main.data.datasets[0].data : [],
    trend: trend ? trend.data.labels : [],
    rows: document.querySelectorAll("#data-table tbody tr").length,
    first: document.querySelector("#data-table tbody td")?.textContent || "",
    dropHidden: document.getElementById("dropzone").hidden
  };
  document.getElementById("search").value = "Recife";
  document.getElementById("search").dispatchEvent(new Event("input"));
  await sleep(100);
  report.search = {
    rows: document.querySelectorAll("#data-table tbody tr").length,
    insight: document.getElementById("insight").textContent
  };
  document.getElementById("search").value = "";
  document.getElementById("search").dispatchEvent(new Event("input"));
  document.getElementById("page-next").click();
  await sleep(50);
  report.page = document.getElementById("page-label").textContent;
  const metric = document.getElementById("metric-select");
  metric.value = [...metric.options].find((option) => option.value.toLowerCase().includes("satisf"))?.value || "";
  metric.dispatchEvent(new Event("change"));
  await sleep(50);
  report.satisfaction = {
    agg: document.getElementById("agg-select").value,
    insight: document.getElementById("insight").textContent
  };
  const semi = new TextEncoder().encode("Região;Receita\nSul;1.234,56\nSul;10\nNorte;2\n");
  await upload("br.csv", semi, "text/csv");
  const semiChart = Chart.getChart(document.getElementById("chart-main"));
  report.semicolon = {
    labels: semiChart ? semiChart.data.labels : [],
    values: semiChart ? semiChart.data.datasets[0].data : [],
    kpi: document.querySelectorAll(".kpi strong")[1]?.textContent || ""
  };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["Status", "Valor", "Quando"],
    ["Aberto", 10, new Date(2026, 1, 1)],
    ["Aberto", 5, new Date(2026, 1, 15)],
    ["Fechado", 7, new Date(2026, 2, 1)]
  ]), "Um");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Nome"], ["Ana"], ["Bia"]]), "Dois");
  const xlsx = XLSX.write(book, { bookType: "xlsx", type: "array" });
  await upload("duas-abas.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  report.xlsx = {
    sheets: document.getElementById("sheet-field").hidden,
    options: [...document.getElementById("sheet-select").options].map((option) => option.textContent),
    insight: document.getElementById("insight").textContent,
    trendHidden: document.getElementById("trend-card").hidden,
    trendLabels: Chart.getChart(document.getElementById("chart-trend"))?.data.labels || []
  };
  document.getElementById("sheet-select").value = "Dois";
  document.getElementById("sheet-select").dispatchEvent(new Event("change"));
  await sleep(50);
  report.sheet2 = document.getElementById("file-meta").textContent;
  document.getElementById("btn-clear").click();
  report.cleared = document.getElementById("workspace").hidden && !document.getElementById("dropzone").hidden;
  document.getElementById("btn-sample").click();
  await sleep(100);
  report.sample = document.getElementById("file-meta").textContent;
  report.dropAfterSample = document.getElementById("dropzone").hidden;
  return JSON.stringify(report);
})()
'@

$eval = Invoke-Cdp "Runtime.evaluate" @{ expression = $expression; awaitPromise = $true; returnByValue = $true }
if ($eval.result.exceptionDetails) {
  $eval.result.exceptionDetails | ConvertTo-Json -Depth 6
  throw "Falha no teste da pagina"
}
Write-Output $eval.result.result.value

$screen = Invoke-Cdp "Page.captureScreenshot" @{ format = "png"; captureBeyondViewport = $true }
[IO.File]::WriteAllBytes($shot, [Convert]::FromBase64String($screen.result.data))
Write-Output "SHOT $shot"
$ws.Dispose()
taskkill /PID $chromeProc.Id /T /F | Out-Null

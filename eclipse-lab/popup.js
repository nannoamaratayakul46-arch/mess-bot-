const $ = (id) => document.getElementById(id);

async function loadSettings() {
  const saved = await chrome.storage.local.get(["apiUrl", "apiKey"]);
  $("apiUrl").value = saved.apiUrl || "";
  $("apiKey").value = saved.apiKey || "";
}

async function saveSettings() {
  await chrome.storage.local.set({
    apiUrl: $("apiUrl").value.trim().replace(/\/$/, ""),
    apiKey: $("apiKey").value.trim(),
  });
}

function setStatus(message) {
  $("status").textContent = message || "";
}

function setResult(data) {
  $("result").classList.remove("hidden");
  $("outputText").textContent = data.output?.text || "—";

  $("reaction").textContent = data.output
    ? Math.round(data.output.reactionMs) + " ms"
    : "—";

  $("typing").textContent = data.output
    ? Math.round(data.output.typingMs) + " ms"
    : "—";

  $("total").textContent = data.output
    ? Math.round(data.output.totalMs) + " ms"
    : "—";

  $("mode").textContent = data.context?.mode || "—";
  $("momentum").textContent =
    data.context?.momentum == null ? "—" : data.context.momentum;
  $("words").textContent =
    data.context?.incomingWords == null ? "—" : data.context.incomingWords;

  $("context").textContent = JSON.stringify(
    data.context || {},
    null,
    2
  );
}

async function simulate() {
  const apiUrl = $("apiUrl").value.trim().replace(/\/$/, "");
  const apiKey = $("apiKey").value.trim();
  const incomingText = $("incoming").value;
  const candidate = $("candidate").value;

  if (!apiUrl || !apiKey) {
    setStatus("Add the Render URL and dashboard API key first.");
    return;
  }

  if (!candidate.trim()) {
    setStatus("Enter a candidate reply.");
    return;
  }

  let parsedApiUrl;
  try {
    parsedApiUrl = new URL(apiUrl);
  } catch (_) {
    setStatus("Enter a valid dashboard URL.");
    return;
  }
  const localHttp = parsedApiUrl.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsedApiUrl.hostname);
  if (parsedApiUrl.protocol !== "https:" && !localHttp) {
    setStatus("Dashboard URL must use HTTPS (HTTP is allowed only for localhost).");
    return;
  }
  if (parsedApiUrl.username || parsedApiUrl.password) {
    setStatus("Dashboard URL must not contain embedded credentials.");
    return;
  }
  const requestedOrigin = parsedApiUrl.origin + "/*";
  try {
    const granted = await chrome.permissions.request({ origins: [requestedOrigin] });
    if (!granted) {
      setStatus("Permission to contact this dashboard was not granted.");
      return;
    }
  } catch (_) {
    setStatus("Could not request access to this dashboard origin.");
    return;
  }

  await saveSettings();
  setStatus("Running Banat simulation…");

  try {
    const response = await fetch(
      apiUrl + "/api/dev/banat/simulate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ECLIPSE-DASHBOARD-KEY": apiKey,
        },
        body: JSON.stringify({
          threadID: "eclipse-lab",
          incomingText,
          candidate,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Simulation failed.");
    }

    setResult(data);
    setStatus("Simulation complete.");
  } catch (error) {
    $("result").classList.add("hidden");
    setStatus(error?.message || "Could not reach ECLIPSE.");
  }
}

$("simulate").addEventListener("click", simulate);

$("clear").addEventListener("click", () => {
  $("incoming").value = "";
  $("candidate").value = "";
  $("result").classList.add("hidden");
  setStatus("");
});

loadSettings();

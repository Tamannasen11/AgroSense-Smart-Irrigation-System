
"use strict";

// =============================================
// AGROSENSE - SMART IRRIGATION DASHBOARD
// Browser simulation: no physical IoT hardware
// =============================================

const $ = id => document.getElementById(id);

const el = {
    moistureInput: $("moistureInput"),
    moisture: $("moisture"),
    moistureBar: $("moistureBar"),
    soilStatus: $("soilStatus"),
    pumpStatus: $("pumpStatus"),
    pumpMessage: $("pumpMessage"),
    selectedValue: $("selectedValue"),
    checkButton: $("checkButton"),
    modeSelect: $("modeSelect"),
    manualPumpButton: $("manualPumpButton"),
    liveToggleButton: $("liveToggleButton"),
    alertMessage: $("alertMessage"),
    historyList: $("historyList"),
    downloadCsvButton: $("downloadCsvButton"),
    lastUpdated: $("lastUpdated"),
tankInput: $("tankInput")

};

let pumpOn = false;
let lastSyncedPumpStatus = null;
let manualPumpOn = false;
let liveMonitoring = false;
let monitoringTimer = null;
let temperature = 28;
let humidity = 62;
let tankLevel = 78;
let history = [];
let chart = null;
let pumpOnEvents = 0;

const MAX_HISTORY = 100;
const MAX_CHART_POINTS = 20;

function randomChange(amount) {
    return (Math.random() * 2 - 1) * amount;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getMoisture() {
    return clamp(Number(el.moistureInput.value) || 0, 0, 100);
}

function getSoilStatus(value) {
    if (value < 30) return "Dry";
    if (value < 60) return "Moderate";
    return "Moist";
}

// -----------------------------
// LIVE CLOCK
// -----------------------------

function updateClock() {
    const now = new Date();

    $("clock").textContent = now.toLocaleTimeString();
    $("dateLabel").textContent = now.toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

updateClock();
setInterval(updateClock, 1000);

// -----------------------------
// CHART
// -----------------------------

function initializeChart() {
    const canvas = $("moistureChart");

    if (!canvas || typeof Chart === "undefined") {
        console.warn(
            "Chart.js is unavailable. Check your internet connection."
        );
        return;
    }

    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);

    gradient.addColorStop(0, "rgba(64, 240, 161, 0.28)");
    gradient.addColorStop(1, "rgba(64, 240, 161, 0.00)");

    chart = new Chart(ctx, {
        type: "line",
        data: {
            labels: [],
            datasets: [{
                label: "Soil Moisture",
                data: [],
                borderColor: "#40f0a1",
                backgroundColor: gradient,
                fill: true,
                tension: 0.38,
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 6,
                pointBackgroundColor: "#40f0a1",
                pointBorderColor: "#07131f"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 350
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "#102536",
                    titleColor: "#40f0a1",
                    bodyColor: "#eaf6ff",
                    borderColor: "#294354",
                    borderWidth: 1,
                    callbacks: {
                        label: context => ` Moisture: ${context.parsed.y}%`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: "#7895a9",
                        maxTicksLimit: 6
                    },
                    border: { display: false }
                },
                y: {
                    min: 0,
                    max: 100,
                    grid: { color: "rgba(151,196,220,.09)" },
                    ticks: {
                        color: "#7895a9",
                        stepSize: 20,
                        callback: value => value + "%"
                    },
                    border: { display: false }
                }
            }
        }
    });
}

function addChartReading(value) {
    if (!chart) return;

    chart.data.labels.push(new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }));

    chart.data.datasets[0].data.push(value);

    if (chart.data.labels.length > MAX_CHART_POINTS) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }

    chart.update("none");
}

// -----------------------------
// ENVIRONMENT SENSOR CARDS
// -----------------------------

function updateEnvironment() {
    temperature = clamp(
        temperature + randomChange(0.5), 18, 42
    );

    humidity = clamp(
        humidity + randomChange(1.5), 25, 95
    );

    // Water level decreases slowly while pump is operating.
    // Otherwise, it changes slightly to simulate readings.
    if (pumpOn) {
        tankLevel = clamp(tankLevel - 0.4, 0, 100);
    } else {
        tankLevel = clamp(tankLevel + randomChange(0.15), 0, 100);
    }

    $("temperatureValue").textContent = temperature.toFixed(1);
    $("humidityValue").textContent = Math.round(humidity);
    $("tankValue").textContent = Math.round(tankLevel);

    $("tankBar").style.width = tankLevel + "%";

    if (tankLevel < 20) {
        $("tankBar").style.background = "#ff7185";
        $("tankStatus").textContent = "Low tank level — refill needed";
    } else {
        $("tankBar").style.background = "#44c7ff";
        $("tankStatus").textContent = "Tank level is healthy";
    }

    document.querySelector(".temp-fill").style.width =
        ((temperature - 18) / 24 * 100) + "%";

    document.querySelector(".humidity-fill").style.width =
        humidity + "%";
}

// -----------------------------
// SMART ALERTS AND INSIGHTS
// -----------------------------

function updateAlerts(value) {
    const alert = el.alertMessage;
    const action = $("suggestedAction");

    alert.className = "alert-message";
    
console.log("Current soil moisture:", value);
console.log("Selected threshold:", $("moistureThreshold")?.value);
    if (tankLevel < 20) {
        alert.textContent =
            "⚠ Low water tank level. Refill the tank before irrigation.";
        alert.classList.add("danger");
        action.textContent = "Refill tank";
    } else if (value < Number($("moistureThreshold")?.value ?? 30)) {
        alert.textContent =
            "⚠ Soil moisture is low. Irrigation is recommended.";
        alert.classList.add("warning");
        action.textContent = "Water the soil";
    } else if (value >= 85) {
        alert.textContent =
            "⚠ Soil moisture is very high. Check for overwatering.";
        alert.classList.add("warning");
        action.textContent = "Inspect soil";
    } else {
        alert.textContent =
            "✓ Soil moisture is in a suitable range.";
        alert.classList.add("success");
        action.textContent = "Continue monitoring";
    }

    $("monitoringStatus").textContent =
        liveMonitoring ? "Live monitoring" : "Standby";
}

// -----------------------------
// PUMP CONTROL
// -----------------------------


function updatePump(value) {
    console.log("updatePump is running");

    const previousState = pumpOn;

    if (el.modeSelect.value === "auto") {
        const moistureThreshold = Number(
            $("moistureThreshold")?.value ?? 30
        );

        pumpOn = value < moistureThreshold && tankLevel >= 20;
    } else {
        pumpOn = manualPumpOn && tankLevel >= 20;
    }

    // Count transitions from OFF to ON.
    if (!previousState && pumpOn) {
        pumpOnEvents++;
    }

    // Record pump ON/OFF activity.
    if (previousState !== pumpOn) {
        const activityHistory =
            document.getElementById("activityHistory");

        if (activityHistory) {
            if (
                activityHistory.textContent.includes(
                    "No activity recorded yet."
                )
            ) {
                activityHistory.innerHTML = "";
            }

            const item = document.createElement("li");
            const time = new Date().toLocaleTimeString();

            item.textContent =
                `${time} - Pump turned ${pumpOn ? "ON" : "OFF"}`;

            activityHistory.prepend(item);

            while (activityHistory.children.length > 10) {
                activityHistory.lastElementChild.remove();
            }
        }
    }

    // Update pump status and dashboard.
    el.pumpStatus.textContent = pumpOn ? "ON" : "OFF";
if (el.modeSelect.value === "auto") {
    const currentPumpStatus = pumpOn ? "ON" : "OFF";

    if (currentPumpStatus !== lastSyncedPumpStatus) {
        lastSyncedPumpStatus = currentPumpStatus;

        fetch("http://https://agrosense-smart-irrigation-system.onrender.com/api/pump", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                pumpStatus: currentPumpStatus
            })
        })
        .then(response => {
            if (!response.ok) {
                lastSyncedPumpStatus = null;
                throw new Error("Pump synchronization failed");
            }
            console.log("Automatic pump synced:", currentPumpStatus);
        })
        .catch(error => {
            lastSyncedPumpStatus = null;
            console.error(error);
        });
    }
}
    el.pumpMessage.textContent = pumpOn
        ? "Watering is in progress"
        : tankLevel < 20
            ? "Pump blocked: refill the water tank"
            : "No watering required";

    $("pumpChip").classList.toggle("on", pumpOn);

    $("pumpChip").innerHTML = pumpOn
        ? "<i></i> PUMP ON"
        : "<i></i> PUMP OFF";

    $("pumpVisual").classList.toggle("running", pumpOn);

    // Enable the manual button only when safe and in manual mode.
    el.manualPumpButton.disabled =
        el.modeSelect.value !== "manual" || tankLevel < 20;

    console.log("Mode value:", el.modeSelect.value);
    console.log("Tank level:", tankLevel);
    console.log("Button disabled:", el.manualPumpButton.disabled);

    el.manualPumpButton.textContent = manualPumpOn
        ? "Turn Pump OFF"
        : "Turn Pump ON";

    $("pumpEvents").textContent = pumpOnEvents;
}


// -----------------------------
// HISTORY AND REPORTS
// -----------------------------

function recordActivity(value) {
    const entry = {
        time: new Date(),
        moisture: value,
        soil: getSoilStatus(value),
        pump: pumpOn ? "ON" : "OFF",
        temperature: Number(temperature.toFixed(1)),
        humidity: Math.round(humidity),
        tank: Math.round(tankLevel)
    };

    history.unshift(entry);
    history = history.slice(0, MAX_HISTORY);

    renderHistory();
    updateStatistics();
}

function renderHistory() {
    el.historyList.innerHTML = "";

    if (history.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 4;
        cell.className = "empty-state";
        cell.textContent =
            "No readings yet. Check moisture to start your report.";

        row.appendChild(cell);
        el.historyList.appendChild(row);
        return;
    }

    history.slice(0, 10).forEach(item => {
        const row = document.createElement("tr");

        const values = [
            item.time.toLocaleTimeString(),
            item.moisture + "%",
            item.soil,
            item.pump
        ];

        values.forEach((value, index) => {
            const cell = document.createElement("td");

            if (index === 3) {
                const badge = document.createElement("span");
                badge.className = "pump-badge" +
                    (item.pump === "ON" ? " on" : "");
                badge.textContent = item.pump;
                cell.appendChild(badge);
            } else {
                cell.textContent = value;
            }

            row.appendChild(cell);
        });

        el.historyList.appendChild(row);
    });
}

function updateStatistics() {
    $("readingCount").textContent = history.length;

    if (history.length) {
        const average = history.reduce(
            (sum, item) => sum + item.moisture, 0
        ) / history.length;

        $("averageMoisture").textContent = average.toFixed(1) + "%";
    } else {
        $("averageMoisture").textContent = "--%";
    }

    $("pumpEvents").textContent = pumpOnEvents;
}

function downloadCSV() {
    if (history.length === 0) {
        alert("No readings recorded yet. Check the moisture first.");
        return;
    }

    const headings = [
        "Timestamp",
        "Soil Moisture (%)",
        "Soil Status",
        "Pump Status",
        "Temperature (C)",
        "Humidity (%)",
        "Water Tank (%)"
    ];

    const rows = history.map(item => [
        item.time.toLocaleString(),
        item.moisture,
        item.soil,
        item.pump,
        item.temperature,
        item.humidity,
        item.tank
    ]);

    const csv = [headings, ...rows]
        .map(row => row.map(value =>
            '"' + String(value).replace(/"/g, '""') + '"'
        ).join(","))
        .join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "AgroSense_Irrigation_Report.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// -----------------------------
// MAIN DASHBOARD UPDATE
// -----------------------------

function updateSystem(shouldRecord = true) {
    const value = getMoisture();

    el.moisture.textContent = value + "%";
    el.selectedValue.textContent = value;
    el.moistureBar.style.width = value + "%";

    const soil = getSoilStatus(value);

    el.soilStatus.textContent = soil === "Dry"
        ? "Soil is dry"
        : soil === "Moderate"
            ? "Soil moisture is moderate"
            : "Soil is sufficiently moist";

    el.moistureBar.style.background =
        value < 30 ? "#ff7185" :
        value < 60 ? "#ffc36b" : "#40f0a1";

    el.moistureBar.style.boxShadow =
        value < 30
            ? "0 0 12px #ff71854a"
            : "0 0 12px #40f0a14a";

    updatePump(value);
    updateEnvironment();
    
updateAlerts(value);

    $("chartReading").textContent = "Current: " + value + "%";

    el.lastUpdated.textContent =
        "Updated " + new Date().toLocaleTimeString();

    if (shouldRecord) {
        addChartReading(value);
        recordActivity(value);
    }
}

// -----------------------------
// CONTROL EVENTS
// -----------------------------

el.checkButton.addEventListener("click", () => {
    updateSystem(true);
});


el.moistureInput.addEventListener("input", async () => {
    el.selectedValue.textContent = el.moistureInput.value;
    updateSystem(false);

    try {
        const response = await fetch("http:///api/sensors", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                soilMoisture: Number(el.moistureInput.value)
            })
        });

        if (!response.ok) {
            throw new Error("Failed to update soil moisture");
        }

        console.log("Backend moisture updated:", el.moistureInput.value);
    } catch (error) {
        console.error("Could not update backend moisture:", error);
    }
});

if (el.tankInput) {
    el.tankInput.addEventListener("input", () => {
        const level = Number(el.tankInput.value);
console.log("Tank slider changed to:", level);
        $("tankInputValue").textContent = level;
        $("tankValue").textContent = level;
        $("tankBar").style.width = level + "%";

        tankLevel = level;

        $("tankStatus").textContent =
            level < 20 ? "Low tank level — refill required" :
            level < 40 ? "Tank level is getting low" :
            "Tank level is healthy";

        
updateSystem(false);

fetch("http://https://agrosense-smart-irrigation-system.onrender.com/api/sensors", {
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    },
    body: JSON.stringify({
        waterTank: level
    })
}).catch(error => {
    console.error("Failed to update water tank:", error);
});

    });
}



el.modeSelect.addEventListener("change", async () => {
    if (el.modeSelect.value === "auto") {
        manualPumpOn = false;
    }

    // Update the dashboard's irrigation logic
    updateSystem(true);

    const mode = el.modeSelect.value === "auto"
        ? "AUTO"
        : "MANUAL";

    try {
        // Send the selected mode to the backend
        const modeResponse = await fetch(
            "http://https://agrosense-smart-irrigation-system.onrender.com/api/mode",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ mode: mode })
            }
        );

        if (!modeResponse.ok) {
            throw new Error("Mode update failed");
        }

        // Send the current simulated pump status too
        const pumpResponse = await fetch(
            "http://https://agrosense-smart-irrigation-system.onrender.com/api/pump",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    pumpStatus: pumpOn ? "ON" : "OFF"
                })
            }
        );

        if (!pumpResponse.ok) {
            throw new Error("Pump status update failed");
        }

        console.log("Backend mode synchronized:", mode);

    } catch (error) {
        console.error("Mode synchronization failed:", error);
        alert("Could not synchronize mode with the backend.");
    }
});

el.manualPumpButton.addEventListener("click", async () => {
    if (el.modeSelect.value !== "manual") return;

    if (!manualPumpOn && tankLevel < 20) {
        alert("The tank level is too low to operate the simulated pump.");
        return;
    }

    manualPumpOn = !manualPumpOn;

    updateSystem(true);

    try {
        const response = await fetch(
            "http://https://agrosense-smart-irrigation-system.onrender.com/api/pump",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    pumpStatus: pumpOn ? "ON" : "OFF"
                })
            }
        );

        if (!response.ok) {
            throw new Error("Pump command failed");
        }

        const data = await response.json();
        console.log("Backend pump status:", data.pumpStatus);

    } catch (error) {
        console.error("Pump connection failed:", error);
        alert("Could not send the pump command to the backend.");
    }
});

el.liveToggleButton.addEventListener("click", () => {
    if (liveMonitoring) {
        clearInterval(monitoringTimer);
        monitoringTimer = null;
        liveMonitoring = false;
        el.liveToggleButton.textContent = "Start Live Monitoring";
        updateSystem(false);
    } else {
        liveMonitoring = true;
        el.liveToggleButton.textContent = "Stop Live Monitoring";
        updateSystem(true);

        monitoringTimer = setInterval(() => {
            const current = getMoisture();
            const next = clamp(
                current + Math.round(randomChange(3)),
                0,
                100
            );

            el.moistureInput.value = next;
            updateSystem(true);
        }, 5000);

        updateSystem(false);
    }
});

el.downloadCsvButton.addEventListener("click", downloadCSV);

// -----------------------------
// INITIALIZE DASHBOARD
// -----------------------------

initializeChart();
updateSystem(true);
testBackendConnection();
setInterval(testBackendConnection, 5000);
let sensorStaleTimer;
async function testBackendConnection() {
    try {
        const response = await fetch(
            "http://https://agrosense-smart-irrigation-system.onrender.com/api/sensors"
        );

        if (!response.ok) {
            throw new Error("Backend request failed");
        }

        const data = await response.json();
        const backendStatus = $("backendStatus");

if (backendStatus) {
    backendStatus.textContent = "Connected";
backendStatus.style.color = "#16a34a";
backendStatus.style.background = "rgba(34, 197, 94, 0.12)";
}
        const lastUpdated = $("lastUpdated");

if (lastUpdated) {
    lastUpdated.textContent = new Date().toLocaleTimeString();
}
const sensorFreshness = $("sensorFreshness");

if (sensorFreshness) {
    sensorFreshness.textContent = "Data Fresh";
    sensorFreshness.style.color = "#16a34a";

  clearTimeout(sensorStaleTimer);

sensorStaleTimer = setTimeout(() => {
    const backendStatus = $("backendStatus");

    if (backendStatus && backendStatus.textContent === "Connected") {
        sensorFreshness.textContent = "Sensor Data Stale";
        sensorFreshness.style.color = "#f59e0b";
    }
}, 15000);  
}
        // Update dashboard with backend 
        if (!liveMonitoring) {
    // Keep the manually selected moisture value
}

        updateSystem(false);

        $("temperatureValue").textContent = data.temperature.toFixed(1);
        $("humidityValue").textContent = data.humidity;
        $("tankValue").textContent = data.waterTank;

        $("tankBar").style.width = data.waterTank + "%";
        $("pumpStatus").textContent = pumpOn ? "ON" : "OFF";
        
        $("modeStatus").textContent = data.mode;

        // Update live sensor chart
        if (sensorChart) {
            const currentTime = new Date().toLocaleTimeString();

            sensorChart.data.labels.push(currentTime);

            sensorChart.data.datasets[0].data.push(data.soilMoisture);
            sensorChart.data.datasets[1].data.push(data.temperature);
            sensorChart.data.datasets[2].data.push(data.humidity);

            // Keep only the latest 10 readings
            if (sensorChart.data.labels.length > 10) {
                sensorChart.data.labels.shift();

                sensorChart.data.datasets.forEach(dataset => {
                    dataset.data.shift();
                });
            }

            sensorChart.update();
        }

        console.log("Backend data loaded:", data);

    } catch (error) {
    console.error("Backend connection failed:", error);
    const sensorFreshness = $("sensorFreshness");

if (sensorFreshness) {
    sensorFreshness.textContent = "Sensor Data Stale";
    sensorFreshness.style.color = "#f59e0b";
}

    const backendStatus = $("backendStatus");

    if (backendStatus) {
        backendStatus.textContent = "Disconnected";
backendStatus.style.color = "#dc2626";
backendStatus.style.background = "rgba(239, 68, 68, 0.12)";
    }
}
}

/* Initialize AgroSense Live Sensor Chart */
let sensorChart = null;

const chartCanvas = document.getElementById("sensorChart");

if (chartCanvas && typeof Chart !== "undefined") {
    sensorChart = new Chart(chartCanvas, {
        type: "line",

        data: {
            labels: [],
            datasets: [
                {
                    label: "Soil Moisture (%)",
                    data: [],
                    borderColor: "#16a34a",
                    backgroundColor: "rgba(22, 163, 74, 0.12)",
                    tension: 0.35
                },
                {
                    label: "Temperature (°C)",
                    data: [],
                    borderColor: "#f97316",
                    backgroundColor: "rgba(249, 115, 22, 0.12)",
                    tension: 0.35
                },
                {
                    label: "Humidity (%)",
                    data: [],
                    borderColor: "#2563eb",
                    backgroundColor: "rgba(37, 99, 235, 0.12)",
                    tension: 0.35
                }
            ]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,

            interaction: {
                intersect: false,
                mode: "index"
            },

            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: "Sensor Value"
                    }
                }
            }
        }
    });
}

/* Smart Moisture Threshold Control */
const moistureThreshold = $("moistureThreshold");
const thresholdValue = $("thresholdValue");

if (moistureThreshold && thresholdValue) {
    moistureThreshold.addEventListener("input", () => {
        thresholdValue.textContent = moistureThreshold.value;

        const moistureInput = $("moistureInput");

        if (moistureInput) {
            updateAlerts(Number(moistureInput.value));
        }
    });
}

const downloadButton = document.getElementById("downloadReportButton");

if (downloadButton) {
    downloadButton.addEventListener("click", () => {
        const report = [
            ["Sensor", "Current Reading", "Unit"],
            ["Soil Moisture", document.getElementById("moistureInput").value, "%"],
            ["Temperature", document.getElementById("temperatureValue").textContent, "°C"],
            ["Humidity", document.getElementById("humidityValue").textContent, "%"],
            ["Water Tank", document.getElementById("tankValue").textContent, "%"],
            ["Pump Status", document.getElementById("pumpStatus").textContent, ""],
            ["Operating Mode", document.getElementById("modeStatus").textContent, ""],
            ["Report Generated", new Date().toLocaleString(), ""]
        ];

        const csv = report
            .map(row => row.map(value =>
                `"${String(value).replace(/"/g, '""')}"`
            ).join(","))
            .join("\r\n");

        const blob = new Blob([csv], {
            type: "text/csv;charset=utf-8;"
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = "AgroSense_Sensor_Report.csv";
        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);
    });
}

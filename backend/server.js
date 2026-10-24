
const express = require("express");
const cors = require("cors");
const app = express();
const PORT = 3000;

let sensorData = {
    soilMoisture: 45,
    temperature: 28,
    humidity: 62,
    waterTank: 78,
    pumpStatus: "OFF",
    mode: "AUTO"
};



app.use(express.json());
app.use(cors());
// First backend route
app.get("/", (req, res) => {
    res.json({
        project: "AgroSense Smart Irrigation System",
        message: "Backend is running successfully!",
        status: "success"
    });
});

app.get("/api/sensors", (req, res) => {
    res.json(sensorData);
});


// Start the server
app.post("/api/sensors", (req, res) => {
    sensorData = {
        ...sensorData,
        ...req.body
    };

    res.json({
        message: "Sensor data updated successfully!",
        data: sensorData
    });
});
// Pump control route
app.post("/api/pump", (req, res) => {
    const { pumpStatus } = req.body;

    if (pumpStatus !== "ON" && pumpStatus !== "OFF") {
        return res.status(400).json({
            message: "Pump status must be ON or OFF"
        });
    }

    sensorData.pumpStatus = pumpStatus;

    res.json({
        message: `Pump turned ${pumpStatus}`,
        pumpStatus: sensorData.pumpStatus
    });
});
// Irrigation mode control route
app.post("/api/mode", (req, res) => {
    const { mode } = req.body;

    if (mode !== "AUTO" && mode !== "MANUAL") {
        return res.status(400).json({
            message: "Mode must be AUTO or MANUAL"
        });
    }

    sensorData.mode = mode;

    res.json({
        message: `Irrigation mode changed to ${mode}`,
        mode: sensorData.mode
    });
});
app.listen(PORT, () => {
    console.log(`AgroSense backend running at http://localhost:${PORT}`);
});

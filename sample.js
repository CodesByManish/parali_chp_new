const ModbusRTU = require("modbus-serial");
const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline');
const WebSocket = require('ws');

// --- Modbus Configuration ---
const client = new ModbusRTU();
const ipAddress = "192.168.1.23"; // Replace with your device's IP
const modbusPort = 502; // Modbus TCP port
const unitId = 1;
const startAddress = 0;
const quantity = 8;
const pollingInterval = 1000; // Poll every 1 second (1000 milliseconds)

// --- RS232 Serial Port Configuration ---
const comPort = "COM1";
const baudRate = 9600;
let serialPort;
let parser;
let lastReceivedWeight = null; // Global variable to hold the last received weight from RS232

// --- WebSocket Server Configuration ---
const wsPort = 8080; // Port for WebSocket communication
const wss = new WebSocket.Server({ port: wsPort });

console.log(`WebSocket server started on port ${wsPort}`);

// Store connected WebSocket clients
const connectedClients = new Set();

wss.on('connection', ws => {
    console.log('Client connected via WebSocket');
    connectedClients.add(ws);

    // Send the current weight to the newly connected client immediately
    if (lastReceivedWeight !== null) {
        ws.send(JSON.stringify({ type: 'weightUpdate', value: lastReceivedWeight.toFixed(2) }));
    }

    ws.on('close', () => {
        console.log('Client disconnected from WebSocket');
        connectedClients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error with client:', error.message);
        connectedClients.delete(ws);
    });
});

/**
 * Sends a message to all connected WebSocket clients.
 * @param {object} message - The message object to send.
 */
function broadcastToClients(message) {
    connectedClients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    });
}

// --- RS232 Serial Port Initialization ---
function initializeSerialPort() {
    serialPort = new SerialPort(comPort, { baudRate: baudRate }, function (err) {
        if (err) {
            console.error("❌ Serial port open error:", err.message);
            // Attempt to re-initialize after a delay
            setTimeout(initializeSerialPort, 5000);
            return;
        }
        console.log(`✅ Connected to RS232 serial port ${comPort} at ${baudRate} baud.`);

        parser = serialPort.pipe(new Readline({ delimiter: '\r\n' }));

        parser.on('data', data => {
            try {
                const parsedWeight = parseFloat(data.trim());
                if (!isNaN(parsedWeight)) {
                    lastReceivedWeight = parsedWeight;
                    console.log(`Received data from RS232: ${lastReceivedWeight.toFixed(2)}`);
                    // Broadcast weight updates to the frontend
                    broadcastToClients({ type: 'weightUpdate', value: lastReceivedWeight.toFixed(2) });
                } else {
                    console.warn(`⚠️ Could not parse weight from RS232 data: "${data.trim()}"`);
                }
            } catch (e) {
                console.error("Error parsing RS232 data:", e.message);
            }
        });
    });

    serialPort.on('error', function (err) {
        console.error("❗ Serial port error (event):", err.message);
        if (serialPort.isOpen) {
            serialPort.close();
        }
        // Attempt to re-initialize after an error
        setTimeout(initializeSerialPort, 2000);
    });

    serialPort.on('close', function() {
        console.log("❗ Serial port closed. Attempting to reopen...");
        // Re-attempt connection after a short delay
        setTimeout(initializeSerialPort, 2000);
    });
}

// --- Modbus Polling Function ---
async function pollModbusData() {
    try {
        if (!client.isOpen) {
            await client.connectTCP(ipAddress, modbusPort);
            console.log(`✅ Connected to Modbus TCP device at ${ipAddress}:${modbusPort}`);
            client.setID(unitId);
        }

        const data = await client.readDiscreteInputs(startAddress, quantity);
        console.log(`📊 Discrete Inputs (Unit ID ${unitId}, Address ${startAddress}, Quantity ${quantity}):`, data.data);

        const isGrossWeightSignal = data.data[1]; // Index 1 for gross weight
        const isTareWeightSignal = data.data[2]; // Index 2 for tare weight

        if (isGrossWeightSignal) {
            if (lastReceivedWeight !== null) {
                console.log(`⭐ Gross Weight Signal detected! Broadcasting to TripplerWeight.`);
                // Send a signal trigger message with the current weight
                broadcastToClients({ type: 'signalTrigger', signal: 'gross', weight: lastReceivedWeight.toFixed(2) });
            } else {
                console.warn("⚠️ Gross Weight signal detected, but no valid weight received from RS232 yet.");
            }
        }

        if (isTareWeightSignal) {
            if (lastReceivedWeight !== null) {
                console.log(`⭐ Tare Weight Signal detected! Broadcasting to TripplerWeight.`);
                // Send a signal trigger message with the current weight
                broadcastToClients({ type: 'signalTrigger', signal: 'tare', weight: lastReceivedWeight.toFixed(2) });
            } else {
                console.warn("⚠️ Tare Weight signal detected, but no valid weight received from RS232 yet.");
            }
        }

    } catch (err) {
        console.error("❌ Modbus polling error:", err.message);
        if (client.isOpen) {
            client.close();
            console.log("Modbus connection closed due to error. Attempting to reconnect...");
        }
    } finally {
        setTimeout(pollModbusData, pollingInterval);
    }
}

// Start the initial serial port connection and Modbus poll
initializeSerialPort();
pollModbusData();

client.on("error", (err) => {
    console.error("❗ Modbus client error (event):", err.message);
    if (client.isOpen) {
        client.close();
        console.log("Modbus connection closed due to client error event.");
    }
});
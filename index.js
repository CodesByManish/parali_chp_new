// actual working code working start

const ModbusRTU = require("modbus-serial");
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const WebSocket = require('ws');

// --- Modbus Configuration ---
const client = new ModbusRTU();
const ipAddress = "192.168.200.35"; // Replace with your device's IP
//const ipAddress = "192.168.100.1"; // Replace with your device's IP
const modbusPort = 502; // Modbus TCP port
const unitId = 1;
const startAddress = 0;
const quantity = 8;
const pollingInterval = 1000; // Poll every 1 second

// --- RS232 Serial Port Configuration ---
const comPort = "COM2"; // Make sure COM1 is correct (use Device Manager)
const baudRate = 2400;
let serialPort;
let parser;
let lastReceivedWeight = null; // Stores last valid RS232 weight

// --- WebSocket Server ---
const wsPort = 8080;
const wss = new WebSocket.Server({ port: wsPort });
console.log(`✅ WebSocket server started on port ${wsPort}`);

const connectedClients = new Set();

wss.on('connection', ws => {
  console.log('🟢 Client connected via WebSocket');
  connectedClients.add(ws);

  if (lastReceivedWeight !== null) {
    ws.send(JSON.stringify({ type: 'weightUpdate', value: lastReceivedWeight.toFixed(2) }));
  }

  ws.on('close', () => {
    console.log('🔴 Client disconnected from WebSocket');
    connectedClients.delete(ws);
  });

  ws.on('error', error => {
    console.error('WebSocket error:', error.message);
    connectedClients.delete(ws);
  });
});

function broadcastToClients(message) {
  connectedClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

// --- RS232 Initialization ---
function initializeSerialPort() {
  serialPort = new SerialPort(
    { path: comPort, baudRate: baudRate },
    (err) => {
      if (err) {
        console.error("❌ Serial port open error:", err.message);
        setTimeout(initializeSerialPort, 5000); // retry
        return;
      }

      console.log(`✅ Connected to RS232 serial port ${comPort} at ${baudRate} baud.`);

      parser = serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    parser.on('data', data => {
  try {
    console.log(`📦 RS232 Weight: ${data}`);
    const match = data.match(/[-+]?[0-9]*\.?[0-9]+/); // Match a float or integer
    if (match) {
      const parsedWeight = parseFloat(match[0]);
      lastReceivedWeight = parsedWeight;
      console.log(`📦 RS232 Parsed Weight: ${lastReceivedWeight.toFixed(2)}`);
      broadcastToClients({ type: 'weightUpdate', value: lastReceivedWeight.toFixed(2) });
    } else {
      console.warn(`⚠️ Could not extract weight from RS232 data: "${data.trim()}"`);
    }
  } catch (e) {
    console.error("RS232 parse error:", e.message);
  }
});

    }
  );

  serialPort.on('error', (err) => {
    console.error("❗ Serial port error:", err.message);
    if (serialPort.isOpen) serialPort.close();
    setTimeout(initializeSerialPort, 2000); // Retry on error
  });

  serialPort.on('close', () => {
    console.log("❗ Serial port closed. Reconnecting...");
    setTimeout(initializeSerialPort, 2000);
  });
}

// --- Modbus Polling ---
async function pollModbusData() {
  try {
    if (!client.isOpen) {
      await client.connectTCP(ipAddress, { port: modbusPort });
      console.log(`✅ Connected to Modbus device at ${ipAddress}:${modbusPort}`);
      client.setID(unitId);
    }

    const data = await client.readDiscreteInputs(startAddress, quantity);
    const inputs = data.data;
    console.log("📊 Modbus Inputs:", inputs);

    const isGrossWeightSignal = inputs[1];
    const isTareWeightSignal = inputs[2];

    if (isGrossWeightSignal && lastReceivedWeight !== null) {
      console.log("🚩 Gross Weight Signal detected!");
      broadcastToClients({ type: 'signalTrigger', signal: 'gross', weight: lastReceivedWeight.toFixed(2) });
    }

    if (isTareWeightSignal && lastReceivedWeight !== null) {
      console.log("🚩 Tare Weight Signal detected!");
      broadcastToClients({ type: 'signalTrigger', signal: 'tare', weight: lastReceivedWeight.toFixed(2) });
    }

  } catch (err) {
    console.error("❌ Modbus polling error:", err.message);
    if (client.isOpen) {
      client.close();
      console.log("🔌 Modbus disconnected due to error. Will reconnect...");
    }
  } finally {
    setTimeout(pollModbusData, pollingInterval); // poll again
  }
}

// --- Start everything ---
initializeSerialPort();
pollModbusData();

client.on("error", (err) => {
  console.error("Modbus client error:", err.message);
  if (client.isOpen) {
    client.close();
    console.log("Modbus connection closed due to client error.");
  }
});

// actual working code working end

// trial code start

// const ModbusRTU = require("modbus-serial");
// const { SerialPort } = require('serialport');
// const { ReadlineParser } = require('@serialport/parser-readline');
// const WebSocket = require('ws');

// // --- Modbus Configuration ---
// const client = new ModbusRTU();
// const ipAddress = "192.168.100.1"; // Replace with your device's IP
// const modbusPort = 502; // Modbus TCP port
// const unitId = 1;
// const startAddress = 0;
// const quantity = 8;
// const pollingInterval = 100; // Poll more frequently to catch transitions quicker, but not excessively

// // --- RS232 Serial Port Configuration ---
// const comPort = "COM2"; // Make sure COM1 is correct (use Device Manager)
// const baudRate = 2400;
// let serialPort;
// let parser;
// let lastReceivedWeight = null; // Stores last valid RS232 weight

// // --- WebSocket Server ---
// const wsPort = 8080;
// const wss = new WebSocket.Server({ port: wsPort });
// console.log(`✅ WebSocket server started on port ${wsPort}`);

// const connectedClients = new Set();

// wss.on('connection', ws => {
//   console.log('🟢 Client connected via WebSocket');
//   connectedClients.add(ws);

//   if (lastReceivedWeight !== null) {
//     ws.send(JSON.stringify({ type: 'weightUpdate', value: lastReceivedWeight.toFixed(2) }));
//   }

//   ws.on('close', () => {
//     console.log('🔴 Client disconnected from WebSocket');
//     connectedClients.delete(ws);
//   });

//   ws.on('error', error => {
//     console.error('WebSocket error:', error.message);
//     connectedClients.delete(ws);
//   });
// });

// function broadcastToClients(message) {
//   connectedClients.forEach(ws => {
//     if (ws.readyState === WebSocket.OPEN) {
//       ws.send(JSON.stringify(message));
//     }
//   });
// }

// // --- RS232 Initialization ---
// function initializeSerialPort() {
//   serialPort = new SerialPort(
//     { path: comPort, baudRate: baudRate },
//     (err) => {
//       if (err) {
//         console.error("❌ Serial port open error:", err.message);
//         setTimeout(initializeSerialPort, 5000); // retry
//         return;
//       }

//       console.log(`✅ Connected to RS232 serial port ${comPort} at ${baudRate} baud.`);

//       parser = serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));
//       parser.on('data', data => {
//         try {
//           const match = data.match(/[-+]?[0-9]*\.?[0-9]+/); // Match a float or integer
//           if (match) {
//             const parsedWeight = parseFloat(match[0]);
//             lastReceivedWeight = parsedWeight;
//             // console.log(`📦 RS232 Parsed Weight: ${lastReceivedWeight.toFixed(2)}`);
//             broadcastToClients({ type: 'weightUpdate', value: lastReceivedWeight.toFixed(2) });
//           } else {
//             console.warn(`⚠️ Could not extract weight from RS232 data: "${data.trim()}"`);
//           }
//         } catch (e) {
//           console.error("RS232 parse error:", e.message);
//         }
//       });

//     }
//   );

//   serialPort.on('error', (err) => {
//     console.error("❗ Serial port error:", err.message);
//     if (serialPort.isOpen) serialPort.close();
//     setTimeout(initializeSerialPort, 2000); // Retry on error
//   });

//   serialPort.on('close', () => {
//     console.log("❗ Serial port closed. Reconnecting...");
//     setTimeout(initializeSerialPort, 2000);
//   });
// }

// // --- Modbus Polling ---
// // State variables to track previous signal states
// let prevGrossWeightSignal = false;
// let prevTareWeightSignal = false;

// async function pollModbusData() {
//   try {
//     if (!client.isOpen) {
//       await client.connectTCP(ipAddress, { port: modbusPort });
//       console.log(`✅ Connected to Modbus device at ${ipAddress}:${modbusPort}`);
//       client.setID(unitId);
//     }

//     const data = await client.readDiscreteInputs(startAddress, quantity);
//     const inputs = data.data;
//     // console.log("📊 Modbus Inputs:", inputs); // Uncomment for debugging if needed

//     const currentGrossWeightSignal = inputs[1];
//     const currentTareWeightSignal = inputs[2];

//     // Detect rising edge for Gross Weight Signal
//     if (currentGrossWeightSignal && lastReceivedWeight !== null) {
//       console.log("Gross Weight Signal detected ${lastReceivedWeight.toFixed(2)}!");
//       broadcastToClients({ type: 'signalTrigger', signal: 'gross', weight: lastReceivedWeight.toFixed(2) });
//     }

//     // Detect rising edge for Tare Weight Signal
//     if (currentTareWeightSignal && lastReceivedWeight !== null) {
//       console.log("Tare Weight Signal detected ${lastReceivedWeight.toFixed(2)}!");
//       broadcastToClients({ type: 'signalTrigger', signal: 'tare', weight: lastReceivedWeight.toFixed(2) });
//     }

//     // Update previous states for the next poll
//     prevGrossWeightSignal = currentGrossWeightSignal;
//     prevTareWeightSignal = currentTareWeightSignal;

//   } catch (err) {
//     console.error("❌ Modbus polling error:", err.message);
//     if (client.isOpen) {
//       client.close();
//       console.log("🔌 Modbus disconnected due to error. Will reconnect...");
//     }
//   } finally {
//     // Continue polling, but the action is only taken on a rising edge
//     setTimeout(pollModbusData, pollingInterval);
//   }
// }

// // --- Start everything ---
// initializeSerialPort();
// pollModbusData();

// client.on("error", (err) => {
//   console.error("Modbus client error:", err.message);
//   if (client.isOpen) {
//     client.close();
//     console.log("Modbus connection closed due to client error.");
//   }
// });

// trial code end


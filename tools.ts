import { Client, Groups, Router, Devices, GetServiceCommand } from 'lifxlan/index.js';
import dgram from 'node:dgram';

const socket = dgram.createSocket('udp4');

const router = Router({
  onSend(message, port, address, serialNumber) {
    socket.send(message, port, address);
  }
});

// Track discovered devices
const devices = Devices({
  onAdded(device) {
    // TODO
  }
});

// Handle incoming messages
socket.on('message', (message, remote) => {
  const { header, serialNumber } = router.receive(message);
  devices.register(serialNumber, remote.port, remote.address, header.target);
});

// Start the socket
await new Promise((resolve, reject) => {
  socket.once('error', reject);
  socket.once('listening', resolve);
  socket.bind();
});

socket.setBroadcast(true);

const client = Client({ router });

// Discover devices
client.broadcast(GetServiceCommand());
const scanInterval = setInterval(() => {
  client.broadcast(GetServiceCommand());
}, 1000);
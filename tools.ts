import { Client, Router, Devices, GetServiceCommand, SetPowerCommand, SetColorCommand, GetPowerCommand, GetColorCommand } from 'lifxlan/index.js';
import dgram from 'node:dgram';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const socket = dgram.createSocket('udp4');

const router = Router({
  onSend(message, port, address) {
    socket.send(message, port, address);
  }
});

// Track discovered devices
const deviceRegistry = new Map();
const devices = Devices({
  onAdded(device) {
    deviceRegistry.set(device.serialNumber, device);
    console.log(`Device discovered: ${device.serialNumber} at ${device.address}:${device.port}`);
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
setInterval(() => {
  client.broadcast(GetServiceCommand());
}, 5000);

export function createServer() {
  const server = new Server(
    {
      name: 'lifx-controller',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const cleanup = async () => {
    // Cleanup function for when the server shuts down
    socket.close();
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'discover_devices',
          description: 'Discover LIFX devices on the local network',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'list_devices',
          description: 'List all discovered LIFX devices',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'set_power',
          description: 'Turn a LIFX device on or off',
          inputSchema: {
            type: 'object',
            properties: {
              serialNumber: {
                type: 'string',
                description: 'Serial number of the device',
              },
              power: {
                type: 'boolean',
                description: 'True to turn on, false to turn off',
              },
            },
            required: ['serialNumber', 'power'],
          },
        },
        {
          name: 'get_power',
          description: 'Get the power state of a LIFX device',
          inputSchema: {
            type: 'object',
            properties: {
              serialNumber: {
                type: 'string',
                description: 'Serial number of the device',
              },
            },
            required: ['serialNumber'],
          },
        },
        {
          name: 'set_color',
          description: 'Set the color of a LIFX device',
          inputSchema: {
            type: 'object',
            properties: {
              serialNumber: {
                type: 'string',
                description: 'Serial number of the device',
              },
              hue: {
                type: 'number',
                description: 'Hue value (0-65535)',
                minimum: 0,
                maximum: 65535,
              },
              saturation: {
                type: 'number',
                description: 'Saturation value (0-65535)',
                minimum: 0,
                maximum: 65535,
              },
              brightness: {
                type: 'number',
                description: 'Brightness value (0-65535)',
                minimum: 0,
                maximum: 65535,
              },
              kelvin: {
                type: 'number',
                description: 'Color temperature in Kelvin (2500-9000)',
                minimum: 2500,
                maximum: 9000,
              },
              duration: {
                type: 'number',
                description: 'Transition duration in milliseconds',
                minimum: 0,
              },
            },
            required: ['serialNumber', 'hue', 'saturation', 'brightness', 'kelvin'],
          },
        },
        {
          name: 'get_color',
          description: 'Get the current color of a LIFX device',
          inputSchema: {
            type: 'object',
            properties: {
              serialNumber: {
                type: 'string',
                description: 'Serial number of the device',
              },
            },
            required: ['serialNumber'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'discover_devices': {
        client.broadcast(GetServiceCommand());
        await new Promise(resolve => setTimeout(resolve, 2000));
        return {
          content: [
            {
              type: 'text',
              text: `Discovery broadcast sent. Found ${deviceRegistry.size} devices.`,
            },
          ],
        };
      }

      case 'list_devices': {
        const deviceList = Array.from(deviceRegistry.values()).map(device => ({
          serialNumber: device.serialNumber,
          address: device.address,
          port: device.port,
        }));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(deviceList, null, 2),
            },
          ],
        };
      }

      case 'set_power': {
        const { serialNumber, power } = args as { serialNumber: string; power: boolean };
        const device = deviceRegistry.get(serialNumber);
        if (!device) {
          throw new Error(`Device with serial number ${serialNumber} not found`);
        }
        
        try {
          await client.sendOnlyAcknowledgement(SetPowerCommand(power), device);
          return {
            content: [
              {
                type: 'text',
                text: `Successfully turned ${power ? 'on' : 'off'} device ${serialNumber}`,
              },
            ],
          };
        } catch (error) {
          throw new Error(`Failed to set power: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      case 'get_power': {
        const { serialNumber } = args as { serialNumber: string };
        const device = deviceRegistry.get(serialNumber);
        if (!device) {
          throw new Error(`Device with serial number ${serialNumber} not found`);
        }
        
        try {
          const response = await client.send(GetPowerCommand(), device);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ power: response > 0 }, null, 2),
              },
            ],
          };
        } catch (error) {
          throw new Error(`Failed to get power state: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      case 'set_color': {
        const { serialNumber, hue, saturation, brightness, kelvin, duration = 0 } = args as {
          serialNumber: string;
          hue: number;
          saturation: number;
          brightness: number;
          kelvin: number;
          duration?: number;
        };
        const device = deviceRegistry.get(serialNumber);
        if (!device) {
          throw new Error(`Device with serial number ${serialNumber} not found`);
        }
        
        try {
          await client.sendOnlyAcknowledgement(
            SetColorCommand(hue, saturation, brightness, kelvin, duration),
            device
          );
          return {
            content: [
              {
                type: 'text',
                text: `Successfully set color for device ${serialNumber}`,
              },
            ],
          };
        } catch (error) {
          throw new Error(`Failed to set color: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      case 'get_color': {
        const { serialNumber } = args as { serialNumber: string };
        const device = deviceRegistry.get(serialNumber);
        if (!device) {
          throw new Error(`Device with serial number ${serialNumber} not found`);
        }
        
        try {
          const response = await client.send(GetColorCommand(), device);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  hue: response.hue,
                  saturation: response.saturation,
                  brightness: response.brightness,
                  kelvin: response.kelvin,
                }, null, 2),
              },
            ],
          };
        } catch (error) {
          throw new Error(`Failed to get color: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  return { server, cleanup };
}
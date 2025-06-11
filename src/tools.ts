import { z } from 'zod/v4';
import { Client, Router, Devices, GetServiceCommand, SetPowerCommand, SetColorCommand, GetPowerCommand, GetColorCommand, Device, GetLabelCommand, GetGroupCommand, Groups, type StateGroup } from 'lifxlan/index.js';
import dgram from 'node:dgram';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const socket = dgram.createSocket('udp4');

const router = Router({
  onSend(message, port, address) {
    socket.send(message, port, address);
  }
});

type DeviceInfo = {
  label?: string;
  location?: string;
  group?: StateGroup;
  capabilities?: Record<string, any>;
};

const groups = Groups({
  onAdded(group) {
    console.log('Group added', group);
  },
  onChanged(group) {
    console.log('Group changed', group);
  },
});

const deviceRegistry = new Map<string, DeviceInfo>();

const devices = Devices({
  onAdded(device) {
    const deviceInfo: DeviceInfo = {};
    deviceRegistry.set(device.serialNumber, deviceInfo);

    client
      .send(GetLabelCommand(), device)
      .then((label) => {
        deviceInfo.label = label;
        console.log(deviceInfo)
      });

    client
      .send(GetGroupCommand(), device)
      .then((group) => {
        groups.register(device, group);
        deviceInfo.group = group;
        console.log(deviceInfo);
      });

    console.log(`Device discovered: ${device.serialNumber} at ${device.address}:${device.port}`);
  }
});

socket.on('message', (message, remote) => {
  const { header, serialNumber } = router.receive(message);
  devices.register(serialNumber, remote.port, remote.address, header.target);
});

await new Promise((resolve, reject) => {
  socket.once('error', reject);
  socket.once('listening', resolve);
  socket.bind();
});

socket.setBroadcast(true);

const client = Client({ router });

client.broadcast(GetServiceCommand());
const discoverInterval = setInterval(() => {
  client.broadcast(GetServiceCommand());
}, 5000);

export function cleanup() {
  clearInterval(discoverInterval);
  socket.close();
}

export function createServer() {

  const server = new Server(
    {
      name: "lifxlan-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  const SetDevicesPowerSchema = z.object({
    requests: z.array(
      z.object({
        serialNumber: z.string().describe('Serial number of the device'),
        power: z.union([
          z.boolean().describe('True to turn on, false to turn off'),
          z.number().int().describe('0 for off, 1 for on'),
        ]),
      }),
    ),
  });

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: 'list_devices',
        description: 'List all discovered LIFX devices',
        // inputSchema: z.toJSONSchema(z.obj)
      },
      {
        name: 'set_devices_power',
        description: 'Set power state of LIFX devices',
        inputSchema: z.toJSONSchema(SetDevicesPowerSchema),
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'list_devices': {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                devices: Array.from(deviceRegistry.entries()),
              }),
            },
          ],
        };
      }
      case 'set_devices_power': {
        const { requests } = SetDevicesPowerSchema.parse(args);
        const results = await Promise.all(requests.map(async ({ serialNumber, power }) => {
          const device = await devices.get(serialNumber);

          try {
            await client.send(SetPowerCommand(power), device);
            return { serialNumber, success: true };
          } catch (error) {
            return { serialNumber, error };
          }
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results),
            },
          ],
        };
      }
      default:
        throw new Error(`Tool ${name} not found`);
    }
  });

  return { server };
}
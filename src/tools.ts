import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Client, Router, Devices, GetServiceCommand, SetPowerCommand, SetColorCommand, GetPowerCommand, GetColorCommand, GetLabelCommand, GetGroupCommand, Groups, type StateGroup, GetLocationCommand, type StateLocation, type Color } from 'lifxlan/index.js';
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
  location?: StateLocation;
  group?: StateGroup;
  power?: 'on' | 'off' | 'unknown';
  color?: Color;
  capabilities?: Record<string, any>;
};

const groups = Groups({
  // onAdded(group) {
  //   console.log('Group added', group);
  // },
  // onChanged(group) {
  //   console.log('Group changed', group);
  // },
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
      });

    client
      .send(GetGroupCommand(), device)
      .then((group) => {
        groups.register(device, group);
        deviceInfo.group = group;
      });

    client
      .send(GetLocationCommand(), device)
      .then((location) => {
        deviceInfo.location = location;
      });

    client
      .send(GetColorCommand(), device)
      .then((color) => {
        deviceInfo.color = color;
        deviceInfo.power = color.power > 0 ? 'on' : 'off';
      });

    // console.log(`Device discovered: ${device.serialNumber} at ${device.address}:${device.port}`);
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

function parseSelector(selector = 'all') {
  if (selector === 'all') {
    return { type: 'all' };
  }

  if (selector.includes(':')) {
    const [type, value] = selector.split(':');
    return { type, value };
  }
  
  // Assume it's a serial number if no prefix
  return { type: 'serial', value: selector };
}

function parseColor(color: any) {
  if (typeof color === 'string') {
    // Handle named colors
    const namedColors: Record<string, [number, number, number, number]> = {
      'red': [0, 65535, 65535, 3500],
      'green': [21845, 65535, 65535, 3500],
      'blue': [43690, 65535, 65535, 3500],
      'yellow': [10922, 65535, 65535, 3500],
      'cyan': [32768, 65535, 65535, 3500],
      'magenta': [54613, 65535, 65535, 3500],
      'orange': [5461, 65535, 65535, 3500],
      'purple': [49151, 65535, 65535, 3500],
      'pink': [54613, 32768, 65535, 3500],
      'white': [0, 0, 65535, 3500],
      'warm_white': [0, 0, 65535, 2700],
      'cool_white': [0, 0, 65535, 6500],
    };
    
    const colorKey = color.toLowerCase();
    if (namedColors[colorKey]) {
      const [hue, saturation, brightness, kelvin] = namedColors[colorKey];
      return { hue, saturation, brightness, kelvin };
    }
    
    // Handle hex colors
    if (color.startsWith('#')) {
      const hex = color.substring(1);
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      
      // Convert RGB to HSB
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const diff = max - min;
      
      let hue = 0;
      if (diff !== 0) {
        if (max === r) {
          hue = ((g - b) / diff) % 6;
        } else if (max === g) {
          hue = (b - r) / diff + 2;
        } else {
          hue = (r - g) / diff + 4;
        }
      }
      hue = Math.round(hue * 60);
      if (hue < 0) hue += 360;
      
      const saturation = max === 0 ? 0 : diff / max;
      const brightness = max;
      
      return {
        hue: Math.round(hue * 182.04), // Convert to LIFX scale (0-65535)
        saturation: Math.round(saturation * 65535),
        brightness: Math.round(brightness * 65535),
        kelvin: 3500
      };
    }
  }
  
  if (typeof color === 'object' && color !== null) {
    return {
      hue: color.hue ? Math.round(color.hue * 182.04) : 0,
      saturation: color.saturation ? Math.round(color.saturation * 65535) : 65535,
      brightness: color.brightness ? Math.round(color.brightness * 65535) : 65535,
      kelvin: color.kelvin || 3500
    };
  }
  
  throw new Error('Invalid color format');
}

async function getMatchingDevices(selector: string) {
  const parsed = parseSelector(selector);
  const matchingDevices = [];
  
  for (const [serialNumber, deviceInfo] of deviceRegistry.entries()) {
    let matches = false;
    
    switch (parsed.type) {
      case 'all':
        matches = true;
        break;
      case 'serial':
        matches = serialNumber === parsed.value;
        break;
      case 'label':
        matches = deviceInfo.label === parsed.value;
        break;
      case 'group':
        matches = deviceInfo.group?.label === parsed.value;
        break;
      case 'location':
        matches = deviceInfo.location === parsed.value;
        break;
    }
    
    if (matches) {
      try {
        const device = await devices.get(serialNumber);
        matchingDevices.push({ device, serialNumber, info: deviceInfo });
      } catch (error) {
        console.warn(`Could not get device ${serialNumber}:`, error);
      }
    }
  }
  
  return matchingDevices;
}

const SelectorSchema = z.string().default('all').describe("Optional selector to filter lights, e.g. 'all' (default), 'd073abcd1234' (a specific device's serial number), 'group:Living Room', 'location:Home'");

const ListLightsSchema = z.object({
  selector: SelectorSchema,
});

const ListLightsJSONSchema = zodToJsonSchema(ListLightsSchema);

const SetLightsPowerSchema = z.object({
  selector: SelectorSchema,
  power: z.enum(['on', 'off']),
});

const SetLightsPowerJSONSchema = zodToJsonSchema(SetLightsPowerSchema);

const SetBrightnessSchema = z.object({
  selector: SelectorSchema,
  brightness: z.number().min(0).max(1).describe("Brightness level (0.0 to 1.0)"),
  duration: z.number().min(0).optional().default(1.0).describe("Transition duration in seconds"),
});

const SetBrightnessJSONSchema = zodToJsonSchema(SetBrightnessSchema);

const SetColorSchema = z.object({
  selector: SelectorSchema,
  color: z.union([
    z.string().describe("Color name (e.g., 'red', 'blue', 'warm_white') or hex code (e.g., '#FF0000')"),
    z.object({
      hue: z.number().int().min(0).max(65535).optional().describe("Hue value (0-65535)"),
      saturation: z.number().int().min(0).max(65535).optional().describe("Saturation value (0-65535)"),
      brightness: z.number().int().min(0).max(65535).optional().describe("Brightness value (0-65535)"),
      kelvin: z.number().int().min(1500).max(9000).optional().describe("Color temperature in Kelvin"),
    })
  ]).describe("Color specification as string or HSBK object"),
  duration: z.number().min(0).optional().default(1.0).describe("Transition duration in seconds"),
});

const SetColorJSONSchema = zodToJsonSchema(SetColorSchema);

const ToggleLightsSchema = z.object({
  selector: SelectorSchema,
  duration: z.number().min(0).optional().default(1.0).describe("Transition duration in seconds"),
});

const ToggleLightsJSONSchema = zodToJsonSchema(ToggleLightsSchema);

// const GetLightInfoSchema = z.object({
//   selector: SelectorSchema,
//   include_capabilities: z.boolean().optional().default(true).describe("Include light capabilities in response"),
// });

// const GetLightInfoJSONSchema = zodToJsonSchema(GetLightInfoSchema);

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

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: 'lifx_list_lights',
        description: 'List all available Lifx lights on the network with their current status, capabilities, power, and color',
        inputSchema: ListLightsJSONSchema,
      },
      {
        name: 'lifx_set_lights_power',
        description: 'Turn lights on or off',
        inputSchema: SetLightsPowerJSONSchema,
      },
      {
        name: 'lifx_set_brightness',
        description: 'Set the brightness of lights',
        inputSchema: SetBrightnessJSONSchema,
      },
      {
        name: 'lifx_set_color',
        description: 'Set the color of lights using various color formats',
        inputSchema: SetColorJSONSchema,
      },
      {
        name: 'lifx_toggle_lights',
        description: 'Toggle the power state of lights (on becomes off, off becomes on)',
        inputSchema: ToggleLightsJSONSchema,
      },
      // {
      //   name: 'lifx_get_light_info',
      //   description: 'Get detailed information about specific lights including capabilities, current state, and hardware info',
      //   inputSchema: GetLightInfoJSONSchema,
      // }
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'lifx_list_lights': {
        const { selector } = ListLightsSchema.parse(args);
        const matchingDevices = await getMatchingDevices(selector);
        
        const lights = await Promise.all(matchingDevices.map(async ({ device, serialNumber, info }) => {
          try {
            // const [power, color] = await Promise.all([
            //   client.send(GetPowerCommand(), device).catch((err) => {
            //     console.warn(`Could not get power for ${serialNumber}:`, err);
            //     return null;
            //   }),
            //   client.send(GetColorCommand(), device).catch((err) => {
            //     console.warn(`Could not get color for ${serialNumber}:`, err);
            //     return null;
            //   }),
            // ]);
            
            return {
              serialNumber,
              label: info.label || 'Unknown',
              group: info.group?.label || 'No Group',
              location: info.location || 'No Location',
              power: info.power,
              color: info.power === 'on' ? info.color : undefined,
            };
          } catch (error) {
            return {
              serialNumber,
              label: info.label || 'Unknown',
              group: info.group?.label || 'No Group',
              location: info.location || 'No Location',
              power: 'unknown',
              color: undefined,
              error: Error.isError(error) ? error.message : error,
            };
          }
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ lights, count: lights.length }, null, 2)
          }]
        };
      }

      case 'lifx_set_lights_power': {
        const { selector, power } = SetLightsPowerSchema.parse(args);
        const matchingDevices = await getMatchingDevices(selector);
        
        const results = await Promise.all(matchingDevices.map(async ({ device, serialNumber, info }) => {
          try {
            await client.send(SetPowerCommand(power === 'on'), device);
            info.power = power;
            return { serialNumber, success: true, power };
          } catch (error) {
            return { serialNumber, success: false, error: String(error) };
          }
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results, null, 2)
          }]
        };
      }

      case 'lifx_set_brightness': {
        const { selector, brightness, duration } = SetBrightnessSchema.parse(args);
        const matchingDevices = await getMatchingDevices(selector);
        
        const results = await Promise.all(matchingDevices.map(async ({ device, serialNumber }) => {
          try {
            const currentColor = await client.send(GetColorCommand(), device);
            const durationMs = Math.round(duration * 1000);
            const brightnessValue = Math.round(brightness * 65535);
            
            await client.send(SetColorCommand(
              currentColor.hue,
              currentColor.saturation,
              brightnessValue,
              currentColor.kelvin,
              durationMs
            ), device);
            
            return { serialNumber, success: true, brightness };
          } catch (error) {
            return { serialNumber, success: false, error: String(error) };
          }
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ results, selector, brightness }, null, 2)
          }]
        };
      }

      case 'lifx_set_color': {
        const { selector, color, duration } = SetColorSchema.parse(args);
        const matchingDevices = await getMatchingDevices(selector);
        const parsedColor = parseColor(color);
        
        const results = await Promise.all(matchingDevices.map(async ({ device, serialNumber }) => {
          try {
            const durationMs = Math.round(duration * 1000);
            await client.send(SetColorCommand(
              parsedColor.hue,
              parsedColor.saturation,
              parsedColor.brightness,
              parsedColor.kelvin,
              durationMs
            ), device);
            
            return { serialNumber, success: true, color: parsedColor };
          } catch (error) {
            return { serialNumber, success: false, error: String(error) };
          }
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ results, selector, color }, null, 2)
          }]
        };
      }

      case 'lifx_toggle_lights': {
        const { selector, duration } = ToggleLightsSchema.parse(args);
        const matchingDevices = await getMatchingDevices(selector);
        
        const results = await Promise.all(matchingDevices.map(async ({ device, serialNumber }) => {
          try {
            const currentPower = await client.send(GetPowerCommand(), device);
            const newPowerState = currentPower === 0;
            
            await client.send(SetPowerCommand(newPowerState), device);
            
            return { 
              serialNumber, 
              success: true, 
              previous_state: currentPower > 0 ? 'on' : 'off',
              new_state: newPowerState ? 'on' : 'off'
            };
          } catch (error) {
            return { serialNumber, success: false, error: String(error) };
          }
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ results, selector }, null, 2)
          }]
        };
      }

      // case 'lifx_get_light_info': {
      //   const { selector, include_capabilities } = GetLightInfoSchema.parse(args);
      //   const matchingDevices = await getMatchingDevices(selector);
        
      //   const lights = await Promise.all(matchingDevices.map(async ({ device, serialNumber, info }) => {
      //     try {
      //       const lightInfo = {
      //         serialNumber,
      //         label: info.label || 'Unknown',
      //         group: info.group?.label || 'No Group',
      //         location: info.location || 'No Location',
      //         power: power ? (power > 0 ? 'on' : 'off') : 'unknown',
      //         color: color ? {
      //           hue: Math.round(color.hue / 182.04),
      //           saturation: Math.round(color.saturation / 655.35) / 100,
      //           brightness: Math.round(color.brightness / 655.35) / 100,
      //           kelvin: color.kelvin
      //         } : null,
      //         connected: true,
      //         address: device.address,
      //         port: device.port
      //       };
            
      //       if (include_capabilities) {
      //         (lightInfo as any).capabilities = {
      //           has_color: true,
      //           has_variable_color_temp: true,
      //           has_ir: false,
      //           has_chain: false,
      //           has_multizone: false,
      //           min_kelvin: 1500,
      //           max_kelvin: 9000
      //         };
      //       }
            
      //       return lightInfo;
      //     } catch (error) {
      //       return {
      //         serialNumber,
      //         label: info.label || 'Unknown',
      //         connected: false,
      //         error: String(error)
      //       };
      //     }
      //   }));

      //   return {
      //     content: [{
      //       type: 'text',
      //       text: JSON.stringify({ lights }, null, 2)
      //     }]
      //   };
      // }

      default:
        throw new Error(`Tool ${name} not found`);
    }
  });

  return { server };
}
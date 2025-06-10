import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createServer } from './tools.js';

describe('LIFX MCP Server', () => {
  let serverResult: { server: any; cleanup: () => Promise<void> };

  beforeAll(() => {
    serverResult = createServer();
  });

  afterAll(async () => {
    if (serverResult?.cleanup) {
      await serverResult.cleanup();
    }
  });

  describe('createServer', () => {
    it('should return server and cleanup function', () => {
      expect(serverResult).toHaveProperty('server');
      expect(serverResult).toHaveProperty('cleanup');
      expect(typeof serverResult.cleanup).toBe('function');
    });

    it('should create server with correct info', () => {
      const { server } = serverResult;
      expect(server).toBeDefined();
      expect(server._serverInfo).toBeDefined();
      expect(server._serverInfo.name).toBe('lifx-controller');
      expect(server._serverInfo.version).toBe('0.1.0');
    });

    it('should have tools capability', () => {
      const { server } = serverResult;
      expect(server._capabilities).toBeDefined();
      expect(server._capabilities.tools).toBeDefined();
    });
  });

  describe('tool definitions', () => {
    it('should define all required tools', async () => {
      const { server } = serverResult;
      
      // Get the tools handler
      const toolsHandler = server._requestHandlers.get('tools/list');
      expect(toolsHandler).toBeDefined();
      
      if (toolsHandler) {
        const response = await toolsHandler({
          method: 'tools/list',
          params: {},
        });
        
        expect(response.tools).toHaveLength(6);
        const toolNames = response.tools.map((t: any) => t.name);
        expect(toolNames).toContain('discover_devices');
        expect(toolNames).toContain('list_devices');
        expect(toolNames).toContain('set_power');
        expect(toolNames).toContain('get_power');
        expect(toolNames).toContain('set_color');
        expect(toolNames).toContain('get_color');
      }
    });

    it('should have correct schema for set_power tool', async () => {
      const { server } = serverResult;
      const toolsHandler = server._requestHandlers.get('tools/list');
      
      if (toolsHandler) {
        const response = await toolsHandler({
          method: 'tools/list',
          params: {},
        });
        
        const setPowerTool = response.tools.find((t: any) => t.name === 'set_power');
        expect(setPowerTool).toBeDefined();
        expect(setPowerTool.inputSchema.required).toEqual(['serialNumber', 'power']);
        expect(setPowerTool.inputSchema.properties.power.type).toBe('boolean');
        expect(setPowerTool.inputSchema.properties.serialNumber.type).toBe('string');
      }
    });

    it('should have correct schema for set_color tool', async () => {
      const { server } = serverResult;
      const toolsHandler = server._requestHandlers.get('tools/list');
      
      if (toolsHandler) {
        const response = await toolsHandler({
          method: 'tools/list',
          params: {},
        });
        
        const setColorTool = response.tools.find((t: any) => t.name === 'set_color');
        expect(setColorTool).toBeDefined();
        expect(setColorTool.inputSchema.required).toEqual(['serialNumber', 'hue', 'saturation', 'brightness', 'kelvin']);
        expect(setColorTool.inputSchema.properties.hue.maximum).toBe(65535);
        expect(setColorTool.inputSchema.properties.saturation.maximum).toBe(65535);
        expect(setColorTool.inputSchema.properties.brightness.maximum).toBe(65535);
        expect(setColorTool.inputSchema.properties.kelvin.minimum).toBe(2500);
        expect(setColorTool.inputSchema.properties.kelvin.maximum).toBe(9000);
      }
    });
  });

  describe('tool execution - error cases', () => {
    it('should handle device not found error', async () => {
      const { server } = serverResult;
      const callHandler = server._requestHandlers.get('tools/call');
      
      if (callHandler) {
        await expect(
          callHandler({
            method: 'tools/call',
            params: {
              name: 'set_power',
              arguments: {
                serialNumber: 'nonexistent-device',
                power: true,
              },
            },
          })
        ).rejects.toThrow('Device with serial number nonexistent-device not found');
      }
    });

    it('should handle unknown tool error', async () => {
      const { server } = serverResult;
      const callHandler = server._requestHandlers.get('tools/call');
      
      if (callHandler) {
        await expect(
          callHandler({
            method: 'tools/call',
            params: {
              name: 'unknown_tool',
              arguments: {},
            },
          })
        ).rejects.toThrow('Unknown tool: unknown_tool');
      }
    });
  });

  describe('discovery and listing tools', () => {
    it('should handle discover_devices tool', async () => {
      const { server } = serverResult;
      const callHandler = server._requestHandlers.get('tools/call');
      
      if (callHandler) {
        const response = await callHandler({
          method: 'tools/call',
          params: {
            name: 'discover_devices',
            arguments: {},
          },
        });
        
        expect(response.content).toHaveLength(1);
        expect(response.content[0].type).toBe('text');
        expect(response.content[0].text).toContain('Discovery broadcast sent');
      }
    });

    it('should handle list_devices tool', async () => {
      const { server } = serverResult;
      const callHandler = server._requestHandlers.get('tools/call');
      
      if (callHandler) {
        const response = await callHandler({
          method: 'tools/call',
          params: {
            name: 'list_devices',
            arguments: {},
          },
        });
        
        expect(response.content).toHaveLength(1);
        expect(response.content[0].type).toBe('text');
        
        // Should return valid JSON array
        const deviceList = JSON.parse(response.content[0].text);
        expect(Array.isArray(deviceList)).toBe(true);
      }
    });
  });

  describe('input validation', () => {
    it('should validate required parameters for set_power', async () => {
      const { server } = serverResult;
      const callHandler = server._requestHandlers.get('tools/call');
      
      if (callHandler) {
        // Test missing serialNumber
        await expect(
          callHandler({
            method: 'tools/call',
            params: {
              name: 'set_power',
              arguments: {
                power: true,
              },
            },
          })
        ).rejects.toThrow();

        // Test missing power
        await expect(
          callHandler({
            method: 'tools/call',
            params: {
              name: 'set_power',
              arguments: {
                serialNumber: 'test123',
              },
            },
          })
        ).rejects.toThrow();
      }
    });

    it('should validate required parameters for set_color', async () => {
      const { server } = serverResult;
      const callHandler = server._requestHandlers.get('tools/call');
      
      if (callHandler) {
        // Test missing required parameters
        await expect(
          callHandler({
            method: 'tools/call',
            params: {
              name: 'set_color',
              arguments: {
                serialNumber: 'test123',
                hue: 0,
                // missing saturation, brightness, kelvin
              },
            },
          })
        ).rejects.toThrow();
      }
    });
  });
});
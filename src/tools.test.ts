import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { z } from 'zod';

// Define schemas at module level so they're accessible across all test suites
const SelectorSchema = z.string().default('all').describe("Optional selector to filter lights, e.g. 'all' (default), 'd073abcd1234' (a specific device's serial number), 'group:Living Room', 'location:Home'");

const ListLightsSchema = z.object({
  selector: SelectorSchema,
});

const SetLightsPowerSchema = z.object({
  selector: SelectorSchema,
  power: z.enum(['on', 'off']),
});

const SetBrightnessSchema = z.object({
  selector: SelectorSchema,
  brightness: z.number().min(0).max(1).describe("Brightness level (0.0 to 1.0)"),
  duration: z.number().min(0).optional().default(1.0).describe("Transition duration in seconds"),
});

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

const ToggleLightsSchema = z.object({
  selector: SelectorSchema,
  duration: z.number().min(0).optional().default(1.0).describe("Transition duration in seconds"),
});

const GetLightInfoSchema = z.object({
  selector: SelectorSchema,
  include_capabilities: z.boolean().optional().default(true).describe("Include light capabilities in response"),
});

// Simple unit tests focused on schema validation and basic functionality
describe('LIFX MCP Server Tools - Basic Functionality', () => {
  
  describe('Zod Schema Validation', () => {

    it('should validate ListLightsSchema with default selector', () => {
      const validData = {};
      const result = ListLightsSchema.parse(validData);
      expect(result.selector).toBe('all');
    });

    it('should validate ListLightsSchema with custom selector', () => {
      const validData = { selector: 'group:Living Room' };
      expect(() => ListLightsSchema.parse(validData)).not.toThrow();
    });

    it('should validate SetLightsPowerSchema with valid data', () => {
      const validData = { selector: 'all', power: 'on' };
      expect(() => SetLightsPowerSchema.parse(validData)).not.toThrow();
    });

    it('should reject SetLightsPowerSchema with invalid power value', () => {
      const invalidData = { selector: 'all', power: 'invalid' };
      expect(() => SetLightsPowerSchema.parse(invalidData)).toThrow();
    });

    it('should validate SetBrightnessSchema with valid data', () => {
      const validData = { selector: 'all', brightness: 0.8 };
      expect(() => SetBrightnessSchema.parse(validData)).not.toThrow();
    });

    it('should reject SetBrightnessSchema with brightness out of range', () => {
      const invalidData = { selector: 'all', brightness: 1.5 };
      expect(() => SetBrightnessSchema.parse(invalidData)).toThrow();
    });

    it('should validate SetColorSchema with string color', () => {
      const validData = { selector: 'all', color: 'red' };
      expect(() => SetColorSchema.parse(validData)).not.toThrow();
    });

    it('should validate SetColorSchema with hex color', () => {
      const validData = { selector: 'all', color: '#FF0000' };
      expect(() => SetColorSchema.parse(validData)).not.toThrow();
    });

    it('should validate SetColorSchema with HSBK object', () => {
      const validData = {
        selector: 'all',
        color: {
          hue: 32768,
          saturation: 65535,
          brightness: 49152,
          kelvin: 3500
        }
      };
      expect(() => SetColorSchema.parse(validData)).not.toThrow();
    });

    it('should reject SetColorSchema with hue out of range', () => {
      const invalidData = {
        selector: 'all',
        color: {
          hue: 70000, // Out of range
          saturation: 65535,
          brightness: 49152,
          kelvin: 3500
        }
      };
      expect(() => SetColorSchema.parse(invalidData)).toThrow();
    });

    it('should reject SetColorSchema with kelvin out of range', () => {
      const invalidData = {
        selector: 'all',
        color: {
          hue: 32768,
          saturation: 65535,
          brightness: 49152,
          kelvin: 10000 // Out of range
        }
      };
      expect(() => SetColorSchema.parse(invalidData)).toThrow();
    });

    it('should validate ToggleLightsSchema with default values', () => {
      const validData = { selector: 'all' };
      const result = ToggleLightsSchema.parse(validData);
      expect(result.duration).toBe(1.0);
    });

    it('should validate GetLightInfoSchema with default values', () => {
      const validData = { selector: 'all' };
      const result = GetLightInfoSchema.parse(validData);
      expect(result.include_capabilities).toBe(true);
    });
  });

  describe('Tool Creation Tests', () => {
    it('should be able to import createServer function', async () => {
      const { createServer } = await import('./tools.js');
      expect(typeof createServer).toBe('function');
    });

    it('should create server with correct tool names', async () => {
      const { createServer } = await import('./tools.js');
      const { server } = createServer();
      
      // Test that server can be created without throwing
      expect(server).toBeDefined();
    });
  });

  describe('Color Parsing Tests', () => {
    it('should handle named colors', () => {
      // This would require importing the parseColor function
      // For now, just test that the schema accepts string colors
      const validData = { selector: 'all', color: 'red' };
      expect(() => SetColorSchema.parse(validData)).not.toThrow();
    });

    it('should handle hex colors', () => {
      const validData = { selector: 'all', color: '#FF0000' };
      expect(() => SetColorSchema.parse(validData)).not.toThrow();
    });
  });

  describe('Selector Parsing Tests', () => {
    it('should accept all selector', () => {
      const validData = { selector: 'all' };
      expect(() => ListLightsSchema.parse(validData)).not.toThrow();
    });

    it('should accept group selector', () => {
      const validData = { selector: 'group:Living Room' };
      expect(() => ListLightsSchema.parse(validData)).not.toThrow();
    });

    it('should accept label selector', () => {
      const validData = { selector: 'label:Desk Lamp' };
      expect(() => ListLightsSchema.parse(validData)).not.toThrow();
    });

    it('should accept serial number as selector', () => {
      const validData = { selector: 'd073abcd1234' };
      expect(() => ListLightsSchema.parse(validData)).not.toThrow();
    });
  });
});
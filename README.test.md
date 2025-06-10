# Test Documentation

## Overview
This project includes comprehensive unit tests for the LIFX MCP (Model Context Protocol) server implementation.

## Test Structure

### `tools.test.ts`
Tests the core MCP server functionality:
- **Server Creation**: Validates proper server instantiation and configuration
- **Tool Definitions**: Ensures all 6 LIFX tools are properly defined with correct schemas
- **Error Handling**: Tests device not found errors and unknown tool handling
- **Input Validation**: Validates required parameters for power and color tools
- **Discovery Tools**: Tests device discovery and listing functionality

### `index.test.ts` 
Tests integration and protocol compliance:
- **createServer Integration**: Validates the server factory function
- **MCP Protocol Compliance**: Ensures proper MCP protocol adherence
- **LIFX Functionality**: Tests LIFX-specific operations
- **Error Handling**: Validates graceful error handling

## Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run tests with coverage
bun test --coverage
```

## Test Coverage

The tests cover:
- ✅ MCP server creation and configuration
- ✅ All 6 LIFX tools (discover_devices, list_devices, set_power, get_power, set_color, get_color)
- ✅ Tool schema validation
- ✅ Error handling for missing devices
- ✅ Input parameter validation
- ✅ Protocol compliance
- ✅ Cleanup functionality

## Tools Tested

1. **discover_devices** - Triggers LIFX device discovery on the network
2. **list_devices** - Returns list of discovered devices
3. **set_power** - Controls device power state (on/off)
4. **get_power** - Retrieves device power state
5. **set_color** - Sets device color (hue, saturation, brightness, kelvin)
6. **get_color** - Retrieves current device color

## Test Results
All 24 tests pass, covering both unit functionality and integration scenarios.
// Manual mock for @actions/core used in all tests
const core = {
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  setOutput: jest.fn(),
  setFailed: jest.fn(),
  getInput: jest.fn(),
  getBooleanInput: jest.fn(),
};

module.exports = core;

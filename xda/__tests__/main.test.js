const { describe, test, expect, beforeEach } = require('@jest/globals');
const MainProcess = require('../main/main');

describe('Main Process', () => {
  let main;

  beforeEach(() => {
    main = new MainProcess();
  });

  test('should initialize XMBL node', async () => {
    await main.init();
    expect(main.isNodeInitialized()).toBe(true);
  });

  test('should have node initialized after init', async () => {
    await main.init();
    expect(main.isNodeInitialized()).toBe(true);
    expect(main.core).toBeDefined();
  });

  test('should create window', () => {
    const window = main.createWindow();
    expect(window).toBeDefined();
  });
});


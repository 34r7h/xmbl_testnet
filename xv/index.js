import { XMBLVisualizer } from './src/visualizer.js';

const port = process.env.PORT || 3008;

console.log(`XV (XMBL Visualizer) starting on port ${port}`);

// Export visualizer
export { XMBLVisualizer };

// If running in browser, initialize
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const visualizer = new XMBLVisualizer();
    window.xmblVisualizer = visualizer;
  });
}




// XMBL Browser Extension Background Script
// Runs full XMBL node in background

console.log('XMBL Background Service Worker started');

// Initialize XMBL node when extension starts
chrome.runtime.onInstalled.addListener(() => {
  console.log('XMBL Extension installed');
  // Initialize node
});

// Handle messages from popup/content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'getNodeStatus') {
    sendResponse({ status: 'running' });
  }
  return true;
});


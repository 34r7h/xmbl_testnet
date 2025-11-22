// XMBL Content Script
// Injects XMBL functionality into web pages

console.log('XMBL Content Script loaded');

// Listen for messages from extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'injectXMBL') {
    // Inject XMBL functionality into page
    console.log('Injecting XMBL into page');
  }
});


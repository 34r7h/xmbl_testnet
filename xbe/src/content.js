import browser from 'webextension-polyfill';

// Inject XMBL provider into page
function injectProvider() {
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      if (window.xmbl) {
        console.log('XMBL provider already exists');
        return;
      }
      
      window.xmbl = {
        async sendTransaction(tx) {
          return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              type: 'sendTransaction',
              tx
            }, (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else if (response && response.error) {
                reject(new Error(response.error));
              } else {
                resolve(response);
              }
            });
          });
        },
        async getBalance(address) {
          return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              type: 'getBalance',
              address
            }, (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else if (response && response.error) {
                reject(new Error(response.error));
              } else {
                resolve(response);
              }
            });
          });
        },
        async getNodeStatus() {
          return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              type: 'getNodeStatus'
            }, (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else if (response && response.error) {
                reject(new Error(response.error));
              } else {
                resolve(response);
              }
            });
          });
        }
      };
      
      console.log('XMBL provider injected');
      
      // Dispatch event to notify page
      window.dispatchEvent(new CustomEvent('xmbl-ready'));
    })();
  `;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

// Inject provider when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectProvider);
} else {
  injectProvider();
}

// Listen for messages from extension
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'injectXMBL') {
    injectProvider();
    sendResponse({ success: true });
  }
  return true;
});

console.log('XMBL Content Script loaded');




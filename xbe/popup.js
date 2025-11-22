// XMBL Wallet Popup Script

document.addEventListener('DOMContentLoaded', () => {
  // Get node status
  chrome.runtime.sendMessage({ type: 'getNodeStatus' }, (response) => {
    document.getElementById('nodeStatus').textContent = response.status;
  });

  // Send transaction button
  document.getElementById('sendTx').addEventListener('click', () => {
    // Open send transaction dialog
    console.log('Send transaction clicked');
  });
});


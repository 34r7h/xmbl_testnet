// Vue 3 renderer for XMBL Desktop App
import { createApp } from 'vue';

const app = createApp({
  data() {
    return {
      nodeStatus: 'connecting',
      balance: 0
    };
  },
  mounted() {
    // Get node status
    if (window.xmbl) {
      window.xmbl.getNodeStatus().then(status => {
        this.nodeStatus = status;
      });
    }
  }
});

app.mount('#app');


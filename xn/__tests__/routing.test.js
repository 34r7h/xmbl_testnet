import { expect } from 'chai';
import { MessageRouter } from '../src/routing.js';

describe('Message Routing', () => {
  it('should register message handler', () => {
    const router = new MessageRouter();
    const handler = () => {};
    router.register('transaction', handler);
    expect(router.hasHandler('transaction')).to.be.true;
  });

  it('should route message to handler', async () => {
    const router = new MessageRouter();
    const handler = (data) => {
      expect(data).to.deep.equal({ to: 'bob', amount: 1.0 });
    };
    router.register('transaction', handler);
    
    const message = { type: 'transaction', data: { to: 'bob', amount: 1.0 } };
    await router.route(message);
  });

  it('should handle unknown message type', async () => {
    const router = new MessageRouter();
    const message = { type: 'unknown', data: {} };
    try {
      await router.route(message);
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('No handler for message type: unknown');
    }
  });
});


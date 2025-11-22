import { expect } from 'chai';
import { ConnectionManager } from '../src/connection.js';

describe('Connection Manager', () => {
  it('should maintain connection pool', () => {
    const manager = new ConnectionManager({ maxConnections: 10 });
    expect(manager.getMaxConnections()).to.equal(10);
  });

  it('should add connection', () => {
    const manager = new ConnectionManager();
    manager.addConnection('peer1', {});
    expect(manager.getConnectionCount()).to.equal(1);
  });

  it('should remove connection', () => {
    const manager = new ConnectionManager();
    manager.addConnection('peer1', {});
    manager.removeConnection('peer1');
    expect(manager.getConnectionCount()).to.equal(0);
  });

  it('should enforce max connections', () => {
    const manager = new ConnectionManager({ maxConnections: 2 });
    manager.addConnection('peer1', {});
    manager.addConnection('peer2', {});
    try {
      manager.addConnection('peer3', {});
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('Max connections reached');
    }
  });

  it('should get connection by peer ID', () => {
    const manager = new ConnectionManager();
    const conn = { id: 'peer1' };
    manager.addConnection('peer1', conn);
    expect(manager.getConnection('peer1')).to.equal(conn);
    expect(manager.getConnection('nonexistent')).to.be.undefined;
  });

  it('should get all connections', () => {
    const manager = new ConnectionManager();
    manager.addConnection('peer1', { id: 1 });
    manager.addConnection('peer2', { id: 2 });
    const all = manager.getAllConnections();
    expect(all.length).to.equal(2);
    expect(all[0][0]).to.equal('peer1');
    expect(all[1][0]).to.equal('peer2');
  });
});


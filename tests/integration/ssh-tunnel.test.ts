/**
 * The SSH tunnel: bytes across it, both authentication methods the app offers, several sockets
 * at once over one connection, and every failure mode that has to reject instead of hanging.
 *
 * The contract is `SSHTunnel.open(config, {remoteAddr, remotePort})` resolving to a tunnel with
 * `localPort` and `close()`. `config` is what src/main/ipc-handlers/connection.ts:62-70 builds
 * plus the reconnect options MySQLClient.ts:162-166 adds on top.
 *
 * No Docker, no servers from tests/docker-compose.yml and no new dependency: the SSH server is
 * ssh2's own, the host and client keys are generated in memory, and the backend is a net echo
 * server. Everything binds 127.0.0.1 on listen(0), so concurrent test processes never collide.
 *
 * node:test does not kill dangling handles — the trap connections.test.ts:26-29 describes. Every
 * server and tunnel is registered on creation and torn down in after(), or the Electron process
 * outlives a green run.
 */
import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as net from 'node:net';
import { after, describe, it } from 'node:test';

import { AuthContext, Connection, Server, utils } from 'ssh2';

import { SSHTunnel } from '../../src/main/libs/SSHTunnel';
import { DEAD_PORT, portOpen } from '../support/db';

/** Every case has to settle well inside this; a hang is the bug we are hunting. */
const FAST = 4000;
/**
 * The default reconnect delay is 5000 ms, which would drag the reconnect cases out for half a
 * minute. The tunnel has to honour the option so a retry is observable in milliseconds.
 */
const RECONNECT_DELAY = 150;
/** Long enough that a close() sitting out a retry delay is unmistakable, short enough to stay cheap. */
const SLOW_RECONNECT = 2000;
/** The suite runs in several processes at once, so every shared name carries the pid. */
const USER = `antares_it_${process.pid}`;
const PASSWORD = `s3cret-${process.pid}`;
const HOST = '127.0.0.1';

/**
 * An orphaned rejection in the main process kills the whole app, so the case 'closes the client
 * socket when the link died without closing' reads this log back rather than just printing it.
 * Recording them also keeps the file finishing instead of dying mid-run.
 */
const unhandled: unknown[] = [];

process.on('unhandledRejection', reason => {
   unhandled.push(reason);
   console.error('unhandled rejection swallowed:', reason);
});

const keyPair = () => crypto.generateKeyPairSync('rsa', {
   modulusLength: 2048,
   publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
   privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
});

const HOST_KEY = keyPair().privateKey;
/** The app reads the key file itself (connection.ts:67) and hands over the PEM as a string. */
const CLIENT_KEY_PEM = keyPair().privateKey;
const CLIENT_KEY = utils.parseKey(CLIENT_KEY_PEM) as Exclude<ReturnType<typeof utils.parseKey>, Error>;

/* --------------------------------------------------------------------- harness */

/** Everything holding a file descriptor, drained newest first when the file ends. */
const openResources: (() => Promise<void>)[] = [];

after(async () => {
   for (const close of openResources.reverse()) await close();
   openResources.length = 0;
});

const waitFor = async (what: string, ready: () => boolean, timeout = FAST) => {
   const deadline = Date.now() + timeout;
   while (!ready()) {
      if (Date.now() > deadline) throw new Error(`timed out after ${timeout}ms waiting for ${what}`);
      await new Promise(resolve => setTimeout(resolve, 20));
   }
};

/** Node reports an orphaned rejection a turn after the throw, so give it one before reading. */
const drain = () => new Promise(resolve => setImmediate(resolve));

interface FakeSSHServer {
   port: number;
   /** Authentication methods the client actually offered, in order. */
   methods: string[];
   /** SSH connections accepted so far; a reconnect shows up as another one. */
   connections: number;
   /** Sends every direct-tcpip request to a refused port instead of to the real backend. */
   deadRemote: boolean;
   /** Drops every new SSH connection before it is ready, so redialling keeps failing. */
   refuseLinks: boolean;
   /** Accepts every new SSH connection and then answers nothing at all. */
   swallowLinks: boolean;
   /** Drops the TCP link under every live connection, the way a lost network does. */
   kill(): void;
   /** Ruins the SSH stream on every live connection without closing its TCP socket. */
   breakLink(): void;
}

const socketOf = (client: Connection) => (client as unknown as { _sock: net.Socket })._sock;
const drop = (client: Connection) => socketOf(client).destroy();

const startSSHServer = async (auth: (ctx: AuthContext) => void): Promise<FakeSSHServer> => {
   const clients = new Set<Connection>();
   /** Sockets this server will never close by itself; after() destroys them or nothing exits. */
   const lingering = new Set<net.Socket>();

   const fake: FakeSSHServer = {
      port: 0,
      methods: [],
      connections: 0,
      deadRemote: false,
      refuseLinks: false,
      swallowLinks: false,
      kill: () => {
         for (const client of clients) drop(client);
      },
      breakLink: () => {
         for (const client of clients) {
            const socket = socketOf(client);
            // Half-open on this side, so the client's own socket never reaches 'close' and its
            // owner is never told the link is gone. The garbage is what kills the link: the
            // client's parser gives up on it and ends its half, which is all it takes for every
            // later forwardOut to throw 'Not connected' where nothing expects a throw.
            socket.allowHalfOpen = true;
            lingering.add(socket);
            socket.write(crypto.randomBytes(128));
         }
      }
   };

   const server = new Server({ hostKeys: [HOST_KEY] }, client => {
      fake.connections++;
      clients.add(client);
      client.on('close', () => clients.delete(client));
      client.on('error', () => { /* a dropped link surfaces here; the test is the judge */ });
      if (fake.refuseLinks) return drop(client);
      if (fake.swallowLinks) {
         // Accepted, then ignored for good: the client sits in its handshake until ssh2's
         // readyTimeout, the way a host that drops packets behaves next to one that refuses.
         clients.delete(client);
         const socket = socketOf(client);
         socket.removeAllListeners('data');
         socket.pause();
         lingering.add(socket);
         return;
      }
      client.on('authentication', ctx => {
         fake.methods.push(ctx.method);
         auth(ctx);
      });
      client.on('ready', () => {
         // direct-tcpip: one channel per socket the tunnel forwards.
         client.on('tcpip', (accept, reject, info) => {
            const upstream = net.connect(fake.deadRemote ? DEAD_PORT : info.destPort, info.destIP);
            upstream.once('error', () => reject());
            upstream.once('connect', () => {
               upstream.removeAllListeners('error');
               upstream.on('error', () => upstream.destroy());
               const channel = accept();
               upstream.pipe(channel).pipe(upstream);
               channel.once('close', () => upstream.destroy());
            });
         });
      });
   });

   await new Promise<void>(resolve => server.listen(0, HOST, () => resolve()));
   fake.port = (server.address() as net.AddressInfo).port;

   openResources.push(() => new Promise<void>(resolve => {
      // A graceful disconnect rather than fake.kill(): an abrupt drop starts a reconnect against
      // a server that is on its way out.
      for (const client of clients) client.end();
      // end() is a no-op on a socket whose read side is already finished, and net.Server.close()
      // waits for every last connection, so the half-dead ones have to be destroyed by hand.
      for (const socket of lingering) socket.destroy();
      server.close(() => resolve());
   }));

   return fake;
};

/** A backend that writes back whatever it is sent, standing in for the database server. */
const startEcho = async () => {
   const sockets = new Set<net.Socket>();

   const server = net.createServer(socket => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => socket.destroy());
      socket.pipe(socket);
   });

   await new Promise<void>(resolve => server.listen(0, HOST, () => resolve()));

   openResources.push(() => new Promise<void>(resolve => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
   }));

   return (server.address() as net.AddressInfo).port;
};

/**
 * Writes one payload to `port` and resolves with what comes back. It always settles, and its
 * message says which way it failed: a tunnel that swallows the connection turns a test red
 * instead of stalling the whole run.
 */
const roundTrip = (port: number, payload: string, timeout = FAST) => new Promise<string>((resolve, reject) => {
   const socket = net.connect(port, HOST);
   let received = '';
   let settled = false;

   const finish = (err: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      err ? reject(err) : resolve(received);
   };

   const timer = setTimeout(() => finish(new Error(`no echo from ${HOST}:${port} within ${timeout}ms`)), timeout);

   socket.on('connect', () => socket.write(payload));
   socket.on('data', chunk => {
      received += chunk.toString();
      if (received.length >= payload.length) finish(null);
   });
   socket.on('close', () => finish(new Error(`socket closed after ${received.length} of ${payload.length} bytes`)));
   socket.on('error', err => finish(err));
});

/** Settles `promise` and insists it failed rather than succeeded. */
const rejection = async (label: string, promise: Promise<unknown>) => {
   const err: NodeJS.ErrnoException = await promise.then(() => null, e => e);
   assert.ok(err, `${label}: expected a rejection, got success`);
   return err;
};

const acceptPassword = (ctx: AuthContext) => {
   if (ctx.method === 'password' && ctx.username === USER && ctx.password === PASSWORD)
      return ctx.accept();
   ctx.reject();
};

const acceptPublicKey = (ctx: AuthContext) => {
   if (ctx.method !== 'publickey' || ctx.username !== USER) return ctx.reject();
   if (!ctx.key.data.equals(CLIENT_KEY.getPublicSSH())) return ctx.reject();
   if (ctx.signature && CLIENT_KEY.verify(ctx.blob, ctx.signature, ctx.hashAlgo) !== true)
      return ctx.reject();
   ctx.accept();
};

/* ------------------------------------------------------------------- contract */

/** Exactly connection.ts:62-70, plus the reconnect options MySQLClient.ts:163-176 adds. */
interface TunnelConfig {
   host: string;
   port: number;
   username: string;
   password?: string;
   privateKey?: string;
   passphrase?: string;
   keepaliveInterval?: number;
   reconnect?: boolean;
   reconnectTries?: number;
   reconnectDelay?: number;
}

interface Destination { remoteAddr: string; remotePort: number }

const configFor = (ssh: { port: number }, extra: Partial<TunnelConfig>): TunnelConfig => ({
   host: HOST,
   port: ssh.port,
   username: USER,
   reconnect: true,
   reconnectTries: 3,
   reconnectDelay: RECONNECT_DELAY,
   ...extra
});

/* ---------------------------------------------------------------------- cases */

describe('ssh tunnel', () => {
   /** Opens a tunnel and makes sure it is closed even when the assertions below fail. */
   const openTunnel = async (config: TunnelConfig, to: Destination) => {
      const tunnel = await SSHTunnel.open(config, to);
      openResources.push(() => tunnel.close().then(() => undefined, () => undefined));
      return tunnel;
   };

   it('carries bytes to the backend and back', async () => {
      const ssh = await startSSHServer(acceptPassword);
      const remotePort = await startEcho();
      const tunnel = await openTunnel(configFor(ssh, { password: PASSWORD }), { remoteAddr: HOST, remotePort });

      const payload = `hello-${process.pid}`;
      assert.equal(await roundTrip(tunnel.localPort, payload), payload);
   });

   it('listens on an ephemeral local port of its own', async () => {
      const ssh = await startSSHServer(acceptPassword);
      const remotePort = await startEcho();
      const tunnel = await openTunnel(configFor(ssh, { password: PASSWORD }), { remoteAddr: HOST, remotePort });

      assert.ok(tunnel.localPort > 0, `localPort was ${tunnel.localPort}`);
      assert.notEqual(tunnel.localPort, remotePort);
      assert.equal(await portOpen(HOST, tunnel.localPort), true, 'nothing is listening on localPort');
   });

   it('authenticates with a password', async () => {
      const ssh = await startSSHServer(acceptPassword);
      const remotePort = await startEcho();
      const tunnel = await openTunnel(configFor(ssh, { password: PASSWORD }), { remoteAddr: HOST, remotePort });

      assert.equal(await roundTrip(tunnel.localPort, 'pw'), 'pw');
      assert.ok(ssh.methods.includes('password'), `server saw ${ssh.methods.join(', ')}`);
   });

   it('authenticates with a private key the caller already read from disk', async () => {
      const ssh = await startSSHServer(acceptPublicKey);
      const remotePort = await startEcho();
      const tunnel = await openTunnel(configFor(ssh, { privateKey: CLIENT_KEY_PEM }), { remoteAddr: HOST, remotePort });

      assert.equal(await roundTrip(tunnel.localPort, 'key'), 'key');
      assert.ok(ssh.methods.includes('publickey'), `server saw ${ssh.methods.join(', ')}`);
   });

   it('keeps concurrent sockets apart on one connection', async () => {
      const ssh = await startSSHServer(acceptPassword);
      const remotePort = await startEcho();
      const tunnel = await openTunnel(configFor(ssh, { password: PASSWORD }), { remoteAddr: HOST, remotePort });

      // What the MySQL pool does: several sockets, each on its own channel over one link.
      const payloads = Array.from({ length: 5 }, (_, i) => `socket-${i}-${process.pid}-${'x'.repeat(64)}`);
      const echoed = await Promise.all(payloads.map(payload => roundTrip(tunnel.localPort, payload)));

      assert.deepEqual(echoed, payloads);
      assert.equal(ssh.connections, 1, 'the sockets did not share one SSH connection');
   });

   it('rejects a wrong password instead of hanging', async () => {
      const ssh = await startSSHServer(acceptPassword);
      const remotePort = await startEcho();
      const started = Date.now();

      await rejection(
         'wrong password',
         openTunnel(configFor(ssh, { password: `${PASSWORD}-wrong` }), { remoteAddr: HOST, remotePort })
      );
      assert.ok(Date.now() - started < FAST, `took ${Date.now() - started}ms, expected < ${FAST}ms (hang)`);
   });

   it('rejects an unreachable SSH host instead of hanging', async () => {
      const remotePort = await startEcho();
      const started = Date.now();

      await rejection(
         'unreachable SSH host',
         openTunnel(configFor({ port: DEAD_PORT }, { password: PASSWORD }), { remoteAddr: HOST, remotePort })
      );
      assert.ok(Date.now() - started < FAST, `took ${Date.now() - started}ms, expected < ${FAST}ms (hang)`);
   });

   it('survives a refused remote port', async () => {
      const ssh = await startSSHServer(acceptPassword);
      const remotePort = await startEcho();
      const tunnel = await openTunnel(configFor(ssh, { password: PASSWORD }), { remoteAddr: HOST, remotePort });

      ssh.deadRemote = true;
      await rejection('refused remote port', roundTrip(tunnel.localPort, 'refused', 1500));

      // The failure belongs to that one socket: the tunnel server is still accepting.
      assert.equal(await portOpen(HOST, tunnel.localPort), true, 'the tunnel server died with the socket');
      ssh.deadRemote = false;
      assert.equal(await roundTrip(tunnel.localPort, 'again'), 'again');
   });

   it('closes the client socket when the remote port refuses', async () => {
      const ssh = await startSSHServer(acceptPassword);
      const remotePort = await startEcho();
      const tunnel = await openTunnel(configFor(ssh, { password: PASSWORD }), { remoteAddr: HOST, remotePort });

      ssh.deadRemote = true;
      await assert.rejects(roundTrip(tunnel.localPort, 'refused', 1500), /socket closed after 0 of/);
   });

   it('closes the client socket when the link died without closing', async () => {
      const ssh = await startSSHServer(acceptPassword);
      const remotePort = await startEcho();
      const tunnel = await openTunnel(configFor(ssh, { password: PASSWORD }), { remoteAddr: HOST, remotePort });

      assert.equal(await roundTrip(tunnel.localPort, 'alive'), 'alive');

      // The link is dead while the client still holds it: ssh2 has nothing left to write on
      // and has not emitted 'close', so the tunnel has had no chance to drop the client yet.
      const orphans = unhandled.length;
      ssh.breakLink();
      const err = await rejection('dead link', roundTrip(tunnel.localPort, 'dead', 1500));
      await drain();

      assert.deepEqual(
         unhandled.slice(orphans).map(reason => (reason as Error)?.message ?? String(reason)),
         [],
         'forwarding threw where no handler could see it; in the main process that is fatal'
      );
      // Destroying a socket whose bytes nobody has read yet reaches the client as a reset
      // rather than as a clean close; either way it is shut and the caller is not left
      // waiting on it, which is all this asserts.
      assert.match(
         err.message,
         /socket closed after 0 of|ECONNRESET/,
         `the socket was left open instead: ${err.message}`
      );
   });

   it('releases the local port on close()', async () => {
      const ssh = await startSSHServer(acceptPassword);
      const remotePort = await startEcho();
      const tunnel = await openTunnel(configFor(ssh, { password: PASSWORD }), { remoteAddr: HOST, remotePort });
      const { localPort } = tunnel;

      await tunnel.close();

      assert.equal(await portOpen(HOST, localPort), false, `something still listens on ${localPort}`);
      await new Promise<void>((resolve, reject) => {
         const probe = net.createServer();
         probe.once('error', reject);
         probe.listen(localPort, HOST, () => probe.close(() => resolve()));
      });
   });

   it('serves the tunnel again after the SSH link drops', async () => {
      const ssh = await startSSHServer(acceptPassword);
      const remotePort = await startEcho();
      const tunnel = await openTunnel(configFor(ssh, { password: PASSWORD }), { remoteAddr: HOST, remotePort });

      assert.equal(await roundTrip(tunnel.localPort, 'before'), 'before');

      ssh.kill();
      await waitFor('the tunnel to reconnect', () => ssh.connections > 1);

      assert.equal(await roundTrip(tunnel.localPort, 'after'), 'after');
   });

   it('closes at once while a redial hangs on a host that never answers', async () => {
      const ssh = await startSSHServer(acceptPassword);
      const remotePort = await startEcho();
      const tunnel = await openTunnel(configFor(ssh, { password: PASSWORD }), { remoteAddr: HOST, remotePort });

      assert.equal(await roundTrip(tunnel.localPort, 'before'), 'before');

      // Redials are accepted and then left unanswered, which is what a host that drops
      // packets does. Nothing settles that dial on its own inside ssh2's 20s readyTimeout,
      // and that is the whole window the user spends waiting for disconnect.
      ssh.swallowLinks = true;
      ssh.kill();
      await waitFor('a redial that hangs', () => ssh.connections > 1);

      const started = Date.now();
      await tunnel.close();
      const took = Date.now() - started;

      assert.ok(took < 500, `close() took ${took}ms, expected < 500ms (it waited on the hanging dial)`);
   });

   it('closes at once while a redial is waiting out its reconnect delay', async () => {
      const ssh = await startSSHServer(acceptPassword);
      const remotePort = await startEcho();
      const tunnel = await openTunnel(
         configFor(ssh, { password: PASSWORD, reconnectDelay: SLOW_RECONNECT }),
         { remoteAddr: HOST, remotePort }
      );

      assert.equal(await roundTrip(tunnel.localPort, 'before'), 'before');

      // Every redial is refused from here on, so the first one fails at once and the tunnel
      // settles into the delay before the next attempt — where the user clicks disconnect.
      ssh.refuseLinks = true;
      ssh.kill();
      await waitFor('a refused redial', () => ssh.connections > 1, SLOW_RECONNECT * 2);

      const started = Date.now();
      await tunnel.close();
      const took = Date.now() - started;

      assert.ok(took < 500, `close() took ${took}ms, expected < 500ms (it sat out the ${SLOW_RECONNECT}ms delay)`);
   });
});

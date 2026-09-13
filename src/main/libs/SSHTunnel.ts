import type { SSHConfig } from 'common/interfaces/antares';
import * as net from 'net';
import { Client, ClientChannel } from 'ssh2';

export interface SSHDestination {
   remoteAddr: string;
   remotePort: number;
}

const DEFAULT_RECONNECT_TRIES = 10;
const DEFAULT_RECONNECT_DELAY = 5000;

/** Retrying these only burns time: the credentials or the hostname are wrong, not the network. */
const isFinal = (err: NodeJS.ErrnoException & { level?: string }) =>
   err?.level === 'client-authentication' || err?.code === 'ENOTFOUND';

const ignore = (): void => undefined;

/**
 * A local TCP port forwarded to `remoteAddr:remotePort` over one SSH connection.
 *
 * The listener and the SSH link have separate lifetimes: the link is dialled once up front, is
 * re-dialled on its own when it drops, and every socket the listener accepts opens its own
 * direct-tcpip channel over whichever link is current. Only `close()` takes the listener down.
 */
export class SSHTunnel {
   private readonly config: SSHConfig;
   private readonly to: SSHDestination;
   private server: net.Server = null;
   private sockets = new Set<net.Socket>();
   private client: Client = null;
   private dialing: Client = null;
   private connecting: Promise<Client> = null;
   private retryTimer: NodeJS.Timeout = null;
   private closed = false;
   private port = 0;
   private wake: () => void = null;

   private constructor (config: SSHConfig, to: SSHDestination) {
      this.config = config;
      this.to = to;
   }

   static async open (config: SSHConfig, to: SSHDestination): Promise<SSHTunnel> {
      const tunnel = new SSHTunnel(config, to);

      try {
         await tunnel.link();
         await tunnel.listen();
      }
      catch (err) {
         await tunnel.close();
         throw err;
      }

      return tunnel;
   }

   get localPort (): number {
      return this.port;
   }

   async close (): Promise<void> {
      this.closed = true;
      clearTimeout(this.retryTimer);
      this.retryTimer = null;

      for (const socket of this.sockets) socket.destroy();
      this.sockets.clear();

      if (this.server?.listening)
         await new Promise<void>(resolve => this.server.close(() => resolve()));
      this.server = null;

      // A dial in flight has to be settled here, not left running: it would otherwise hand back a
      // client nobody ends, and pin close() for the retry delay or ssh2's 20s readyTimeout.
      this.dialing?.destroy();
      this.wake?.();
      await this.connecting?.then(ignore, ignore);

      this.client?.end();
      this.client = null;
   }

   private listen (): Promise<void> {
      return new Promise<void>((resolve, reject) => {
         // 127.0.0.1, not every interface: the forwarded port is unauthenticated.
         const server = net.createServer(socket => this.forward(socket));

         server.once('error', reject);
         server.listen(0, '127.0.0.1', () => {
            server.removeListener('error', reject);
            server.on('error', ignore);
            this.server = server;
            this.port = (server.address() as net.AddressInfo).port;
            resolve();
         });
      });
   }

   private forward (socket: net.Socket): void {
      this.sockets.add(socket);
      // Without this listener a client's RST arrives as an uncaught ECONNRESET and takes the
      // whole main process with it.
      socket.on('error', () => socket.destroy());
      socket.on('close', () => this.sockets.delete(socket));

      // catch(), not a second then() argument: forwardOut throws 'Not connected' synchronously
      // once the link is dead, and then() cannot catch a throw from its own first argument.
      this.link().then(client => {
         client.forwardOut('', 0, this.to.remoteAddr, this.to.remotePort, (err, stream) => {
            if (err) return socket.destroy();
            this.pipe(socket, stream);
         });
      }).catch(() => socket.destroy());
   }

   private pipe (socket: net.Socket, stream: ClientChannel): void {
      stream.on('error', () => socket.destroy());
      stream.once('close', () => socket.destroy());
      socket.once('close', () => stream.end());
      stream.pipe(socket).pipe(stream);
   }

   private link (): Promise<Client> {
      if (this.client) return Promise.resolve(this.client);
      if (!this.connecting) {
         this.connecting = this.dial().finally(() => {
            this.connecting = null;
         });
      }
      return this.connecting;
   }

   private async dial (): Promise<Client> {
      const delay = this.config.reconnectDelay ?? DEFAULT_RECONNECT_DELAY;
      const attempts = this.config.reconnect === false
         ? 1
         : (this.config.reconnectTries ?? DEFAULT_RECONNECT_TRIES) + 1;
      let last: Error;

      for (let attempt = 0; attempt < attempts; attempt++) {
         if (attempt > 0) await this.sleep(delay);
         if (this.closed) throw last ?? new Error('SSH tunnel closed');

         try {
            return await this.connectOnce();
         }
         catch (err) {
            if (isFinal(err)) throw err;
            last = err;
         }
      }

      throw last;
   }

   /**
    * Interruptible, so a pending retry never pins close(): it wakes a sleep already running, and
    * the closed check covers one that has not started yet.
    */
   private sleep (ms: number): Promise<void> {
      if (this.closed) return Promise.resolve();

      return new Promise<void>(resolve => {
         const done = () => {
            this.wake = null;
            resolve();
         };

         const timer = setTimeout(done, ms);
         this.wake = () => {
            clearTimeout(timer);
            done();
         };
      });
   }

   private connectOnce (): Promise<Client> {
      return new Promise<Client>((resolve, reject) => {
         const client = new Client();
         let settled = false;

         const fail = (err: Error) => {
            if (settled) return;
            settled = true;
            this.dialing = null;
            client.destroy();
            reject(err);
         };

         this.dialing = client;

         client.on('error', fail);
         // A link that dies before it is ready emits no error of its own on every path.
         client.once('close', () => fail(new Error('SSH connection closed before it was ready')));
         client.once('ready', () => {
            settled = true;
            this.dialing = null;
            client.removeListener('error', fail);
            client.on('error', ignore);
            client.on('close', () => this.dropped(client));
            this.client = client;
            resolve(client);
         });

         client.connect({
            host: this.config.host,
            port: this.config.port,
            username: this.config.username,
            password: this.config.password,
            privateKey: this.config.privateKey,
            passphrase: this.config.passphrase,
            keepaliveInterval: this.config.keepaliveInterval
         });
      });
   }

   private dropped (client: Client): void {
      if (this.client !== client) return;
      this.client = null;
      if (this.closed || this.config.reconnect === false) return;

      this.retryTimer = setTimeout(() => {
         this.retryTimer = null;
         this.link().then(ignore, ignore);
      }, this.config.reconnectDelay ?? DEFAULT_RECONNECT_DELAY);
   }
}

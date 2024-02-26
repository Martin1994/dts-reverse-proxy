import Koa = require("koa");
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createSecureServer } from "node:http2";
import { userInfo } from "node:os";
import { SecureContext, createSecureContext } from "node:tls";
import { domainRouter } from "./middlewares/domainRouterMiddleware";
import { phpFpm } from "./middlewares/phpFpmMiddleware";
import { serverTiming } from "./middlewares/serverTimingMiddleware";
import { PHP_CONFIG } from "./phpConfig";

async function main() {
    const app = new Koa();

    const isRoot = userInfo().uid === 0;
    const httpPort = isRoot ? 80 : 8080;
    const httpsPort = isRoot ? 443 : 8443;

    const TLS_DOMAINS = isRoot ? ["thbr.martincl2.me", "dts.martincl2.me", "001.dianbo.me"] : [];

    app.use(serverTiming());

    app.use(domainRouter({
        "thbr.martincl2.me": phpFpm({ ...PHP_CONFIG, documentRoot: "/var/www/thbr" }),
        "dts.martincl2.me": phpFpm({ ...PHP_CONFIG, documentRoot: "/var/www/dts" }),
        "001.dianbo.me": phpFpm({ ...PHP_CONFIG, documentRoot: "/var/www/dts" }),
        "127.0.0.1": phpFpm({ ...PHP_CONFIG, documentRoot: "/var/www/dts" }),
        "localhost": phpFpm({ ...PHP_CONFIG, documentRoot: "/var/www/dts" }),
    }, TLS_DOMAINS));

    // HTTP server

    const appCallback = app.callback();

    const SECURE_CONTEXTS: Record<string, SecureContext | undefined> = Object.fromEntries(await Promise.all(TLS_DOMAINS.map(async (domain) => {
        const cert = await readFile(`/etc/letsencrypt/live/${domain}/fullchain.pem`, "utf-8");
        const key = await readFile(`/etc/letsencrypt/live/${domain}/privkey.pem`, "utf-8");
        return [domain, createSecureContext({ cert, key })];
    })));

    const tlsServer = createSecureServer({
        SNICallback: (domain, cb) => cb(null, SECURE_CONTEXTS[domain]),
        allowHTTP1: true
    }, appCallback);

    const plainServer = createServer(appCallback);

    plainServer.listen(httpPort, "::", () => {
        console.log(`Started HTTP server at http://[::]:${httpPort}.`);
    });

    tlsServer.listen(httpsPort, "::", () => {
        console.log(`Started HTTP/2 server at https://[::]:${httpsPort}.`);
    });

    plainServer.listen(httpPort, "0.0.0.0", () => {
        console.log(`Started HTTP server at http://0.0.0.0:${httpPort}.`);
    });

    tlsServer.listen(httpsPort, "0.0.0.0", () => {
        console.log(`Started HTTP/2 server at https://0.0.0.0:${httpsPort}.`);
    });
}

main();

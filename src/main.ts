import Koa = require("koa");
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createSecureServer } from "node:http2";
import { userInfo } from "node:os";
import { SecureContext, createSecureContext } from "node:tls";
import { domainRouter } from "./middlewares/domainRouterMiddleware";
import { serverTimingCloudWatchMetric } from "./middlewares/headerCloudWatchMetricMiddleware";
import { phpFpm, rewrite404, rewriteAbsolute } from "./middlewares/phpFpmMiddleware";
import { redirectHostname } from "./middlewares/redirectHostnameMiddleware";
import { redirectTls } from "./middlewares/redirectTlsMiddleware";
import { totalServerTiming } from "./middlewares/serverTimingMiddleware";
import { PHP_CONFIG } from "./phpConfig";

async function main() {
    const app = new Koa();

    const isRoot = userInfo().uid === 0;
    const httpPort = isRoot ? 80 : 8080;
    const httpsPort = isRoot ? 443 : 8443;

    const TLS_DOMAINS = isRoot ? ["thbr.martincl2.me", "brn.martincl2.me", "dts.martincl2.me", "001.dianbo.me", "002.dianbo.me", "blog.martincl2.me", "martincl2.me"] : [];

    if (isRoot) {
        app.use(serverTimingCloudWatchMetric([
            "thbr.martincl2.me",
            "brn.martincl2.me",
            "001.dianbo.me",
            "002.dianbo.me",
            "blog.martincl2.me"
        ]));
    }

    app.use(totalServerTiming());

    app.use(redirectTls(TLS_DOMAINS))

    const dtsPhp = phpFpm({ ...PHP_CONFIG, documentRoot: "/var/www/dts" });
    app.use(domainRouter({
        "thbr.martincl2.me": phpFpm({ ...PHP_CONFIG, documentRoot: "/var/www/thbr" }, rewrite404("404.php")),
        "brn.martincl2.me": phpFpm({ ...PHP_CONFIG, documentRoot: "/var/www/brn" }, rewrite404("404.php")),
        "dts.martincl2.me": redirectHostname("001.dianbo.me"),
        "001.dianbo.me": dtsPhp,
        "127.0.1.1": dtsPhp, // DTS loopback
        "002.dianbo.me": phpFpm({ ...PHP_CONFIG, documentRoot: "/var/www/jouban" }),
        "blog.martincl2.me": phpFpm({ ...PHP_CONFIG, documentRoot: "/var/www/martin-blog" }, rewriteAbsolute("index.php")),
        "martincl2.me": redirectHostname("blog.martincl2.me"),
    }, ));

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

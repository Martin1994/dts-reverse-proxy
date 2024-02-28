import { Middleware } from "koa";
import serve = require("koa-static");

const defaultStatic = serve("/var/www/html");

export const domainRouter: (routes: Record<string, Middleware>, tlsRedirectDomains?: string[]) => Middleware = (routes, tlsRedirectDomains) => {
    tlsRedirectDomains ??= [];
    const redirectTls = Object.fromEntries(tlsRedirectDomains.map(d => [d, true]));

    return async (ctx, next) => {
        if (!ctx.secure && ctx.method === "GET" && redirectTls[ctx.hostname]) {
            ctx.URL.protocol = "https";
            ctx.redirect(ctx.URL.toString());
            return;
        }

        const target = routes[ctx.hostname];

        if (!target) {
            await defaultStatic(ctx, next);
            return;
        }

        await target(ctx, next);
    };
}

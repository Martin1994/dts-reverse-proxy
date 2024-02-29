import { Middleware } from "koa";
import serve = require("koa-static");

const defaultStatic = serve("/var/www/html");

export const domainRouter: (routes: Record<string, Middleware>) => Middleware = routes => {
    return async (ctx, next) => {
        const target = routes[ctx.hostname];

        if (!target) {
            await defaultStatic(ctx, next);
            return;
        }

        await target(ctx, next);
    };
}

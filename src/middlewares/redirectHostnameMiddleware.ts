import { Middleware } from "koa";

export const redirectHostname: (hostname: string) => Middleware = hostname => {
    return async (ctx, next) => {
        ctx.URL.hostname = hostname;
        ctx.redirect(ctx.URL.toString());
    }
}

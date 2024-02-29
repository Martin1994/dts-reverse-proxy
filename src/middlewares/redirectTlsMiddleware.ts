import { Middleware } from "koa";

export const redirectTls: (tlsRedirectDomains: string[]) => Middleware = tlsRedirectDomains => {
    const redirectTls = Object.fromEntries(tlsRedirectDomains.map(d => [d, true]));
    return async (ctx, next) => {
        if (!ctx.secure && ctx.method === "GET" && redirectTls[ctx.hostname]) {
            ctx.URL.protocol = "https:";
            ctx.redirect(ctx.URL.toString());
            return;
        }
        await next();
    }
}

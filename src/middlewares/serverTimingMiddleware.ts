import Koa = require("koa");

export const serverTiming: () => Koa.Middleware = () => {
    return async (ctx, next) => {
        const start = performance.now();
        await next();
        const duration = performance.now() - start;
        ctx.response.append("Server-Timing", `total;dur=${duration.toFixed(1)}`);
    };
}

import { Middleware } from "koa";

export const totalServerTiming: () => Middleware = () => {
    return async (ctx, next) => {
        const start = performance.now();
        await next();
        const duration = performance.now() - start;
        ctx.response.append("Server-Timing", `total;dur=${duration.toFixed(1)}`);
    };
}

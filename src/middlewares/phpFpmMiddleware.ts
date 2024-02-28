import { Context, Middleware } from "koa";
import { access, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PhpFpmInvocationParams, phpFpm as rawPhpFpm } from "../php-fpm";
import serve = require("koa-static");

const LOG_SPLITTER = "----------------";

export const phpFpm: (...args: Parameters<typeof rawPhpFpm>) => Middleware = (userOptions) => {
    const root = userOptions?.documentRoot ?? process.cwd();
    userOptions ??= {
        documentRoot: root
    };
    const php = rawPhpFpm(userOptions);
    const safePhp = async (ctx: Context, params?: PhpFpmInvocationParams): Promise<void> => {
        try {
            ctx.status = 200;
            await php(ctx, err => {
                console.warn(`[${new Date().toISOString()}] Got PHP error from ${ctx.url}`);
                console.warn(err);
                console.warn(LOG_SPLITTER);
            }, params);
        } catch (e) {
            console.error(`[${new Date().toISOString()}] Got PHP FPM error from ${ctx.url}`);
            console.error(e);
            console.error(LOG_SPLITTER);
            ctx.status = 500;
            ctx.body = "Internal server error";
        }
    }
    const statics = serve(userOptions?.documentRoot ?? process.cwd());

    return async (ctx, next) => {
        const path = join(root, ctx.path);
        let targetStat;
        try {
            targetStat = await stat(path);
        } catch {
            await next(); // 404
            return;
        }

        if (targetStat.isDirectory()) {
            try {
                if (!ctx.URL.pathname.endsWith("/")) {
                    ctx.redirect(ctx.URL.pathname + "/");
                    return;
                }
                const candidateIndexScript = join(path, "index.php");
                await access(candidateIndexScript);
                await safePhp(ctx, {
                    script: candidateIndexScript
                });
                return;
            } catch {
            }
        } else if (ctx.path.endsWith(".php")) {
            await safePhp(ctx);
            return;
        }

        await statics(ctx, next);

        if (ctx.status === 404) {
            try {
                const candidate404Script = join(dirname(path), "404.php");
                await access(candidate404Script);
                await safePhp(ctx, { script: candidate404Script });
                ctx.status = 404;
                return;
            } catch {
            }
        }

    };
};

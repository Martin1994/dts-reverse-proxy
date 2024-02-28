import { Middleware } from "koa";
import { access, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { phpFpm as rawPhpFpm } from "../php-fpm";
import serve = require("koa-static");

const LOG_SPLITTER = "----------------";

export const phpFpm: (...args: Parameters<typeof rawPhpFpm>) => Middleware = (userOptions) => {
    const root = userOptions?.documentRoot ?? process.cwd();
    userOptions ??= {
        documentRoot: root
    };
    const php = rawPhpFpm(userOptions);
    const statics = serve(userOptions?.documentRoot ?? process.cwd());

    return async (ctx, next) => {
        const path = join(root, ctx.path);
        if (ctx.path.endsWith(".php")) {
            let shouldPhp = true;
            try {
                await access(path);
            } catch {
                shouldPhp = false;
            }

            if (shouldPhp) {
                try {
                    ctx.status = 200;
                    await php(ctx, err => {
                        console.warn(`[${new Date().toISOString()}] Got PHP error from ${ctx.url}`);
                        console.warn(err);
                        console.warn(LOG_SPLITTER);
                    });
                } catch (e) {
                    console.error(`[${new Date().toISOString()}] Got PHP FPM error from ${ctx.url}`);
                    console.error(e);
                    console.error(LOG_SPLITTER);
                    ctx.status = 500;
                    ctx.body = "Internal server error";
                }
                return;
            }
        }

        await statics(ctx, next);

        if (ctx.status === 404) {
            try {
                const s = await stat(path);
                if (s.isDirectory()) {
                    if (!ctx.URL.pathname.endsWith("/")) {
                        ctx.redirect(ctx.URL.pathname + "/");
                        return;
                    }
                    await access(join(path, "index.php"));
                    ctx.redirect("./index.php");
                    return;
                }
            } catch {
            }

            try {
                const candidate404Script = join(dirname(path), "404.php");
                await access(candidate404Script);
                await php(ctx, err => {
                    console.warn(`[${new Date().toISOString()}] Got PHP error from ${ctx.url} (404)`);
                    console.warn(err);
                    console.warn(LOG_SPLITTER);
                }, { script: candidate404Script });
                ctx.status = 404;
                return;
            } catch {
            }
        }

    };
};

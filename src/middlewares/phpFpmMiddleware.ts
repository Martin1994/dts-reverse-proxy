import Koa = require("koa");
import serve = require("koa-static");
import { phpFpm as rawPhpFpm } from "../php-fpm";
import { access, stat } from "node:fs/promises";
import { join } from "node:path";

export const phpFpm: (...args: Parameters<typeof rawPhpFpm>) => Koa.Middleware = (userOptions, customParameters) => {
    const root = userOptions?.documentRoot ?? process.cwd();
    userOptions ??= {
        documentRoot: root
    };
    const php = rawPhpFpm(userOptions, customParameters);
    const statics = serve(userOptions?.documentRoot ?? process.cwd());

    return async (ctx, next) => {
        const path = join(root, ctx.path);
        if (ctx.path.endsWith(".php")) {
            try {
                await access(path);
            } catch {
                await statics(ctx, next);
                return;
            }

            try {
                ctx.status = 200;
                await php(ctx, err => {
                    console.warn(`[${new Date().toISOString()}] Got PHP error from ${ctx.url}`);
                    console.warn(err);
                    console.warn("----------------");
                });
            } catch (e) {
                console.error(`[${new Date().toISOString()}] Got PHP FPM error from ${ctx.url}`);
                console.error(e);
                console.error("----------------");
                ctx.status = 500;
                ctx.body = "Internal server error";
                return;
            }
            return;
        }

        await statics(ctx, next);

        if (ctx.status === 404) {
            try {
                const s = await stat(path);
                if (s.isDirectory()) {
                    await access(join(path, "index.php"));
                    ctx.redirect("index.php")
                    return;
                }
            } catch {
            }
        }

    };
};

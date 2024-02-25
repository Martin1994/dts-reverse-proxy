import Koa = require("koa");
import serve = require("koa-static");
import rawPhpFpm = require("php-fpm");
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
                await php(ctx.req, new PhpResponseProxy(ctx) as never);
            } catch (e) {
                console.error(`Got error from ${ctx.url}`);
                console.error(e);
                console.error("----------------");
                ctx.res.statusCode = 500;
                ctx.res.write("Internal server error\n");
                ctx.res.end(`${e}`);
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

class PhpResponseProxy {
    readonly #ctx: Koa.ParameterizedContext;

    public constructor(ctx: Koa.ParameterizedContext) {
        this.#ctx = ctx;
    }

    public setHeader(name: string, value: string) {
        this.#ctx.response.append(name, value);
    }

    public set statusCode(value: number) {
        this.#ctx.response.status = value;
    }

    public write(content: string) {
        this.#ctx.response.body = content; // node-php-fpm always only write once
    }

    public end() {
    }
}

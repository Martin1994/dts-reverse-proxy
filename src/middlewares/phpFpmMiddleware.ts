import { Context, Middleware } from "koa";
import { access, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PhpFpmInvocationParams, PhpFpmOptions, phpFpm as rawPhpFpm } from "../php-fpm";
import serve = require("koa-static");

const LOG_SPLITTER = "----------------";

export type PhpRewriteLogic = (ctx: Context, php: PhpInvoker, root: string) => Promise<void>;
type PhpInvoker = (ctx: Context, params?: PhpFpmInvocationParams) => Promise<void>;

export const phpFpm: (phpOptions: PhpFpmOptions, rewrite?: PhpRewriteLogic) => Middleware = (phpOptions, rewrite) => {
    const root = phpOptions?.documentRoot ?? process.cwd();
    phpOptions ??= {
        documentRoot: root
    };
    const php = rawPhpFpm(phpOptions);
    const safePhp: PhpInvoker = async (ctx: Context, params?: PhpFpmInvocationParams): Promise<void> => {
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
    const statics = serve(phpOptions?.documentRoot ?? process.cwd());

    return async (ctx, next) => {
        const path = join(root, ctx.path);
        let targetStat;
        try {
            targetStat = await stat(path);
        } catch {
        }

        if (targetStat && targetStat.isDirectory()) {
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
        } else if (targetStat && ctx.path.endsWith(".php")) {
            await safePhp(ctx);
            return;
        }

        if (targetStat) {
            await statics(ctx, next);
            return;
        }

        // 404
        if (rewrite) {
            await rewrite(ctx, safePhp, root);
        }

    };
};

export function rewrite404(filename: string): PhpRewriteLogic {
    return async (ctx, php, root) => {
        const path = join(root, ctx.path);
        try {
            const candidate404Script = join(dirname(path), filename);
            await access(candidate404Script);
            await php(ctx, { script: candidate404Script });
            ctx.status = 404;
            return;
        } catch {
        }
    }
}

export function rewriteAbsolute(filename: string): PhpRewriteLogic {
    return async (ctx, php, root) => {
        await php(ctx, {
            script: join(root, filename),
            document: `/${filename}${ctx.url}`
        });
    }
}

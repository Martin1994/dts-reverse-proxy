/**
 * Forked from https://github.com/ivanfilhoz/node-php-fpm
 *
 * Original license:
 *     MIT License
 *     Copyright (c) 2017 Ivan Filho - https://www.ivanfilho.com/
 */

import Koa = require("koa");
import path = require("node:path");
import fastCgi = require("fastcgi-client");
import { Readable } from "node:stream";
import { FpmStreamReader } from "./fpmStreamReader";

export interface PhpFpmOptions {
    readonly host?: string;
    readonly port?: number;
    readonly sockFile?: string;
    readonly documentRoot?: string;
    readonly skipCheckServer?: boolean;
}

export interface PhpFpmInvocationParams {
    readonly uri?: string;
    readonly document?: string;
    readonly query?: string;
    readonly script?: string;
}

const defaultOptions: PhpFpmOptions = {
    host: "127.0.0.1",
    port: 9000,
    documentRoot: path.dirname(require.main?.filename || "."),
    skipCheckServer: true
}

type Writable<T> = { -readonly [P in keyof T ]: T[P] };

export function phpFpm(userOptions?: PhpFpmOptions): (ctx: Koa.Context, onError: (err: string) => void, customParams?: PhpFpmInvocationParams) => Promise<void> {
    const options: PhpFpmOptions = {
        ...defaultOptions,
        ...userOptions
    };

    const fpm = new Promise<fastCgi.FastCgiClient>((resolve, reject) => {
        const loader = fastCgi(options);
        loader.on("ready", () => resolve(loader));
        loader.on("error", reject);
    })

    return async function (ctx, onError, customParams): Promise<void> {
        const req = ctx.req;

        const params: Writable<PhpFpmInvocationParams> = {
            ...customParams,
            uri: req.url
        };

        if (!params.uri || !params.uri.startsWith("/")) {
            throw new Error("invalid uri")
        }

        // if (options.rewrite) {
        //     const rules = Array.isArray(options.rewrite)
        //         ? options.rewrite : [options.rewrite]
        //     for (const rule of rules) {
        //         const match = params.uri.match(rule.search || /.*/)
        //         if (match) {
        //             let result = rule.replace
        //             for (const index in match) {
        //                 const selector = new RegExp(`\\$${index}`, "g")
        //                 result = result.replace(selector, match[index])
        //             }
        //             params.outerUri = params.uri
        //             params.uri = result
        //             break
        //         }
        //     }
        // }

        if (params.uri.indexOf("?") !== -1) {
            params.document = params.uri.split("?")[0]
            params.query = params.uri
                .slice(params.document.length + 1)
                .replace(/\?/g, "&")
        }

        if (!params.script) {
            params.script = path.posix.join(options.documentRoot!, params.document || params.uri)
        }

        const headers: Record<string, string | string[] | number | undefined> = {
            REQUEST_METHOD: req.method,
            CONTENT_TYPE: req.headers["content-type"],
            CONTENT_LENGTH: req.headers["content-length"],
            CONTENT_DISPOSITION: req.headers["content-disposition"],
            DOCUMENT_ROOT: options.documentRoot,
            SCRIPT_FILENAME: params.script,
            SCRIPT_NAME: params.script.split("/").pop(),
            REQUEST_URI: params.uri,
            DOCUMENT_URI: params.document || params.uri,
            QUERY_STRING: params.query,
            REQUEST_SCHEME: (req as never)["protocol"],
            HTTPS: (req as never)["protocol"] === "https" ? "on" : undefined,
            REMOTE_ADDR: req.socket.remoteAddress,
            REMOTE_PORT: req.socket.remotePort,
            SERVER_NAME: req.headers.host,
            SERVER_PROTOCOL: "HTTP/1.1",
            GATEWAY_INTERFACE: "CGI/1.1",
            SERVER_SOFTWARE: "php-fpm for Node",
            REDIRECT_STATUS: 200
        }

        for (const header of Object.keys(headers)) {
            if (headers[header] === undefined) { delete headers[header] }
        }

        for (const header of Object.keys(req.headers)) {
            headers["HTTP_" + header.toUpperCase().replace(/-/g, "_")] = req.headers[header];
        }

        const php = await fpm;
        return new Promise(function (resolve, reject) {
            php.request(headers, async function (err, request) {
                if (err) {
                    return reject(err);
                }

                req.pipe(request.stdin);

                void readStdErr(request.stderr, onError);
                await readStdOut(request.stdout, ctx);

                resolve();
            })
        })
    }
}

async function readStdOut(stdout: Readable, ctx: Koa.Context): Promise<void> {
    const reader = new FpmStreamReader(stdout);
    for await (const header of reader.readHeaders()) {
        ctx.response.append(header[0], header[1]);

        if (header[0] === "Status") {
            const match = header[1].match(/(\d+) (.*)/);
            if (match) {
                ctx.status = parseInt(match[1]);
                if (ctx.req.httpVersionMajor < 2) {
                    ctx.message = match[2];
                }
            }
        }
    }

    ctx.body = reader;
}

async function readStdErr(stderr: Readable, onError: (error: string) => void): Promise<void> {
    const chunks = [];

    stderr.setEncoding("utf-8");
    for await (const chunk of stderr) {
        chunks.push(Buffer.from(chunk));
    }

    if (chunks.length === 0) {
        return;
    }

    const err = chunks.join("");

    if (err.length === 0) {
        return;
    }

    onError(err);
}

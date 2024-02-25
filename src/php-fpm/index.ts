/**
 * Forked from https://github.com/ivanfilhoz/node-php-fpm
 *
 * Original license:
 *     MIT License
 *     Copyright (c) 2017 Ivan Filho - https://www.ivanfilho.com/
 */

import path = require("node:path");
import fastCgi = require("fastcgi-client");
import { IncomingMessage, ServerResponse } from "node:http";

export interface PhpFpmUserOptions {
    readonly host?: string;
    readonly port?: number;
    readonly sockFile?: string;
    readonly documentRoot?: string;
    readonly skipCheckServer?: boolean;
}

export interface PhpFpmCustomParams {
    readonly uri?: string;
    readonly document?: string;
    readonly query?: string;
    readonly script?: string;
}

interface PhpFpmFullParams extends PhpFpmCustomParams {
    document?: string;
    query?: string;
    script?: string;
}

const defaultOptions: PhpFpmUserOptions = {
    host: "127.0.0.1",
    port: 9000,
    documentRoot: path.dirname(require.main?.filename || "."),
    skipCheckServer: true
}

export function phpFpm(userOptions?: PhpFpmUserOptions, customParams?: PhpFpmCustomParams): (req: IncomingMessage, res: ServerResponse<IncomingMessage>) => Promise<void> {
    const options: PhpFpmUserOptions = {
        ...defaultOptions,
        ...userOptions
    };

    const fpm = new Promise<fastCgi.FastCgiClient>((resolve, reject) => {
        const loader = fastCgi(options);
        loader.on("ready", () => resolve(loader));
        loader.on("error", reject);
    })

    return async function (req, res) {
        let params: PhpFpmFullParams = {
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
            php.request(headers, function (err, request) {
                if (err) { return reject(err) }
                var output = "";
                var errors = "";

                req.pipe(request.stdin);

                request.stdout.on("data", function (data: Buffer) {
                    output += data.toString("utf8");
                })

                request.stderr.on("data", function (data: Buffer) {
                    errors += data.toString("utf8");
                })

                request.stdout.on("end", function () {
                    if (errors) { return reject(new Error(errors)) }

                    const head = output.match(/^[\s\S]*?\r\n\r\n/)![0]
                    const parseHead = head.split("\r\n").filter(_ => _)
                    const responseHeaders: Record<string, string | string[]> = {}
                    let statusCode = 200
                    let statusMessage = ""

                    for (const item of parseHead) {
                        const pair = item.split(": ")

                        if (pair.length > 1 && pair[0] && pair[1]) {
                            if (Array.isArray(responseHeaders[pair[0]])) {
                                (responseHeaders[pair[0]] as string[]).push(pair[1]);
                            } else {
                                responseHeaders[pair[0]] = [pair[1]];
                            }

                            if (pair[0] === "Status") {
                                const match = pair[1].match(/(\d+) (.*)/);
                                statusCode = parseInt(match![1]);
                                statusMessage = match![2];
                            }
                        }
                    }

                    res.writeHead(statusCode, statusMessage, responseHeaders);
                    const body = output.slice(head.length);
                    res.write(body);
                    res.end();

                    resolve();
                })
            })
        })
    }
}

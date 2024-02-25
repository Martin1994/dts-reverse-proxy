declare module "fastcgi-client" {

    import { EventEmitter } from "node:events";
    import { Readable, Writable } from "node:stream";

    export interface FastCgiOptions {
        readonly host?: string;
        readonly port?: number;
        readonly sockFile?: string;
        readonly documentRoot?: string;
        readonly skipCheckServer?: boolean;
    }

    export interface FastCgiRequest {
        readonly stdin: Writable;
        readonly stdout: Readable;
        readonly stderr: Readable;
    }

    export interface FastCgiClient extends EventEmitter {
        request(params: Record<string, unknown>, cb: (err: Error | null, request: FastCgiRequest) => void): void;
    }

    declare const fastCgi: (options: FastCgiOptions) => FastCgiClient;

    export = fastCgi;
}

declare module "php-fpm" {
    import { IncomingMessage, ServerResponse } from "node:http";

    export interface PhpFpmUserOptions {
        readonly host?: string;
        readonly port?: number;
        readonly sockFile?: string;
        readonly documentRoot?: string;
        readonly skipCheckServer?: boolean;
    }

    export interface PhpFpmCustomParams {
        readonly uri: string;
        readonly document: string;
        readonly query: string;
        readonly script: string;
    }

    declare const phpFpm: (userOptions?: PhpFpmUserOptions, customParams?: PhpFpmCustomParams) => (req: IncomingMessage, res: ServerResponse<IncomingMessage>) => Promise<void>;

    export = phpFpm;
}

import { Readable } from "node:stream";

const enum HeaderState {
    ANY,
    CR
}

export class FpmStreamReader extends Readable {

    readonly #stdout: AsyncIterator<string>;

    constructor (stdout: Readable) {
        super();
        stdout.setEncoding("utf-8");
        this.#stdout = stdout[Symbol.asyncIterator]();
    }

    public async *readHeaders(): AsyncIterable<[string, string]> {
        let state: HeaderState = HeaderState.ANY;
        let chunks: string[] = [];

        while (true) {
            const result = await this.#stdout.next();
            if (result.done) {
                this.push(null);
                return;
            }

            const value = result.value;
            let cutStart = 0;

            if (state === HeaderState.CR && value.length > 0 && value.charAt(0) === "\n") {
                chunks.push("\n");
                const header = makeHeader(chunks);
                if (!header) {
                    this.push(value.substring(1));
                    return;
                }
                yield header;
                chunks = [];
                cutStart = 1;
            }

            for (let i = value.indexOf("\r"); i !== -1; i = value.indexOf("\r", i + 1)) {
                if (value.charAt(i + 1) === "\n") {
                    chunks.push(value.substring(cutStart, i + 2));
                    const header = makeHeader(chunks);
                    if (!header) {
                        this.push(value.substring(cutStart));
                        return;
                    }
                    yield header;
                    chunks = [];
                    cutStart = i + 2;
                }
            }

            state = value.charAt(value.length - 1) === "\r" ? HeaderState.CR : HeaderState.ANY;
        }
    }

    public override async _read(_size: number): Promise<void> {
        const result = await this.#stdout.next();
        if (result.done) {
            this.push(null);
            return;
        }

        this.push(result.value);
    }
}

function makeHeader(chunks: string[]): [string, string] | undefined {
    const line = chunks.length === 1 ? chunks[0] : chunks.join("");
    if (line === "\r\n") {
        return undefined;
    }
    const components = line.split(": ");
    return [components[0], components[1].slice(0, -2)];
}

import { Readable } from "node:stream";

const enum HeaderState {
    ANY,
    CR
}

const CR = "\r".charCodeAt(0);
const LF = "\n".charCodeAt(0);

export class FpmStreamReader extends Readable {

    readonly #stdout: AsyncIterator<Buffer>;

    constructor (stdout: Readable) {
        super();
        this.#stdout = stdout[Symbol.asyncIterator]();
    }

    public async *readHeaders(): AsyncIterable<[string, string]> {
        let state: HeaderState = HeaderState.ANY;
        let chunks: Buffer[] = [];

        while (true) {
            const result = await this.#stdout.next();
            if (result.done) {
                this.push(null);
                return;
            }

            const value = result.value;
            let cutStart = 0;

            if (state === HeaderState.CR && value.length > 0 && value[0] === LF) {
                chunks.push(value.subarray(0, 1));
                const header = makeHeader(chunks);
                cutStart = 1;
                if (!header) {
                    this.push(value.subarray(cutStart));
                    return;
                }
                yield header;
                chunks = [];
            }

            for (let i = value.indexOf(CR); i !== -1; i = value.indexOf(CR, i + 1)) {
                if (value[i + 1] === LF) {
                    chunks.push(value.subarray(cutStart, i + 2));
                    const header = makeHeader(chunks);
                    cutStart = i + 2;
                    if (!header) {
                        this.push(value.subarray(cutStart));
                        return;
                    }
                    yield header;
                    chunks = [];
                }
            }

            state = value[value.length - 1] === CR ? HeaderState.CR : HeaderState.ANY;
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

function makeHeader(chunks: Buffer[]): [string, string] | undefined {
    const line = Buffer.concat(chunks).toString("utf-8");
    if (line === "\r\n") {
        return undefined;
    }
    const components = line.split(": ");
    return [components[0], components[1].slice(0, -2)];
}

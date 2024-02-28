import { CloudWatchClient, Dimension, MetricDatum, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { Middleware } from "koa";
import { setTimeout } from "node:timers/promises";

export const serverTimingCloudWatchMetric: (domains: (string | [string, string])[]) => Middleware = (domains) => {
    const agent = new CloudWatchAgent(new CloudWatchClient({
        region: "ap-east-1"
    }), "DTS");

    const domainList = Object.fromEntries(domains.map(d => Array.isArray(d) ? d : [d, d]));

    return async (ctx, next) => {
        await next();

        const domain = domainList[ctx.hostname];
        if (!domain) {
            return;
        }

        const header = ctx.response.header["server-timing"];
        if (!header) {
            return;
        }

        const headers = Array.isArray(header) ? header : [header];
        for (const entry of headers.flatMap(h => h.toString().split(/, ?/))) {
            const tuple = entry.split(";");
            const name = tuple[0];
            for (const section of tuple) {
                if (section.startsWith("dur=")) {
                    const duration = parseFloat(section.substring(4));
                    agent.addMetric(`ServerTiming|Domain|${domain}|Type|${name}`, duration);
                }
            }
        }
    };
}

const PT1M = 60_000;
const METRIC_DATA_SIZE = 150;

class CloudWatchAgent {
    readonly #cloudwatch: CloudWatchClient;
    readonly #namespace: string;
    readonly #buckets: Map<string, number[]> = new Map();

    public constructor(cloudwatch: CloudWatchClient, namespace: string) {
        this.#cloudwatch = cloudwatch;
        this.#namespace = namespace;
        void this.#run();
    }

    public addMetric(id: string, value: number): void {
        this.#getBucket(id).push(value);
    }

    #getBucket(id: string): number[] {
        const attempt = this.#buckets.get(id);
        if (attempt) {
            return attempt;
        }

        const newBucket: number[] = [];
        this.#buckets.set(id, newBucket);
        return newBucket;
    }

    async #run(): Promise<void> {
        while (true) {
            const now = Date.now();
            const wait = PT1M - now % PT1M;
            const emitTime = now + wait;
            await setTimeout(wait);

            const metricData: MetricDatum[] = [];
            const ids = this.#buckets.keys();
            for (const id of ids) {
                const bucket = this.#buckets.get(id);
                if (!bucket || bucket.length === 0) {
                    continue;
                }

                const components = id.split("|");
                const metricName = components[0];
                const dimensions: Dimension[] = [];
                for (let i = 1; i < components.length; i += 2) {
                    dimensions.push({
                        Name: components[i],
                        Value: components[i + 1]
                    });
                }
                for (let i = 0; i < bucket.length; i += METRIC_DATA_SIZE) {
                    metricData.push({
                        MetricName: metricName,
                        Dimensions: dimensions,
                        Values: bucket.slice(i, Math.min(i + METRIC_DATA_SIZE, bucket.length)),
                        Unit: "Milliseconds",
                        Timestamp: new Date(emitTime)
                    });
                }

                this.#buckets.set(id, []);
            }

            try {
                await this.#cloudwatch.send(new PutMetricDataCommand({
                    Namespace: this.#namespace,
                    MetricData: metricData
                }));
            } catch (ex) {
                console.error("Failed to emit CloudWatch metrics.", ex);
            }
        }
    }
}

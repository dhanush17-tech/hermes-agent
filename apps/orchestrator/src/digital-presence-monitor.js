import { setTimeout as delay } from "node:timers/promises";
import { generateId } from "@hermes-os/shared";
import { isPresenceScanEnabled } from "@hermes-os/policies";
import { createMultiAccountGmailFromEnv, loadGoogleAccountsFromEnv, } from "@hermes-os/connectors";
import { analyzeScreenForContext, SERVICE_URLS, } from "@hermes-os/tool-executor";
export const DIGITAL_PRESENCE_SERVICES = [
    { id: "gmail", label: "Gmail", url: SERVICE_URLS.gmail ?? "https://mail.google.com" },
    { id: "twitter", label: "X / Twitter", url: SERVICE_URLS.twitter ?? "https://x.com" },
    { id: "linkedin", label: "LinkedIn", url: SERVICE_URLS.linkedin ?? "https://www.linkedin.com/feed/" },
    { id: "calendar", label: "Calendar", url: SERVICE_URLS.calendar ?? "https://calendar.google.com" },
];
const NAV_MS = process.env.VITEST === "true" ? 0 : 1500;
/**
 * DOM-first digital presence: Playwright observe → context graph (Gmail API when available).
 */
export class DigitalPresenceMonitor {
    executor;
    sourceItems;
    openLoops;
    cf;
    activity;
    rotateIndex = 0;
    constructor(executor, sourceItems, openLoops, cf, activity) {
        this.executor = executor;
        this.sourceItems = sourceItems;
        this.openLoops = openLoops;
        this.cf = cf;
        this.activity = activity;
    }
    async scanNext(ctx) {
        const service = DIGITAL_PRESENCE_SERVICES[this.rotateIndex % DIGITAL_PRESENCE_SERVICES.length];
        this.rotateIndex += 1;
        return this.scanService(service, ctx);
    }
    async scanAll(ctx) {
        const results = [];
        for (const svc of DIGITAL_PRESENCE_SERVICES) {
            results.push(await this.scanService(svc, ctx));
            if (process.env.VITEST !== "true")
                await delay(1500);
        }
        return results;
    }
    async scanService(service, ctx) {
        if (!isPresenceScanEnabled() || process.env.HERMES_DISABLE_PRESENCE_SCAN === "1") {
            return { service: service.id, summary: "scan disabled", openLoops: [], risks: [] };
        }
        try {
            if (service.id === "gmail") {
                const apiResult = await this.scanGmailViaApi(ctx);
                if (apiResult)
                    return apiResult;
            }
            const nav = await this.executor.invoke("browser.open", { url: service.url }, ctx, { summary: `Presence scan: ${service.label}` });
            if (nav.status === "pending_approval") {
                return {
                    service: service.id,
                    summary: "needs approval",
                    openLoops: [],
                    risks: [],
                    error: nav.message,
                };
            }
            if (nav.status === "denied") {
                return {
                    service: service.id,
                    summary: "navigation failed",
                    openLoops: [],
                    risks: [],
                    error: nav.reason,
                };
            }
            const pageId = nav.data?.pageId;
            await delay(NAV_MS);
            const obs = await this.executor.invoke("browser.observe", { pageId }, ctx, { summary: `DOM observe ${service.label}` });
            if (obs.status === "success") {
                const observation = obs.data?.observation;
                const summary = observation
                    ? `${observation.title ?? service.label}: ${observation.interactive?.length ?? 0} interactive elements`
                    : `${service.label} observed`;
                const openLoops = this.inferOpenLoopsFromText(observation?.visibleText ?? "");
                await this.persistScan(service, summary, openLoops, [], undefined);
                return { service: service.id, summary, openLoops, risks: [] };
            }
            if (process.env.HERMES_ENABLE_SCREEN_CONNECTOR !== "1") {
                return {
                    service: service.id,
                    summary: "DOM observe failed; screen fallback disabled",
                    openLoops: [],
                    risks: [],
                    error: obs.status === "denied" ? obs.reason : obs.message,
                };
            }
            const scr = await this.executor.invoke("screen.observe", {}, ctx, {
                summary: `Screenshot fallback: ${service.label}`,
            });
            if (scr.status !== "success") {
                return {
                    service: service.id,
                    summary: "observe failed",
                    openLoops: [],
                    risks: [],
                    error: scr.status === "denied" ? scr.reason : scr.message,
                };
            }
            const capturePath = scr.data?.capturePath;
            const vision = await analyzeScreenForContext(capturePath ?? "", service.id, this.cf);
            await this.persistScan(service, vision.summary, vision.openLoops, vision.risks, capturePath);
            return {
                service: service.id,
                summary: vision.summary,
                openLoops: vision.openLoops,
                risks: vision.risks,
                capturePath,
            };
        }
        catch (err) {
            return {
                service: service.id,
                summary: "scan error",
                openLoops: [],
                risks: [],
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }
    async scanGmailViaApi(_ctx) {
        const multi = createMultiAccountGmailFromEnv();
        const accounts = loadGoogleAccountsFromEnv();
        if (!multi || !accounts.length)
            return null;
        const account = accounts[0];
        const unread = await multi.getUnread(account.id, 10);
        const loops = await multi.extractOpenLoops(account.id);
        const summary = `Gmail API (${account.email}): ${unread.length} unread`;
        const openLoopTexts = loops.map((l) => l.description);
        await this.persistScan({ id: "gmail", label: "Gmail", url: "" }, summary, openLoopTexts, [], undefined);
        await this.activity.presenceScan("gmail", summary, openLoopTexts.length);
        return { service: "gmail", summary, openLoops: openLoopTexts, risks: [] };
    }
    inferOpenLoopsFromText(text) {
        return text
            .split("\n")
            .filter((line) => /\b(reply|follow.?up|confirm|waiting|rsvp|deadline)\b/i.test(line))
            .slice(0, 5);
    }
    async persistScan(service, summary, openLoops, risks, capturePath) {
        const now = new Date().toISOString();
        await this.sourceItems.upsert({
            id: generateId("src"),
            sourceType: service.id,
            externalId: `presence:${service.id}:${now.slice(0, 13)}`,
            title: `${service.label} scan`,
            content: [summary, ...openLoops, ...risks].join("\n"),
            metadata: JSON.stringify({ capturePath, scannedAt: now, method: "dom_observe" }),
            createdAt: now,
            updatedAt: now,
        });
        for (const loop of openLoops.slice(0, 3)) {
            const desc = `[${service.label}] ${loop}`;
            const existing = await this.openLoops.listOpen(50);
            if (!existing.some((l) => l.description === desc)) {
                await this.openLoops.createFromMessage(desc, "browser");
            }
        }
        await this.activity.agentStart("DigitalPresenceMonitor", {
            routing: service.id,
            messagePreview: summary.slice(0, 80),
        });
        await this.activity.presenceScan(service.id, summary, openLoops.length);
        await this.activity.agentDone("DigitalPresenceMonitor", {
            preview: summary.slice(0, 120),
        });
    }
}
//# sourceMappingURL=digital-presence-monitor.js.map
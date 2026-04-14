/**
 * browser-agent.ts
 * Thin TypeScript wrapper around the `agent-browser` CLI binary.
 *
 * agent-browser is a Rust CLI tool for browser automation via Chrome DevTools Protocol.
 * Install: npm install -g agent-browser && agent-browser install
 * Docs:    https://agent-browser.dev
 *
 * Usage example:
 *   import { BrowserAgent } from "@/lib/browser-agent";
 *   const agent = new BrowserAgent();
 *   await agent.open("https://example.com");
 *   const snap = await agent.snapshot();
 *   await agent.close();
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const EXEC_OPTS = {
  maxBuffer: 4 * 1024 * 1024,
  timeout: 30_000,
};

/**
 * Run agent-browser with an explicit args array.
 * Using execFile (not exec/execSync) means the shell is never involved —
 * arguments are passed directly to the process, so no shell injection is possible.
 */
async function run(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("agent-browser", args, EXEC_OPTS);
    return stdout.trim();
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`agent-browser error: ${err.stderr ?? err.message ?? String(e)}`);
  }
}

export class BrowserAgent {
  /** Navigate to a URL. */
  async open(url: string): Promise<void> {
    await run(["open", url]);
  }

  /**
   * Return the accessibility tree with deterministic element refs (@e1, @e2, …).
   * This is the recommended way for AI agents to understand the current page.
   */
  async snapshot(): Promise<string> {
    return run(["snapshot"]);
  }

  /** Take a screenshot. Returns path to the saved file. */
  async screenshot(outputPath = "screenshot.png", fullPage = false): Promise<string> {
    const args = ["screenshot", outputPath];
    if (fullPage) args.push("--full");
    await run(args);
    return outputPath;
  }

  /** Click an element by selector or accessibility ref (@e1, @e2, …). */
  async click(selector: string): Promise<void> {
    await run(["click", selector]);
  }

  /** Clear an input and fill it with text. */
  async fill(selector: string, text: string): Promise<void> {
    await run(["fill", selector, text]);
  }

  /** Type text into an element (without clearing first). */
  async type(selector: string, text: string): Promise<void> {
    await run(["type", selector, text]);
  }

  /** Get visible text content of an element. */
  async getText(selector: string): Promise<string> {
    return run(["get", "text", selector]);
  }

  /** Get the current page URL. */
  async getUrl(): Promise<string> {
    return run(["get", "url"]);
  }

  /** Get the current page title. */
  async getTitle(): Promise<string> {
    return run(["get", "title"]);
  }

  /** Wait for an element to become visible. */
  async waitFor(selector: string): Promise<void> {
    await run(["wait", selector]);
  }

  /** Execute arbitrary JavaScript in the page context. */
  async eval(script: string): Promise<string> {
    return run(["eval", script]);
  }

  /** Press a key (Enter, Tab, Escape, ArrowDown, Ctrl+a, …). */
  async press(key: string): Promise<void> {
    await run(["press", key]);
  }

  /** Scroll the page. direction: up | down | left | right */
  async scroll(direction: "up" | "down" | "left" | "right", px = 300): Promise<void> {
    await run(["scroll", direction, String(px)]);
  }

  /** Close the browser. Always call this when done to free resources. */
  async close(): Promise<void> {
    await run(["close"]);
  }
}

// ── Convenience: run a quick scrape task ────────────────────────────────────
/**
 * Opens a URL, waits for an optional selector, returns the accessibility snapshot,
 * then closes the browser. Useful for one-shot scraping.
 */
export async function quickSnapshot(
  url: string,
  waitForSelector?: string,
): Promise<string> {
  const agent = new BrowserAgent();
  try {
    await agent.open(url);
    if (waitForSelector) await agent.waitFor(waitForSelector);
    return await agent.snapshot();
  } finally {
    await agent.close();
  }
}

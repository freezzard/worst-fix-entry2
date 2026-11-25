/**
 * worst-fix-entry2
 *
 * Entry program for the make.fun quest "Worst Fix Ever: Funniest
 * Commit Message". The program writes exactly one commit-message
 * line to /output/entry.txt, then reads the file back and proves,
 * byte for byte, that what landed on disk is the line it meant
 * to write.
 *
 * The line is one commit subject: plain ASCII, opening with the
 * conventional fix prefix, inside the quest gate of 1 to 100
 * characters, with no trailing newline and no line break anywhere
 * inside it.
 *
 * Behaviour contract, kept on purpose:
 *   - deterministic: the same input always produces the same bytes.
 *   - offline: no network call, no clock read, no random source,
 *     and no environment variable is consulted anywhere.
 *   - guarded: every failure path returns a named result object
 *     that carries its own detail, and the caller decides from it.
 *
 * Run with: node main.ts
 * Expected stdout: a short verification report ending in status ok.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

/* ------------------------------------------------------------------ */
/* Fixed inputs                                                        */
/* ------------------------------------------------------------------ */

const OUTPUT_PATH = "/output/entry.txt";
const GATE_MIN_CHARS = 1;
const GATE_MAX_CHARS = 100;
const TEXT_ENCODING = "utf8";
const ASCII_CEILING = 127;
const EXPECTED_PREFIX = "fix:";

/**
 * The one commit-message line this entry submits. It is kept as a
 * single literal so the file the program writes holds exactly the
 * string written here, character for character.
 */
const FINAL_LINE =
  "fix: added a cache so yesterday's prices now load instantly";

/* ------------------------------------------------------------------ */
/* Small named result shapes                                           */
/* ------------------------------------------------------------------ */

type LineCheck = {
  ok: boolean;
  faults: string[];
  charCount: number;
  byteCount: number;
};

type StepResult = {
  ok: boolean;
  detail: string;
};

type ReadBack = {
  ok: boolean;
  detail: string;
  text: string;
  byteCount: number;
  sha256: string;
};

/* ------------------------------------------------------------------ */
/* Pure checks on the line                                             */
/* ------------------------------------------------------------------ */

/**
 * Counts Unicode code points, not UTF-16 code units, so the number
 * the program reports is the number the gate counts.
 */
function countCodePoints(text: string): number {
  const points = Array.from(text);
  return points.length;
}

/**
 * True when every code point in the text sits inside plain ASCII.
 * A code point above the ASCII ceiling fails the check at once.
 */
function isAsciiOnly(text: string): boolean {
  const points = Array.from(text);
  for (const point of points) {
    const code = point.codePointAt(0);
    const safeCode = code === undefined ? ASCII_CEILING + 1 : code;
    if (safeCode > ASCII_CEILING) {
      return false;
    }
  }
  return true;
}

/**
 * True when the text carries a line feed or a carriage return.
 * The gate wants one line, so any break inside fails the check.
 */
function hasLineBreak(text: string): boolean {
  if (text.includes("\n")) {
    return true;
  }
  if (text.includes("\r")) {
    return true;
  }
  return false;
}

/**
 * Runs every gate rule over the candidate line and collects each
 * fault it finds into one list, so a failure names all of its
 * causes instead of only the first one it happened to hit.
 */
function checkFinalLine(text: string): LineCheck {
  const faults: string[] = [];
  const charCount = countCodePoints(text);
  const byteCount = Buffer.byteLength(text, TEXT_ENCODING);
  if (text.trim().length === 0) {
    faults.push("line is empty or whitespace only");
  }
  if (text.startsWith(EXPECTED_PREFIX) === false) {
    faults.push(`line lacks the expected prefix ${EXPECTED_PREFIX}`);
  }
  if (charCount < GATE_MIN_CHARS) {
    faults.push(
      `line has ${charCount} characters, below the gate minimum ${GATE_MIN_CHARS}`,
    );
  }
  if (charCount > GATE_MAX_CHARS) {
    faults.push(
      `line has ${charCount} characters, above the gate maximum ${GATE_MAX_CHARS}`,
    );
  }
  if (hasLineBreak(text)) {
    faults.push("line contains a line break");
  }
  if (text.endsWith("\n")) {
    faults.push("line ends with a newline");
  }
  if (text !== text.trim()) {
    faults.push("line has leading or trailing whitespace");
  }
  if (isAsciiOnly(text) === false) {
    faults.push("line contains a non-ASCII character");
  }
  const passed = faults.length === 0;
  const verdict: LineCheck = {
    ok: passed,
    faults,
    charCount,
    byteCount,
  };
  return verdict;
}

/* ------------------------------------------------------------------ */
/* Filesystem steps                                                    */
/* ------------------------------------------------------------------ */

/**
 * Creates the output folder when it is missing. A folder that
 * already exists is fine, and the recursive flag makes the call
 * harmless to repeat.
 */
function ensureOutputFolder(folderPath: string): StepResult {
  try { const created = fs.mkdirSync(folderPath, { recursive: true });
    const named = created === undefined ? folderPath : created;
    const done: StepResult = { ok: true, detail: `folder ready: ${named}` };
    return done;
  } catch (caughtFailure) {
    const message = caughtFailure instanceof Error
      ? caughtFailure.message
      : String(caughtFailure);
    const failed: StepResult = {
      ok: false,
      detail: `cannot create folder ${folderPath}: ${message}`,
    };
    return failed;
  }
}

/**
 * Writes the line to the output file with no trailing newline.
 * The write is one synchronous call, so the bytes on disk are
 * exactly the bytes of the string passed in.
 */
function writeEntryFile(filePath: string, text: string): StepResult {
  try { const payload = Buffer.from(text, TEXT_ENCODING);
    fs.writeFileSync(filePath, payload);
    const written: StepResult = {
      ok: true,
      detail: `wrote ${payload.length} bytes to ${filePath}`,
    };
    return written;
  } catch (caughtFailure) {
    const message = caughtFailure instanceof Error
      ? caughtFailure.message
      : String(caughtFailure);
    const failed: StepResult = {
      ok: false,
      detail: `cannot write ${filePath}: ${message}`,
    };
    return failed;
  }
}

/**
 * Returns the lowercase hex digest of a byte buffer under SHA-256.
 */
function sha256Hex(payload: Buffer): string {
  const digest = createHash("sha256");
  digest.update(payload);
  return digest.digest("hex");
}

/**
 * Reads the output file back from disk and hashes its exact bytes,
 * so the report can show the digest of what really landed there.
 */
function readBackEntry(filePath: string): ReadBack {
  try { const payload = fs.readFileSync(filePath);
    const text = payload.toString(TEXT_ENCODING);
    const found: ReadBack = {
      ok: true,
      detail: `read ${payload.length} bytes from ${filePath}`,
      text,
      byteCount: payload.length,
      sha256: sha256Hex(payload),
    };
    return found;
  } catch (caughtFailure) {
    const message = caughtFailure instanceof Error
      ? caughtFailure.message
      : String(caughtFailure);
    const failed: ReadBack = {
      ok: false,
      detail: `cannot read ${filePath}: ${message}`,
      text: "",
      byteCount: 0,
      sha256: "",
    };
    return failed;
  }
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

/**
 * Builds the verification report printed on a successful run.
 * Every line of it is derived from values the program measured
 * itself during this run, never from a remembered constant.
 */
function buildReport(
  checked: LineCheck,
  written: StepResult,
  readBack: ReadBack,
): string {
  const reportLines: string[] = [];
  reportLines.push("worst-fix-entry2 verification report");
  reportLines.push(`output: ${OUTPUT_PATH}`);
  reportLines.push(`line: ${FINAL_LINE}`);
  reportLines.push(`chars: ${checked.charCount}`);
  reportLines.push(`bytes: ${checked.byteCount}`);
  reportLines.push(`gate: ${GATE_MIN_CHARS}-${GATE_MAX_CHARS} chars`);
  reportLines.push(`write: ${written.detail}`);
  reportLines.push(`readback: ${readBack.detail}`);
  reportLines.push(`readback chars: ${countCodePoints(readBack.text)}`);
  reportLines.push(`readback bytes: ${readBack.byteCount}`);
  reportLines.push(`sha256: ${readBack.sha256}`);
  reportLines.push("status: ok");
  return reportLines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

/**
 * Runs the entry end to end: check the line, prepare the folder,
 * write the file, read it back, and prove the round trip is exact.
 * Each step guards the next one, and the first failure stops the
 * run with its own detail on stderr and a nonzero exit code.
 */
function main(): number {
  const checked = checkFinalLine(FINAL_LINE);
  if (checked.ok === false) {
    console.error("line check failed:");
    for (const fault of checked.faults) {
      console.error(`- ${fault}`);
    }
    return 1;
  }
  const folderPath = path.dirname(OUTPUT_PATH);
  const folder = ensureOutputFolder(folderPath);
  if (folder.ok === false) {
    console.error(folder.detail);
    return 1;
  }
  const written = writeEntryFile(OUTPUT_PATH, FINAL_LINE);
  if (written.ok === false) {
    console.error(written.detail);
    return 1;
  }
  const readBack = readBackEntry(OUTPUT_PATH);
  if (readBack.ok === false) {
    console.error(readBack.detail);
    return 1;
  }
  if (readBack.text !== FINAL_LINE) {
    console.error("readback mismatch: file content differs from the line");
    return 1;
  }
  if (readBack.byteCount !== checked.byteCount) {
    console.error(
      `readback size mismatch: ${readBack.byteCount} bytes on disk, ` +
        `${checked.byteCount} bytes expected`,
    );
    return 1;
  }
  const report = buildReport(checked, written, readBack);
  console.log(report);
  return 0;
}

process.exitCode = main();

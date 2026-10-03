import { describe, it, expect } from "vitest";
// The pure module, which imports nothing — services/backup.ts reaches
// `@workspace/db` and throws at load without DATABASE_URL, as CI has none.
import { commandErrorReason } from "./src/lib/commandError.js";

// What execSync throws: the message repeats the command, credentials and all.
function execError(stderr: string) {
  return Object.assign(
    new Error('Command failed: psql "postgresql://fermentos:s3cret@db:5432/fermentos" -f dump.sql'),
    { stderr: Buffer.from(stderr) },
  );
}

describe("commandErrorReason", () => {
  it("picks the ERROR line out of psql's stderr", () => {
    const err = execError('psql:/tmp/x.sql:37: NOTICE:  something\npsql:/tmp/x.sql:38: ERROR:  syntax error at or near "THIS"\n');
    expect(commandErrorReason(err)).toBe('psql:/tmp/x.sql:38: ERROR:  syntax error at or near "THIS"');
  });

  it("picks pg_dump's error line", () => {
    const err = execError("pg_dump: error: connection to server failed: Connection refused\n");
    expect(commandErrorReason(err)).toBe("pg_dump: error: connection to server failed: Connection refused");
  });

  it("never returns the command line or the password", () => {
    const reason = commandErrorReason(execError("psql: ERROR:  boom\n"));
    expect(reason).not.toContain("s3cret");
    expect(reason).not.toContain("postgresql://");
  });

  it("falls back to the first stderr line, then a generic message", () => {
    expect(commandErrorReason(execError("something odd happened\nmore\n"))).toBe("something odd happened");
    expect(commandErrorReason(execError(""))).toBe("command failed");
    expect(commandErrorReason(new Error("no stderr"))).toBe("command failed");
    expect(commandErrorReason(null)).toBe("command failed");
  });
});

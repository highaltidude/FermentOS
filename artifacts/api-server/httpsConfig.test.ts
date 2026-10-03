import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
// The pure module, which imports nothing — services/httpsSetup.ts spawns
// processes and reads system files.
import {
  buildEnableArgs,
  isValidHostName,
  isValidIpv4,
  isValidPort,
  parseDropIn,
  parseHelperVersion,
  validateEnableInput,
} from "./src/lib/httpsConfig.js";

// These values become arguments to a script that runs as root, so the
// rejections matter as much as the acceptances.
const HOSTILE = ["1.2.3.4;id", "$(id)", "`id`", "a b", "a\nb", "--name", "-x", "a;b", "a|b", "a&b", "../x", "a/b", ""];

describe("isValidIpv4", () => {
  it("accepts ordinary LAN addresses", () => {
    for (const ip of ["192.168.1.50", "10.0.0.1", "172.16.5.4", "0.0.0.0", "255.255.255.255"]) {
      expect(isValidIpv4(ip)).toBe(true);
    }
  });

  it("rejects out-of-range octets, leading zeros, IPv6 and junk", () => {
    for (const ip of ["256.1.1.1", "1.2.3", "1.2.3.4.5", "01.2.3.4", "::1", "fe80::1", "1.2.3.4 ", ...HOSTILE]) {
      expect(isValidIpv4(ip)).toBe(false);
    }
  });
});

describe("isValidHostName", () => {
  it("accepts .local and dotted names", () => {
    for (const n of ["fermentos.local", "pi", "brew-pi.home.arpa", "a1"]) expect(isValidHostName(n)).toBe(true);
  });

  it("rejects hyphen edges, underscores, overlong labels and shell syntax", () => {
    for (const n of ["-pi.local", "pi-.local", "pi_1.local", "a..b", ".local", `${"a".repeat(64)}.local`, ...HOSTILE]) {
      expect(isValidHostName(n)).toBe(false);
    }
  });
});

describe("isValidPort", () => {
  it("accepts 1–65535 integers only", () => {
    expect([1, 80, 443, 65535].every(isValidPort)).toBe(true);
    expect([0, 65536, -1, 80.5, NaN, "80"].some(isValidPort)).toBe(false);
  });
});

describe("validateEnableInput", () => {
  it("fills in default ports and de-duplicates names", () => {
    expect(validateEnableInput({ ip: " 192.168.1.50 ", names: ["pi.local", "pi.local", " "] })).toEqual({
      ok: true,
      value: { ip: "192.168.1.50", names: ["pi.local"], httpPort: 80, httpsPort: 443 },
    });
  });

  it("rejects a bad IP, bad name, too many names, bad or equal ports", () => {
    expect(validateEnableInput({ ip: "1.2.3.4;id" }).ok).toBe(false);
    expect(validateEnableInput({ ip: "1.2.3.4", names: ["$(id)"] }).ok).toBe(false);
    expect(validateEnableInput({ ip: "1.2.3.4", names: ["a", "b", "c", "d", "e", "f"] }).ok).toBe(false);
    expect(validateEnableInput({ ip: "1.2.3.4", httpPort: 0 }).ok).toBe(false);
    expect(validateEnableInput({ ip: "1.2.3.4", httpPort: 8443, httpsPort: 8443 }).ok).toBe(false);
  });
});

describe("buildEnableArgs", () => {
  it("passes each value as its own argument", () => {
    expect(buildEnableArgs({ ip: "192.168.1.50", names: ["pi.local", "brew.local"], httpPort: 8080, httpsPort: 8443 })).toEqual([
      "enable", "--ip", "192.168.1.50", "--name", "pi.local", "--name", "brew.local", "--http-port", "8080", "--https-port", "8443",
    ]);
  });
});

describe("parseDropIn", () => {
  it("is null when there is no drop-in", () => {
    expect(parseDropIn(null)).toBeNull();
  });

  it("reads what the helper writes", () => {
    const text = [
      "# Written by FermentOS",
      "[Service]",
      'Environment="FERMENTOS_IP=192.168.1.50"',
      'Environment="FERMENTOS_NAMES=pi.local brew.local"',
      'Environment="FERMENTOS_UPSTREAM=127.0.0.1:3000"',
      'Environment="HTTP_PORT=8080"',
      'Environment="HTTPS_PORT=8443"',
    ].join("\n");
    expect(parseDropIn(text)).toEqual({ ip: "192.168.1.50", names: ["pi.local", "brew.local"], httpPort: 8080, httpsPort: 8443 });
  });

  it("falls back to defaults for missing or invalid values", () => {
    expect(parseDropIn('[Service]\nEnvironment="FERMENTOS_IP=nope"\nEnvironment="HTTP_PORT=99999"\n')).toEqual({
      ip: null,
      names: [],
      httpPort: 80,
      httpsPort: 443,
    });
  });
});

describe("parseHelperVersion", () => {
  it("reads the version from the real helper script", () => {
    const script = readFileSync(path.resolve(__dirname, "../../scripts/https-helper.sh"), "utf8");
    expect(parseHelperVersion(script)).toBeGreaterThanOrEqual(1);
  });

  it("is null without a version line", () => {
    expect(parseHelperVersion("#!/bin/bash\necho hi\n")).toBeNull();
    expect(parseHelperVersion(null)).toBeNull();
  });
});

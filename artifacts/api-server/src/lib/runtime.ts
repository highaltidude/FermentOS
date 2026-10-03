import { existsSync } from "fs";

// Detect Docker at startup — /.dockerenv is always present inside containers.
// Used to skip systemd- and host-specific behaviour that has no meaning there.
export const IS_DOCKER = existsSync("/.dockerenv");

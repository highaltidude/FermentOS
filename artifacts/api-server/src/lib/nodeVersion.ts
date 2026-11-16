/**
 * The oldest Node.js major FermentOS runs on. The PDF reader behind kit-sheet
 * import (pdf.js, via unpdf) fails to load on anything older. install.sh and
 * update.sh check the same number.
 */
export const MIN_NODE_MAJOR = 22;

export function nodeMajor(version: string = process.versions.node): number {
  return Number(version.split(".")[0]);
}

export function isNodeSupported(version?: string): boolean {
  return nodeMajor(version) >= MIN_NODE_MAJOR;
}

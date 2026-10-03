import type { Request, Response } from "express";
import { GetRecipeParams } from "@workspace/api-zod";

/**
 * Parse and validate the numeric `:id` route param.
 *
 * Every generated `*Params` schema for an `{id}` path is the same
 * `{ id: coerce.number() }`, so any one of them validates it identically. On
 * failure this sends the 400 itself and returns undefined, so the caller only
 * has to return.
 */
export function parseIdParam(req: Request, res: Response): number | undefined {
  const params = GetRecipeParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return undefined;
  }
  return params.data.id;
}

import type { ErrorRequestHandler } from "express";

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const status: number =
    typeof err?.status === "number"
      ? err.status
      : typeof err?.statusCode === "number"
        ? err.statusCode
        : 500;

  req.log.error({ err, status }, "Unhandled error");

  const isProduction = process.env.NODE_ENV === "production";
  const message =
    isProduction || status === 500
      ? "Internal server error"
      : (err?.message ?? "Internal server error");

  res.status(status).json({ error: message });
};

export default errorHandler;

import type { RequestHandler } from "express";
import type { ZodType } from "zod";

export function validateBody(schema: ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue.path.join(".");
      const message = field ? `${field}: ${issue.message}` : issue.message;

      res.status(400).json({ error: message });

      return;
    }

    req.body = result.data;
    next();
  };
}

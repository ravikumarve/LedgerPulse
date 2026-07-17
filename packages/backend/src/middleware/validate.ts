import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

type ValidationTarget = "body" | "query" | "params";

/**
 * Express middleware that validates request data against a Zod schema.
 * Returns 422 with field-level errors on failure.
 */
export function validate(schema: ZodSchema, target: ValidationTarget = "body") {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[target]);
      // Replace with parsed (strips unknown fields, applies defaults/coercion)
      (req as any)[target] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
          code: e.code,
        }));

        res.status(422).json({
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details: errors,
        });
        return;
      }
      next(err);
    }
  };
}

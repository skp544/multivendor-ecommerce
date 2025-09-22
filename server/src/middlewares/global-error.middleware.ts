import { NextFunction, Request, Response } from "express";
import { errorHandler } from "@/utils/api-handler";

export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  errorHandler({ req, res, error: err });
};

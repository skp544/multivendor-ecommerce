import { Request, Response } from "express";

export interface IErrorHandler {
  req: Request;
  res: Response;
  statusCode?: number;
  message?: string;
  error?: any;
}

export interface ISuccessHandler {
  res: Response;
  statusCode?: number;
  message?: string;
  data?: any;
}

import { pinoHttp } from "pino-http";
import { randomUUID } from "crypto";
import { IncomingMessage, ServerResponse } from "http";
import { accessLogger } from "../../config/logger.js";

export const requestLoggerMiddleware = pinoHttp({
  logger: accessLogger,
  genReqId: (req: IncomingMessage) => {
    const reqWithId = req as any;
    if (reqWithId.requestId) {
      return reqWithId.requestId;
    }
    const incoming = req.headers["x-request-id"];
    return (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
  },
  customProps: () => {
    return {
      channel: "access",
    };
  },
  serializers: {
    req: (req: any) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      ip: req.remoteAddress,
    }),
    res: (res: any) => ({
      statusCode: res.statusCode,
    }),
  },
});

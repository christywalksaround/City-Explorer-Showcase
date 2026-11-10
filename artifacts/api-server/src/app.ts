import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// JSON parser errors must be readable by the upload form, not HTML error pages.
const handleError: ErrorRequestHandler = (error, req, res, _next) => {
  if (error.type === "entity.too.large") {
    res.status(413).json({ error: "Upload is too large. Choose a photo up to 3 MB." });
    return;
  }
  if (error.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON request." });
    return;
  }
  req.log.error({ err: error }, "Request failed");
  res.status(500).json({ error: "Unable to complete the request. Please try again." });
};
app.use(handleError);

export default app;

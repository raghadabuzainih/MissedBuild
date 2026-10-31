import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { categoriesRouter } from "./routes/categories.js";
import { repositoriesRouter } from "./routes/repositories.js";
import { searchesRouter } from "./routes/searches.js";
import { failInterruptedIdeaAnalyses } from "./services/ideaAnalysisService.js";
import { failInterruptedSearches } from "./services/searchService.js";
import { AppError } from "./utils/appError.js";

const app = express();
app.use(cors({ origin: config.frontend.origin }));
app.use(express.json({ limit: "32kb" }));

// Feature routes are mounted here as they are implemented.
app.use("/api/categories", categoriesRouter);
app.use("/api/searches", searchesRouter);
app.use("/api/repositories", repositoriesRouter);

app.use("/api", (_req, _res, next) => {
    next(new AppError(404, "NOT_FOUND", "API endpoint not found."));
});
app.use(errorHandler);

// Migrations are applied manually with `npm run db:migrate`.
async function startServer() {
    try {
        // Not fatal: the server still starts, and these searches stay "processing".
        await failInterruptedSearches()
            .then((count) => count > 0 && console.log(`Marked ${count} interrupted search(es) as failed.`))
            .catch((error) => console.error("Could not clean up interrupted searches:", error));
        await failInterruptedIdeaAnalyses()
            .then((count) => count > 0 && console.log(`Marked ${count} interrupted repository analysis job(s) as failed.`))
            .catch((error) => console.error("Could not clean up interrupted repository analysis jobs:", error));

        app.listen(config.server.port, () => {
            console.log(`Server is running on port ${config.server.port}`);
        });

    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}

startServer();

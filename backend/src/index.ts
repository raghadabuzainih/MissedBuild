import express, { Request, Response } from "express";
import { config } from "./config.js";
import { runMigrations } from "./db/migrate.js";

const app = express();
app.use(express.json());

async function startServer() {
    try {
        // await runMigrations();

        app.listen(config.server.port, () => {
            console.log(`Server is running on port ${config.server.port}`);
        });

    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}

startServer();
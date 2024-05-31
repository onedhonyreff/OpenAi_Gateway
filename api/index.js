import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import { config } from "dotenv";
config();
const port = process.env.PORT ?? "8000";
const sessionUrl = `${process.env.SESSION_SERVICE_HOST}/v1/new-openai-session`;
const completionUrl = `${process.env.CHAT_COMPLETION_SERVICE_HOST}/v1/generate-conversation`;
const newSessionRetries = 100;
const axiosInstance = axios.create();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function enableCORS(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    next();
}
function handleErrorResponse(error) {
    if (axios.isAxiosError(error) && error.response) {
        const statusCode = error.response.status;
        const responseBody = error.response.data;
        console.error(`Error: Status Code ${statusCode}`, responseBody);
        return {
            status: false,
            statusCode: statusCode,
            error: responseBody.message,
        };
    }
    else {
        return {
            status: false,
            statusCode: 500,
            error: "Internal server error",
        };
    }
}
async function getNewSession(retries = 0) {
    try {
        const response = await axiosInstance.get(sessionUrl);
        let apiResponse = response.data;
        apiResponse.statusCode = response.status;
        return apiResponse;
    }
    catch (error) {
        await wait(1);
        if (retries < newSessionRetries) {
            return getNewSession(retries + 1);
        }
        else {
            let errorResponse = handleErrorResponse(error);
            if (!errorResponse.error) {
                errorResponse.error = "Error while getting session...";
            }
            return errorResponse;
        }
    }
}
async function getCompletionWithOpenAi(completionRequest) {
    if (!completionRequest.session)
        return handleErrorResponse(null);
    try {
        const response = await axiosInstance.post(completionUrl, completionRequest);
        let apiResponse = response.data;
        apiResponse.statusCode = response.status;
        return apiResponse;
    }
    catch (error) {
        let errorResponse = handleErrorResponse(error);
        if (!errorResponse.error) {
            errorResponse.error = "Error while getting completions...";
        }
        return errorResponse;
    }
}
function handleDefault(_, res) {
    res.write("Welcome OpenAI Gateway API - The service running correctly");
    return res.end();
}
async function handleConversation(req, res) {
    const sessionResponse = await getNewSession();
    if (!sessionResponse.status) {
        res.status(sessionResponse.statusCode).json(sessionResponse);
        return;
    }
    const session = sessionResponse.data;
    const conversationRequest = req.body;
    const completionRequest = {
        session: session,
        conversation: conversationRequest,
    };
    const completionResponse = await getCompletionWithOpenAi(completionRequest);
    res.status(completionResponse.statusCode).json(completionResponse);
}
const app = express();
app.use(bodyParser.json());
app.use(enableCORS);
app.get("/", handleDefault);
app.post("/v1/chat/completions", handleConversation);
app.use((req, res) => res.status(404).send({
    status: false,
    error: {
        message: `The requested endpoint (${req.method.toLocaleUpperCase()} ${req.path}) was not found. please make sure to use "http://localhost:${port}/v1" as the base URL.`,
        type: "invalid_request_error",
    },
}));
app.listen(Number(port), "0.0.0.0", async () => {
    console.log(`💡 Server is running at http://localhost:${port}`);
    console.log();
    console.log(`🔗 Local Base URL: http://localhost:${port}/v1`);
});
//# sourceMappingURL=index.js.map
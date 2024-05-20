import express, { Request, Response, NextFunction } from "express";
import bodyParser from "body-parser";
import axios from "axios";
import { config } from "dotenv";

config();

const port = process.env.PORT ?? "8000";
const sessionUrl = `${process.env.SESSION_SERVICE_HOST}/v1/new-openai-session`;
const completionUrl = `${process.env.CHAT_COMPLETION_SERVICE_HOST}/v1/chat-completion`;

const newSessionRetries: number = 100;

type ApiResponse = {
    statusCode: number;
    status: boolean;
    error?: string;
    data?: any;
};

type Session = {
    deviceId: string;
    persona: string;
    arkose: Arkose;
    turnstile: Turnstile;
    proofofwork: ProofOfWork;
    token: string;
};

type Arkose = {
    required: boolean;
    dx: any;
};

type Turnstile = {
    required: boolean;
};

type ProofOfWork = {
    required: boolean;
    seed: string;
    difficulty: string;
};

type Completion = {
    id: string;
    created: number;
    model: string;
    object: string;
    choices: Choice[];
    usage: Usage;
};

type Choice = {
    finish_reason: string;
    index: number;
    message: Message;
};

type Message = {
    content: string;
    role: string;
};

type Usage = {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
};

const axiosInstance = axios.create();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function enableCORS(req: Request, res: Response, next: NextFunction) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    next();
}

function handleErrorResponse(error: any): ApiResponse {
    if (axios.isAxiosError(error) && error.response) {
        const statusCode = error.response.status;
        const responseBody = error.response.data;
        console.error(`Error: Status Code ${statusCode}`, responseBody);
        return {
            status: false,
            statusCode: statusCode,
            error: responseBody.message,
        };
    } else {
        return {
            status: false,
            statusCode: 500,
            error: "Internal server error",
        };
    }
}

async function getNewSession(retries: number = 0): Promise<ApiResponse> {
    try {
        const response = await axiosInstance.get(sessionUrl);
        let apiResponse = response.data as ApiResponse;
        apiResponse.statusCode = response.status;
        return apiResponse;
    } catch (error) {
        await wait(1);

        if (retries < newSessionRetries) {
            return getNewSession(retries + 1);
        } else {
            return handleErrorResponse(error);
        }
    }
}

async function getCompletionWithOpenAi(session: Session): Promise<ApiResponse> {
    if (!session) return handleErrorResponse(null);
    try {
        const response = await axiosInstance.post(completionUrl, session);
        let apiResponse = response.data as ApiResponse;
        apiResponse.statusCode = response.status;
        return apiResponse;
    } catch (error) {
        return handleErrorResponse(error);
    }
}

function handleDefault(_: Request, res: Response) {
    res.write("Welcome OpenAI Gateway API - The service running correctly");
    return res.end();
}

async function handleChatCompletion(_: Request, res: Response) {
    const sessionResponse = await getNewSession();
    if (!sessionResponse.status) {
        res.status(sessionResponse.statusCode).json(sessionResponse);
        return;
    }

    const session = sessionResponse.data;
    const completionResponse = await getCompletionWithOpenAi(session);
    res.status(completionResponse.statusCode).json(completionResponse);
}

const app = express();
app.use(bodyParser.json());
app.use(enableCORS);

app.get("/", handleDefault);
app.post("/v1/chat/completions", handleChatCompletion);

app.use((req, res) =>
    res.status(404).send({
        status: false,
        error: {
            message: `The requested endpoint (${req.method.toLocaleUpperCase()} ${
                req.path
            }) was not found. please make sure to use "http://localhost:${port}/v1" as the base URL.`,
            type: "invalid_request_error",
        },
    })
);

app.listen(Number(port), "0.0.0.0", async () => {
    console.log(`💡 Server is running at http://localhost:${port}`);
    console.log();
    console.log(`🔗 Local Base URL: http://localhost:${port}/v1`);
});
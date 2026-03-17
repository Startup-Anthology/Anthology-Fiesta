import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error(
    "OPENAI_API_KEY must be set.",
  );
}

export const openai = new OpenAI({
  apiKey,
  baseURL: process.env.OPENAI_BASE_URL, // Optional override (Azure, local proxy, etc.)
});

// -----------------------------------------------------------------------------
// WeblookAI - Main Application File v4.0
//
// FINAL VERSION: Fully self-contained. All configurations are hardcoded
// for local Ollama usage. The .env file and dotenv dependency are removed.
// -----------------------------------------------------------------------------

import WebAgent from './web-agent.js';

// --- Hardcoded Configuration ---
// All settings are now defined here. No more external files.
const LLM_PROVIDER = "OLLAMA";
const LLM_MODEL_NAME = "llama3:8b"; // The local model you have installed
const OLLAMA_API_URL = "http://127.0.0.1:11434/api/chat";


/**
 * A lean helper function to communicate with the local Ollama LLM API.
 * Includes a retry mechanism for when the local server is starting up.
 * @param {string} prompt - The instruction and context for the LLM.
 * @param {boolean} isJsonMode - Whether to request a JSON object as output.
 * @returns {Promise<string>} - The text content of the LLM's response.
 */
async function runLLM(prompt, isJsonMode = false) {
  const maxRetries = 3;
  const retryDelay = 3000; // 3 seconds

  const headers = { 'Content-Type': 'application/json' };
  const bodyPayload = {
    model: LLM_MODEL_NAME,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
  };
  if (isJsonMode) {
    bodyPayload.format = 'json';
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(OLLAMA_API_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(bodyPayload),
      });

      if (!response.ok) {
        // We throw an error to trigger the retry mechanism
        throw new Error(`Ollama API request failed with status ${response.status}`);
      }

      const data = await response.json();
      return data.message.content; // Return on success

    } catch (error) {
      console.error(`[LLM Attempt ${attempt}/${maxRetries}] Error: ${error.message}`);
      if (attempt === maxRetries) {
        throw new Error(`Failed to communicate with local Ollama server after ${maxRetries} attempts.`);
      }
      console.log(`Retrying in ${retryDelay / 1000} seconds...`);
      await new Promise(res => setTimeout(res, retryDelay));
    }
  }
}

/**
 * STEP 1: DECOMPOSE
 */
async function decomposeQuestion(mainQuestion) {
  console.log('--- [STEP 1/3] DECOMPOSING QUESTION ---');
  console.log(`Analyzing the question: "${mainQuestion}"`);

  // --- НОВЫЙ, УЛУЧШЕННЫЙ ПРОМПТ ---
  const prompt = `You are a specialized AI assistant. Your task is to convert a user's question into 3-4 simple, direct, natural-language search engine queries.

**CRITICAL RULES:**
1.  The queries MUST be simple questions or phrases a human would type.
2.  **DO NOT** use any special operators like "site:", "filetype:", "inurl:", "intitle:". Your output must be clean, natural language.
3.  The queries should be different from each other to cover various aspects of the topic.

**User Question:**
"${mainQuestion}"

**Output Format:**
Return ONLY a valid JSON object with a single key "queries" that contains an array of strings.

**Good Example:**
User Question: "What is the Mamba architecture and how does it compare to Transformers?"
Your Output:
{
  "queries": [
    "What is Mamba AI architecture?",
    "Mamba vs Transformer key differences",
    "Benefits of Mamba architecture in AI",
    "Limitations of Transformer architecture"
  ]
}
`;
  // --- КОНЕЦ НОВОГО ПРОМПТА ---

  const responseJson = await runLLM(prompt, true);
  // A small safeguard in case the LLM returns an imperfect JSON string
  const cleanJsonString = responseJson.replace(/```json\n?|\n?```/g, '');
  const { queries } = JSON.parse(cleanJsonString);

  console.log(`Generated search queries: ${queries.join(', ')}\n`);
  return queries;
}
/**
 * STEP 2: SEARCH - POWERED BY WEB AGENT
 */
async function performSearchWithAgent(queries) {
  console.log('--- [STEP 2/3] DEPLOYING AUTONOMOUS WEB AGENT ---');
  const agent = new WebAgent();
  await agent.launch();
  
  const { context, report } = await agent.investigate(queries);

  console.log(`\n--- Agent Work Report ---`);
  console.log(`- Total unique sites visited: ${report.totalVisited}`);
  console.log(`- Successfully extracted content from: ${report.successful} sources`);
  console.log(`- Failed to extract from: ${report.failed} sources`);
  console.log('--------------------------\n');
  
  await agent.close();
  return context;
}


/**
 * STEP 3: SYNTHESIZE
 */
async function synthesizeResponse(mainQuestion, searchContext) {
  console.log('--- [STEP 3/3] SYNTHESIZING FINAL ANSWER ---');

  if (!searchContext || searchContext.trim() === '') {
    console.log('Search context is empty. Cannot generate an answer.');
    return "I couldn't find enough information online to answer your question. The web agent was unable to extract relevant content from the visited sites.";
  }

  const prompt = `You are an expert writer. Your task is to answer the user's original question based *only* on the provided search results. Do not use any prior knowledge. Do not make assumptions.

If the provided information is insufficient, state that you cannot answer fully with the given data.

User's Original Question: "${mainQuestion}"

--- Search Results Context ---
${searchContext}
---

Your Final Answer:`;

  const finalAnswer = await runLLM(prompt);
  console.log('Final answer generated.\n');
  return finalAnswer;
}


/**
 * The main orchestrator function.
 */
async function main() {
  const userQuestion = process.argv.slice(2).join(' ');

  if (!userQuestion) {
    console.error('❌ ERROR: Please provide a question to investigate!');
    console.log('Example Usage: npm start -- What is the capital of France?');
    return;
  }

  console.log(`🚀 Starting WeblookAI v4.0 (Fully Autonomous Mode)...`);
  console.log(`🔎 Investigating question: "${userQuestion}"\n`);

  try {
    const searchQueries = await decomposeQuestion(userQuestion);
    const searchContext = await performSearchWithAgent(searchQueries);
    const finalAnswer = await synthesizeResponse(userQuestion, searchContext);

    console.log('=======================================');
    console.log('✅ FINAL ANSWER:');
    console.log('=======================================');
    console.log(finalAnswer);

  } catch (error) {
    console.error('\n❌ An error occurred during the process:', error.message);
  }
}

main();
// FIX: Add GenerateContentResponse and GenerateImagesResponse to the import.
import { GoogleGenAI, Type, GenerateContentResponse, GenerateImagesResponse } from "@google/genai";
import { Result, Source, Question, ParsedNotes } from '../types';

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
    throw new Error("API_KEY environment variable is not set");
}
const ai = new GoogleGenAI({ apiKey: API_KEY });

const liteModel = 'gemini-flash-latest';
const proModel = 'gemini-2.5-pro';
const imageModel = 'imagen-4.0-generate-001';

const callApiWithRetry = async <T>(apiCall: () => Promise<T>, maxRetries = 3, initialDelay = 1000): Promise<T> => {
    let retries = 0;
    while (true) {
        try {
            return await apiCall();
        } catch (error: any) {
            const isRateLimitError = error.message && (error.message.includes('"status":"RESOURCE_EXHAUSTED"') || error.message.includes('429'));

            if (isRateLimitError) {
                retries++;
                if (retries > maxRetries) {
                    console.error("Max retries reached for API call.", error);
                    throw new Error("API rate limit exceeded after multiple retries.");
                }
                const delay = initialDelay * Math.pow(2, retries - 1) + Math.random() * 1000;
                console.warn(`Rate limit hit. Retrying in ${Math.round(delay)}ms... (Attempt ${retries}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
};


export const extractQuestionsFromFile = async (fileContent: string): Promise<Question[]> => {
    try {
        // FIX: Add type GenerateContentResponse to the response variable.
        const response: GenerateContentResponse = await callApiWithRetry(() => ai.models.generateContent({
            model: proModel,
            contents: `Your task is to meticulously analyze the following text and extract every single question it contains, along with any associated marks (e.g., "5 marks", "10m"). Capture each question exactly as it appears.\n\n---\n\n${fileContent}`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        questions: {
                            type: Type.ARRAY,
                            description: "An array of objects, where each object represents a question and its associated marks.",
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    questionText: { type: Type.STRING, description: "A single question exactly as it appears in the source text." },
                                    marks: { type: Type.STRING, description: "The marks associated with the question (e.g., '5 marks', '10m'). If no marks are specified, this should be null." }
                                },
                                required: ['questionText', 'marks']
                            }
                        }
                    },
                    required: ['questions']
                }
            },
            systemInstruction: "You are a highly accurate text processing tool. Your sole purpose is to extract questions and their marks from the user-provided text. You must not invent, hallucinate, or infer any questions. Extract them exactly as they are written. Return the data in the specified JSON format. It is critical that you extract ALL questions provided."
        }));
        
        const jsonString = response.text.trim();
        const parsedObject = JSON.parse(jsonString);

        if (parsedObject && Array.isArray(parsedObject.questions)) {
            if (parsedObject.questions.length === 0) {
                 throw new Error("AI parsing completed, but no questions were found in the file.");
            }
            return parsedObject.questions.map((q: any) => ({ text: q.questionText, marks: q.marks }));
        }
        throw new Error("Parsed JSON does not match the expected schema.");

    } catch (error) {
        console.error("Failed to extract questions using AI:", error);
        throw new Error(`AI failed to extract questions. Original error: ${error instanceof Error ? error.message : String(error)}`);
    }
};

const parseAiResponse = (text: string): { answer: string; imageDirective: string | null } => {
    const lines = text.split('\n');
    const directiveLine = lines.find(line => line.startsWith("USE_IMAGE:") || line.startsWith("GENERATE_IMAGE_PROMPT:"));
    const answerLines = lines.filter(line => !(line.startsWith("USE_IMAGE:") || line.startsWith("GENERATE_IMAGE_PROMPT:")));

    return {
        answer: answerLines.join('\n').trim(),
        imageDirective: directiveLine ? directiveLine.trim() : null
    };
};

const processSingleQuestion = async (notesData: ParsedNotes, questionObj: Question, customInstructions: string): Promise<Result> => {
    try {
        const { text: question, marks } = questionObj;
        
        // FIX: Add type GenerateContentResponse to the response variable.
        const webSearchCheckResponse: GenerateContentResponse = await callApiWithRetry(() => ai.models.generateContent({
            model: liteModel,
            contents: `Based ONLY on the provided notes, can the following question be answered comprehensively and factually? Your answer must be a single word: YES or NO.\n\n---NOTES---\n${notesData.text.substring(0, 8000)}\n---END NOTES---\n\n---QUESTION---\n${question}`
        }));
        const needsWebSearch = webSearchCheckResponse.text.trim().toUpperCase().includes('NO');
        
        const textPrompt = `
**Your Task:**
You are an expert Q&A agent. Your goal is to generate a high-quality, easy-to-understand answer for the user's question, strictly following all rules below.

**Question to Answer:**
${question}

**Source Material:**
---
**Notes Text:**
${notesData.text}
---
**Available Images from Notes:**
${notesData.images.length > 0 ? notesData.images.map((_, i) => `[Image ${i + 1}]`).join(' ') : 'None'}
---

**CRITICAL RULES (MUST be followed):**

1.  **Answer Style & Formatting:**
    - Your primary goal is to be clear and intuitive. Explain complex topics using simple language and helpful analogies, like a friendly tutor.
    - **CRITICAL:** Structure your answer for maximum clarity using headings, paragraphs, and lists (bullet points or numbered) where appropriate. Good formatting is key.
    - The final output must be **only the answer itself**, followed by the image decision on a new line. Do not include any conversational monologue, introductions, or extra text like "Here is the answer:".

2.  **Answer Depth & Length:**
    ${marks ? `**The question is worth ${marks}.** Your answer's length and depth MUST strictly correspond to this. A 5-mark question requires a few well-explained paragraphs, not a short sentence or a long essay.` : 'The answer should be concise yet comprehensive.'}

3.  **Source Usage:**
    ${needsWebSearch ? "You MUST use your web search capabilities to enhance, expand, and fact-check the answer. Synthesize information from the web with the provided notes into a single, comprehensive answer." : "You MUST answer using **only** the provided notes and images. Do not use outside knowledge or web search."}

4.  **User's Custom Rules:**
    ${customInstructions ? `You MUST also strictly follow these User-Provided Instructions: **${customInstructions}**` : 'No custom instructions provided.'}

**FINAL STEP - Image Decision (MANDATORY):**
After writing your complete, formatted answer, you MUST make an image decision on a new, separate line.
- **First, analyze the 'Available Images'.** If one of them is a perfect visual aid for your answer (e.g., a relevant diagram, chart), you MUST output: \`USE_IMAGE: [Image X]\` where X is the number of the image.
- **Only if NONE of the available images are suitable**, you MUST output a concise, descriptive sentence for a NEW image. This sentence **MUST** start with "GENERATE_IMAGE_PROMPT:". Example: "GENERATE_IMAGE_PROMPT: A flowchart illustrating the steps of the Branch and Bound algorithm."

**BEGIN YOUR RESPONSE NOW:**
`;
        
        const contentParts: any[] = [{ text: textPrompt }];
        if (notesData.images.length > 0) {
            notesData.images.forEach(image => {
                contentParts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
            });
        }

        // FIX: Add type GenerateContentResponse to the response variable.
        const textResponse: GenerateContentResponse = await callApiWithRetry(() => ai.models.generateContent({
            model: proModel,
            contents: { parts: contentParts },
            config: { tools: needsWebSearch ? [{ googleSearch: {} }] : [] },
        }));

        const fullText = textResponse.text;
        const { answer, imageDirective } = parseAiResponse(fullText);

        const sources: Source[] = textResponse.candidates?.[0]?.groundingMetadata?.groundingChunks
            ?.map((chunk: any) => ({ uri: chunk.web?.uri || '', title: chunk.web?.title || '' }))
            .filter(source => source.uri) || [];

        let imageUrl: string | null = null;
        if (imageDirective?.startsWith("USE_IMAGE:")) {
            const match = imageDirective.match(/\[Image (\d+)\]/);
            if (match) {
                const imageIndex = parseInt(match[1], 10) - 1;
                if (imageIndex >= 0 && imageIndex < notesData.images.length) {
                    const reusedImage = notesData.images[imageIndex];
                    imageUrl = `data:${reusedImage.mimeType};base64,${reusedImage.data}`;
                }
            }
        } else if (imageDirective?.startsWith("GENERATE_IMAGE_PROMPT:")) {
            const imagePrompt = imageDirective.replace("GENERATE_IMAGE_PROMPT:", "").trim();
            if (imagePrompt) {
                 try {
                    // FIX: Add type GenerateImagesResponse to the response variable.
                    const imageResponse: GenerateImagesResponse = await callApiWithRetry(() => ai.models.generateImages({ model: imageModel, prompt: imagePrompt, config: { numberOfImages: 1, outputMimeType: 'image/jpeg' } }));
                    if (imageResponse.generatedImages && imageResponse.generatedImages.length > 0) {
                        imageUrl = `data:image/jpeg;base64,${imageResponse.generatedImages[0].image.imageBytes}`;
                    }
                } catch (error) {
                    console.error("Image generation failed for prompt:", imagePrompt, error);
                }
            }
        }

        return { question, marks, answer, imageUrl, sources };

    } catch (error) {
        console.error(`Failed to process question: "${questionObj.text}"`, error);
        let errorMessage = "Sorry, an error occurred while generating the answer for this question. Please try again.";
        if (error instanceof Error && (error.message.includes('RESOURCE_EXHAUSTED') || error.message.includes('rate limit'))) {
             errorMessage = "Could not generate an answer due to API rate limits. Please try again later or process fewer questions at once.";
        }
        return {
            question: questionObj.text, marks: questionObj.marks,
            answer: errorMessage,
            imageUrl: null, sources: []
        };
    }
};

const CONCURRENCY_LIMIT = 2;

export const generateAnswers = async (
    notesData: ParsedNotes,
    questions: Question[],
    customInstructions: string,
    onProgress: (completed: number, total: number) => void
): Promise<Result[]> => {
    const totalQuestions = questions.length;
    const resultsMap = new Map<string, Result>();
    const questionQueue = [...questions];
    let completedCount = 0;

    const worker = async () => {
        while (questionQueue.length > 0) {
            const question = questionQueue.shift();
            if (!question) continue;
            
            try {
                const result = await processSingleQuestion(notesData, question, customInstructions);
                resultsMap.set(question.text, result);
            } catch (error) {
                console.error(`Worker failed on question "${question.text}":`, error);
                resultsMap.set(question.text, {
                    question: question.text, marks: question.marks,
                    answer: "A critical error occurred while processing this question.",
                    imageUrl: null, sources: []
                });
            } finally {
                completedCount++;
                onProgress(completedCount, totalQuestions);
            }
        }
    };

    const workers = Array(CONCURRENCY_LIMIT).fill(null).map(worker);
    await Promise.all(workers);

    return questions.map(q => resultsMap.get(q.text)!);
};

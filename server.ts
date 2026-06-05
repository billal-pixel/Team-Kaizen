import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// PORT is strictly 3000 as mandated by infrastructure
const PORT = 3000;

// Lazy initialization of GoogleGenAI to ensure startup stability
let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required for AI features. Please provide it in Settings > Secrets.");
    }
    geminiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });
  }
  return geminiClient;
}

// REST route to deliver the primary Single-Page Sales Dashboard
app.get("/", (req, res) => {
  const fileRoute = path.join(__dirname, "index.html");
  if (fs.existsSync(fileRoute)) {
    res.setHeader("Content-Type", "text/html");
    res.sendFile(fileRoute);
  } else {
    res.status(404).send("Error: index.html not found in workspace root.");
  }
});

// Backward compatibility or alternative static route
app.get("/index.html", (req, res) => {
  res.redirect("/");
});

// Secure API endpoint for AI Coaching & email summary generation
app.post("/api/ai-coaching", async (req, res) => {
  try {
    const { prompt, dashboardData } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }

    // Default mock data if dashboardData is missing
    const statsCtx = dashboardData || {
      totalSales: 0,
      totalCalls: 0,
      avgConversion: "0.0%",
      totalTalkTime: "0m",
      metTargetCount: "0",
      nearTargetCount: "0",
      belowTargetCount: "0",
      topPerformers: [],
      needsAttention: []
    };

    const ai = getGemini();

    const systemInstruction = 
      "You are '10MS AI Coach' — an elite, highly experienced sales executive, outbound manager, and business intelligence analyst at 10 Minute School (10MS). " +
      "Your objective is to provide high-caliber performance summaries, advisor coaching recommendations, or customized email outlines. " +
      "You must craft your response using the actual real-time numbers provided by the user's dashboard data. " +
      "Write in a helpful, analytical, professional, and motivational tone. " +
      "Address participants with appropriate titles (e.g. 'Team Lead Billal' or 'Line Manager Shundhi Shanai Bhuiyan'). " +
      "Keep responses highly professional and formatted in clean Markdown. Add creative performance elements (like bullet points, summaries, and structured takeaways) to make your output extremely readable and executive-ready.";

    const completePrompt = `
User requested prompt: "${prompt}"

---
REAL-TIME TEAM METRIC CONTEXT:
- Total Sales: ${statsCtx.totalSales}
- Total Calls: ${statsCtx.totalCalls}
- Average Conversion Rate: ${statsCtx.avgConversion}
- Combined Talk Time: ${statsCtx.totalTalkTime}
- Advisors Safely Meeting Target (>=100%): ${statsCtx.metTargetCount}
- Advisors Near Target (80-99%): ${statsCtx.nearTargetCount}
- Advisors Needing Attention (<50% target): ${statsCtx.belowTargetCount}

Top Performers List:
${JSON.stringify(statsCtx.topPerformers, null, 2)}

Underperforming/Alert List:
${JSON.stringify(statsCtx.needsAttention, null, 2)}
---

Please execute the user requested prompt flawlessly, integrating these numbers naturally wherever appropriate.
`;

    const chatRes = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: completePrompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    const aiText = chatRes.text || "I was unable to formulate a coaching response. Please try again.";
    res.json({ text: aiText });

  } catch (error: any) {
    console.error("Gemini API Error in /api/ai-coaching:", error);
    res.status(500).json({ 
      error: error.message || "An unexpected error occurred while communicating with the AI Coach." 
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`10MS Outbound Sales Dashboard server successfully running on port ${PORT}`);
});

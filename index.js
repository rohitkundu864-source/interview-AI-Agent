import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import * as pdfParseModule from "pdf-parse";

dotenv.config();

const app = express();
const port = process.env.PORT || 8787;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const MODEL = "gemini-3.8-flash";

function requireKey(res) {
  if (!process.env.GEMINI_API_KEY) {
    res.status(500).json({
      error: "GEMINI_API_KEY is not configured on the server.",
    });
    return false;
  }

  return true;
}

async function callGemini(contents, systemInstruction) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemInstruction }],
        },
        contents,
        generationConfig: {
          temperature: 0.55,
          maxOutputTokens: 900,
        },
      }),
    }
  );

  const raw = await response.text();

  console.log("Gemini status:", response.status);
  console.log("Gemini response:", raw);

  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `Gemini returned invalid JSON. HTTP ${response.status}: ${
        raw || "empty response"
      }`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        `Gemini request failed with HTTP ${response.status}`
    );
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned no text.");
  }

  return text;
}

const interviewerInstruction = `
You are InterviewPro, a realistic professional company interviewer.

Your job is to conduct a serious interview, not to tutor during the interview.

Rules:
- Ask exactly ONE question at a time.
- Do not dump a list of questions.
- Keep interviewer messages concise and natural.
- Start with a short professional greeting and then ask the current question.
- Adapt follow-up questions to the candidate's previous answer.
- Probe claims, projects, technologies, decisions, tradeoffs, ownership and measurable impact.
- Mix resume deep-dive, technical/role-specific, behavioral and situational questions.
- Do not reveal the scoring rubric while the interview is running.
- Do not invent facts about the candidate.
- If the candidate gives a weak or vague answer, ask a focused follow-up.
- If the answer is strong, increase difficulty.
- Avoid asking the same question twice.
- Treat this like a real interview: neutral, respectful and time-efficient.
`;

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/resume", upload.single("resume"), async (req, res) => {
  if (!requireKey(res)) return;

  try {
    if (!req.file) {
      return res.status(400).json({
        error: "Please upload a resume.",
      });
    }

    let resumeText = "";

    const type = req.file.mimetype || "";
    const fileName = req.file.originalname.toLowerCase();

    if (
      type === "application/pdf" ||
      fileName.endsWith(".pdf")
    ) {
      const pdfParser =
        pdfParseModule.default || pdfParseModule;

      const parsed = await pdfParser(req.file.buffer);

      resumeText = parsed.text || "";
    } else {
      resumeText = req.file.buffer.toString("utf8");
    }

    resumeText = resumeText
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 30000);

    if (!resumeText) {
      return res.status(400).json({
        error: "The uploaded resume did not contain readable text.",
      });
    }

    const plan = await callGemini(
      [
        {
          role: "user",
          parts: [
            {
              text: `Create an interview plan from this resume:\n\n${resumeText}`,
            },
          ],
        },
      ],
      `
You are an interview planner.

Analyze the resume and return ONLY valid JSON:

{
  "candidateName": "string",
  "targetRole": "string",
  "experienceLevel": "string",
  "focusAreas": ["string", "string", "string"],
  "openingQuestion": "string"
}

Do not invent details.

If a field is unavailable, use "Not specified".
`
    );

    let parsedPlan;

    try {
      parsedPlan = JSON.parse(
        plan
          .replace(/^```json\s*/i, "")
          .replace(/```$/i, "")
          .trim()
      );
    } catch {
      parsedPlan = {
        candidateName: "Candidate",
        targetRole: "Not specified",
        experienceLevel: "Not specified",
        focusAreas: [
          "Resume projects",
          "Technical fundamentals",
          "Behavioral communication",
        ],
        openingQuestion:
          "Please introduce yourself and walk me through your background.",
      };
    }

    res.json({
      resumeText,
      plan: parsedPlan,
    });
  } catch (error) {
    console.error("RESUME ERROR:", error);

    res.status(500).json({
      error: error.message || "Resume processing failed.",
    });
  }
});

app.post("/api/interview/message", async (req, res) => {
  if (!requireKey(res)) return;

  try {
    const {
      resumeText,
      messages = [],
      stage = "Introduction",
    } = req.body;

    if (!resumeText) {
      return res.status(400).json({
        error: "Resume context is missing.",
      });
    }

    const compactHistory = messages.slice(-14).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const prompt = `
Candidate resume:

${resumeText}

Current interview stage:
${stage}

Conversation:

${JSON.stringify(compactHistory)}

Continue the interview.

Remember:
- Ask one question only.
- Be professional.
- Adapt the next question to the candidate's previous answer.
`;

    const answer = await callGemini(
      [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      interviewerInstruction
    );

    res.json({
      message: answer,
    });
  } catch (error) {
    console.error("INTERVIEW ERROR:", error);

    res.status(500).json({
      error: error.message || "Interview request failed.",
    });
  }
});

app.post("/api/interview/evaluate", async (req, res) => {
  if (!requireKey(res)) return;

  try {
    const {
      resumeText,
      messages = [],
    } = req.body;

    if (!resumeText) {
      return res.status(400).json({
        error: "Resume context is missing.",
      });
    }

    const transcript = messages
      .map(
        (m) =>
          `${m.role === "assistant" ? "INTERVIEWER" : "CANDIDATE"}: ${
            m.content
          }`
      )
      .join("\n");

    const result = await callGemini(
      [
        {
          role: "user",
          parts: [
            {
              text: `Resume:

${resumeText}

Interview transcript:

${transcript}`,
            },
          ],
        },
      ],
      `
You are an interview evaluator.

Evaluate the candidate based only on the resume and interview transcript.

Return ONLY valid JSON:

{
  "overallScore": 0,
  "communication": 0,
  "technicalDepth": 0,
  "problemSolving": 0,
  "confidence": 0,
  "resumeKnowledge": 0,
  "strengths": ["...", "...", "..."],
  "improvements": ["...", "...", "..."],
  "summary": "...",
  "recommendation": "Keep practicing / Ready for another mock interview"
}

Scores are integers from 0 to 100.

Do not make hiring decisions or claims beyond the evidence.
`
    );

    let evaluation;

    try {
      evaluation = JSON.parse(
        result
          .replace(/^```json\s*/i, "")
          .replace(/```$/i, "")
          .trim()
      );
    } catch {
      evaluation = {
        overallScore: 0,
        communication: 0,
        technicalDepth: 0,
        problemSolving: 0,
        confidence: 0,
        resumeKnowledge: 0,
        strengths: ["Evaluation parsing failed."],
        improvements: ["Run the evaluation again."],
        summary:
          "The evaluator returned an unexpected format.",
        recommendation: "Keep practicing",
      };
    }

    res.json(evaluation);
  } catch (error) {
    console.error("EVALUATION ERROR:", error);

    res.status(500).json({
      error: error.message || "Evaluation failed.",
    });
  }
});

app.use((err, _req, res, _next) => {
  console.error("SERVER ERROR:", err);

  res.status(500).json({
    error: err.message || "Internal server error.",
  });
});

app.listen(port, () => {
  console.log(
    `Interview AI Agent server running on http://localhost:${port}`
  );
});
import Groq from "groq-sdk";

export async function reviewCode(patch: string): Promise<string | null> {
  if (!patch) {
    return "No changes detected in this Pull Request to review.";
  }

  try {
    const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY;
    if (!apiKey) {
      return "AI Review failed to run. Error: GROQ_API_KEY is not configured.";
    }

    const groq = new Groq({
      apiKey,
      dangerouslyAllowBrowser: true,
    });

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are an expert AI code reviewer.
Analyze the code changes (git diff patch).
Find:
1. Critical Bugs & Logic Errors
2. Security Vulnerabilities
3. Performance Bottlenecks & Optimization Opportunities
4. Code Smells & Readability Improvements
5. Best Practice Violations

Provide a structured, constructive, and highly professional review. Use Markdown formatting with clear bullet points, code examples for recommendations, and assign a clear rating/score if applicable. Keep your analysis concise and highly actionable.`,
        },
        {
          role: "user",
          content: patch,
        },
      ],
      model: "llama-3.3-70b-versatile",
    });

    return completion.choices[0]?.message?.content || "No review content generated.";
  } catch (error: unknown) {
    console.error("Error in reviewCode:", error);
    return `AI Review failed to run. Error: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

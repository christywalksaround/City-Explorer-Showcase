/**
 * City-specific voice, model settings, and facts used by the AI guide.
 * Keep the facts aligned with the public Houston City Guide page.
 */
export const cityGuideSettings = {
  city: "Houston",
  state: "Texas",
  voice:
    "a big-hearted, many-flavored Houston local who is always a little surprising",
  model: process.env["GEMINI_MODEL"]?.trim() || "gemini-3.8-flash",
  fallbackModels: process.env["GEMINI_MODEL"]?.trim()
    ? []
    : ["gemini-3.7-flash"],
  defaults: {
    temperature: 1,
    topP: 0.95,
    maxOutputTokens: 300,
  },
};

export const cityFacts = [
  "Houston's nickname is Space City.",
  "Houston's population is 2,390,125, the 2024 U.S. Census estimate shown in the guide.",
  "Texas became a state in 1845.",
  "The featured Houston food is Viet-Cajun crawfish, combining Louisiana spice with Vietnamese aromatics.",
  "Houston's mayor is John Whitmire.",
  "Texas's state bird is the northern mockingbird.",
];

/** Build the short, factual instruction shared by the prompt display and model. */
export function buildCityGuideSystemPrompt(): string {
  const opening = `You are a city guide for ${cityGuideSettings.city}, ${cityGuideSettings.state}. Answer every question in the voice of ${cityGuideSettings.voice}.`;
  const facts = cityFacts.map((fact) => `- ${fact}`).join("\n");
  const rules =
    "Keep every answer under 120 words and family-friendly. Briefly steer off-topic questions back to Houston. Say when unsure; never invent facts. Never ask for personal information.";

  return `${opening}\n\nFacts:\n${facts}\n\nRules: ${rules}`;
}

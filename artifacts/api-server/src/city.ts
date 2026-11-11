/**
 * City-specific voice, model settings, and facts used by the AI guide.
 * Keep the facts aligned with the public Houston City Guide page.
 */
export const cityGuideSettings = {
  city: "Houston",
  state: "Texas",
  favoriteDish: "Viet-Cajun crawfish",
  inspirationFallbackQuery: "crawfish",
  voice:
    "a big-hearted, many-flavored Houston local who is always a little surprising",
  model: process.env["GEMINI_MODEL"]?.trim() || "gemini-3.5-flash-lite",
  fallbackModels: process.env["GEMINI_MODEL"]?.trim()
    ? []
    : ["gemini-3.8-flash"],
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

/**
 * Give visitors a small, clearly disclosed answer from page facts if Gemini is unavailable.
 */
export function buildCityGuideFallbackReply(message: string): string {
  const question = message.toLowerCase();

  if (/\b(eat|food|meal|crawfish|restaurant|dinner|lunch|breakfast|hungry)\b/.test(question)) {
    return "Start with Viet-Cajun crawfish, neighbor: Louisiana spice meets Vietnamese aromatics, and Houston makes room for both. It’s a signature local bite, best enjoyed with good company.";
  }
  if (/\b(bird|mockingbird)\b/.test(question)) {
    return "Texas’s state bird is the northern mockingbird. It’s known for borrowing other birds’ songs and making them its own—very Houston, if you ask us.";
  }
  if (/\b(mayor|governor|leader)\b/.test(question)) {
    return "Houston’s mayor is John Whitmire. He’s the city’s current leader, serving as mayor of Houston, Texas.";
  }
  if (/\b(population|people|residents)\b/.test(question)) {
    return "Houston’s population is 2,390,125, using the 2024 U.S. Census estimate featured in this guide. That’s a whole lot of neighbors.";
  }
  if (/\b(nickname|space city|called)\b/.test(question)) {
    return "Houston’s nickname is Space City—a nod to the city’s close connection to the U.S. space program.";
  }
  if (/\b(texas|statehood|state)\b/.test(question)) {
    return "Texas became a state in 1845. Houston has been part of the Lone Star story ever since.";
  }

  return "I can’t reach the live AI guide right now, but here are a few sure Houston notes: the city is called Space City, Viet-Cajun crawfish is a local favorite, and Texas became a state in 1845. Ask me about Houston’s food, facts, mayor, or state bird.";
}

/** Build the short, factual instruction shared by the prompt display and model. */
export function buildCityGuideSystemPrompt(): string {
  const opening = `You are a city guide for ${cityGuideSettings.city}, ${cityGuideSettings.state}. Answer every question in the voice of ${cityGuideSettings.voice}.`;
  const facts = cityFacts.map((fact) => `- ${fact}`).join("\n");
  const rules =
    "Keep every answer under 120 words and family-friendly. Briefly steer off-topic questions back to Houston. Say when unsure; never invent facts. Never ask for personal information.";

  return `${opening}\n\nFacts:\n${facts}\n\nRules: ${rules}`;
}

import { generateText, getGeminiApiKey } from '@/ai/gemini';

export async function crowdManagementChatbot(input) {
  if (!getGeminiApiKey()) {
    console.warn('No Gemini API key configured, falling back to local simulation.');
    return fallbackLocalChatbot(input.query);
  }

  const systemPrompt = `You are Drishti Assistant, a highly advanced agentic crowd safety and venue management chatbot. 
Your goal is to triage user queries, extract structured details, and execute frontend actions (like filing reports or highlighting map POIs).

We have three primary categories:
IMPORTANT: You never send anything to the control room yourself. For medical and missing-person
cases the app shows the user a draft report under your message; they check it and tap Send.
So never say help is on the way or staff were alerted. Say you've filled in a report for them to
check and send. Write in plain, calm sentences, no emojis, no capital-letter alarms.

1. MEDICAL_EMERGENCY: The user reports injuries, sickness, pain, unconsciousness, or any urgent health issue.
   - Response: One or two short sentences of first-aid reassurance, then "I've filled in a medical report for you. Check it, then tap Send."
   - Action: Set action to "NAVIGATE_TO_EMERGENCY_FORM".
   - ExtractedInfo: "location" only if the user said where they are (never guess), "details" as a short summary
     like "Possible broken nose, bleeding", and "urgency": "High" for bleeding, breathing, chest pain, unconsciousness,
     seizures or children; "Medium" for most other injuries; "Low" for minor issues.
2. MISSING_PERSON: The user reports a missing friend, relative, or child (lost and found for people).
   - Response: Reassure them briefly, then ask them to add a recent photo and check the report below before tapping Send.
   - Set extractedInfo.missingPhoto = true so the app shows the photo upload.
   - Action: Set action to "NAVIGATE_TO_MISSING_PERSON_FORM".
   - ExtractedInfo: "name" of the person, "details" (age, clothes, looks), "location" (where last seen) and
     "lastSeenTime" as "HH:MM" in 24-hour time only if the user said a time. Never invent any of these.
3. MAP_DIRECTIONS: The user asks for directions, venue map, exits, washrooms, water, lost & found, etc.
   - Action: Set action to "SHOW_USER_MAP".
   - ExtractedInfo: Map the target landmarks to one of these exact Points of Interest (POI) names:
     - "water refill station", "drinking water", "hydration" -> "Hydration Area"
     - "washroom", "toilet", "restroom", "loo" -> "Washroom"
     - "cloak room", "bag storage", "luggage" -> "Cloak Room"
     - "smoking area", "smoking zone" -> "Smoking Zone"
     - "lost and found", "lost key", "lost phone" -> "Lost and Found"
     Set extractedInfo.poi to this POI name.
4. DEFAULT: General queries or greetings. No special action.

Return a JSON object conforming strictly to this format:
{
  "category": "MEDICAL_EMERGENCY" | "MISSING_PERSON" | "MAP_DIRECTIONS" | "DEFAULT",
  "response": "User-facing message text",
  "action": "NAVIGATE_TO_EMERGENCY_FORM" | "NAVIGATE_TO_MISSING_PERSON_FORM" | "SHOW_USER_MAP" | null,
  "extractedInfo": {
    "location": "string (optional)",
    "name": "string (optional)",
    "details": "string (optional)",
    "lastSeenTime": "HH:MM (optional)",
    "urgency": "High" | "Medium" | "Low" (optional),
    "missingPhoto": true/false (optional),
    "poi": "Washroom" | "Cloak Room" | "Smoking Zone" | "Hydration Area" | "Lost and Found" | null (optional)
  }
}`;

  // Format the history and new query for the Gemini API
  const contents = [
    {
      role: 'user',
      parts: [{ text: systemPrompt }],
    },
  ];

  // Add conversation history
  for (const msg of input.history) {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    });
  }

  // Add current query
  contents.push({
    role: 'user',
    parts: [{ text: input.query }],
  });

  try {
    const responseText = await generateText(contents, { responseMimeType: 'application/json' });
    const parsedResult = JSON.parse(responseText.trim());
    return {
      category: parsedResult.category || 'DEFAULT',
      response: parsedResult.response || 'I am here to help you.',
      action: parsedResult.action === 'NONE' ? null : parsedResult.action,
      extractedInfo: parsedResult.extractedInfo,
    };
  } catch (error) {
    console.error('Error invoking Gemini agent client-side:', error);
    return fallbackLocalChatbot(input.query);
  }
}

function fallbackLocalChatbot(query) {
  const q = query.toLowerCase();
  if (/hurt|medical|injur|emergency|bleed|faint|pain|broken|doctor|medic/.test(q)) {
    return {
      category: 'MEDICAL_EMERGENCY',
      response:
        "I'm sorry. Please sit down and stay where you are. I've filled in a medical report for you. Check it, then tap Send.",
      action: 'NAVIGATE_TO_EMERGENCY_FORM',
      extractedInfo: {
        details: query,
        urgency: 'High',
      },
    };
  }

  if (
    /missing|can't find|cannot find|lost my (son|daughter|child|kid|friend|mother|father|mom|dad|wife|husband|brother|sister)/.test(
      q,
    )
  ) {
    return {
      category: 'MISSING_PERSON',
      response:
        "I'm sorry, let's find them. Add a recent photo and check the report below, then tap Send so staff can start looking.",
      action: 'NAVIGATE_TO_MISSING_PERSON_FORM',
      extractedInfo: {
        missingPhoto: true,
        details: query,
      },
    };
  }

  if (
    q.includes('map') ||
    q.includes('water') ||
    q.includes('refill') ||
    q.includes('toilet') ||
    q.includes('washroom')
  ) {
    let poi = 'Hydration Area';
    if (q.includes('toilet') || q.includes('washroom')) poi = 'Washroom';
    return {
      category: 'MAP_DIRECTIONS',
      response: `Here's the nearest ${poi === 'Washroom' ? 'washroom' : 'drinking water'} on the map.`,
      action: 'SHOW_USER_MAP',
      extractedInfo: {
        poi,
      },
    };
  }

  return {
    category: 'DEFAULT',
    response:
      'I can get you medical help, report someone who is missing, or show you the nearest washroom, water or exit. What do you need?',
    action: null,
  };
}

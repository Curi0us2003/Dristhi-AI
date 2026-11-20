import { generateText, getGeminiApiKey } from '@/ai/gemini';

/** Renders the dashboard state as the plain-text brief that is sent to Gemini. */
function buildDataBrief({ guards, alerts, grievances }) {
  const count = (s) => guards.filter((g) => g.status === s).length;

  const alertLines = alerts.length
    ? alerts.map(
        (a) =>
          `- **${a.feed_name}**: ${a.alert_level.toUpperCase()} alert with a count of ${a.current_count}.` +
          (a.recommendations ? ` Recommendation: ${a.recommendations}` : ''),
      )
    : ['- No active alerts. All sectors are operating normally.'];

  const grievanceLines = grievances.length
    ? grievances.map((g) => `- **${g.type}**: "${g.details}" reported by ${g.submittedBy || 'an attendee'}.`)
    : ['- No open grievances from attendees.'];

  const guardLines = guards.length
    ? [
        `- ${guards.length} guards are on duty.`,
        `- Active guards: ${count('Active')}`,
        `- Guards on standby: ${count('Standby')}`,
        `- Guards in alert status: ${count('Alert')}`,
      ]
    : ['- No guard data available.'];

  return [
    '**Active & Predicted Alerts:**',
    ...alertLines,
    '',
    '**Open Grievances:**',
    ...grievanceLines,
    '',
    '**Guard Status:**',
    ...guardLines,
  ].join('\n');
}

/** Generates an AI situational summary of guards, alerts and grievances. */
export async function summarizeDashboard(input) {
  const brief = buildDataBrief(input);

  if (!getGeminiApiKey()) {
    return { summary: `AI key not configured – raw status:\n\n${brief}` };
  }

  const prompt = `You are an AI event command center analyst. Your task is to provide a concise, high-level summary of the current event status based on the data provided.

Focus on the most critical information first. Structure your summary into three sections: Alerts, Grievances, and Guard Status. Use bullet points for readability.

**Current Data:**

${brief}

**Instructions:**
Generate a summary based on the data above. Highlight the most urgent issues first.`;

  try {
    const summary = await generateText([{ role: 'user', parts: [{ text: prompt }] }]);
    return { summary: summary.trim() };
  } catch (error) {
    console.error('AI summary failed, showing raw status instead:', error);
    return { summary: brief };
  }
}

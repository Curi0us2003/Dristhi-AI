import { generateText, getGeminiApiKey } from '@/ai/gemini';

export interface SummarizeDashboardInput {
  guards: Array<{
    id: string;
    name: string;
    sector: string;
    status: 'Active' | 'Alert' | 'Standby';
    phone: string;
  }>;
  alerts: Array<{
    feed_id: string;
    feed_name: string;
    alert_level: 'critical' | 'warning' | 'normal' | 'predicted';
    current_count: number;
    timestamp: string;
    recommendations?: string;
  }>;
  grievances: Array<{
    id: string;
    type: 'Medical Attention' | 'Missing Person' | 'General Grievance';
    details: string;
    submittedAt: { seconds: number; nanoseconds: number };
    status: 'new' | 'resolved';
    submittedBy?: string;
  }>;
}

export interface SummarizeDashboardOutput {
  summary: string;
}

/** Renders the dashboard state as the plain-text brief that is sent to Gemini. */
function buildDataBrief({ guards, alerts, grievances }: SummarizeDashboardInput): string {
  const count = (s: string) => guards.filter((g) => g.status === s).length;

  const alertLines = alerts.length
    ? alerts.map(
        (a) =>
          `- **${a.feed_name}**: ${a.alert_level.toUpperCase()} alert with a count of ${a.current_count}.` +
          (a.recommendations ? ` Recommendation: ${a.recommendations}` : '')
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
    '**Active & Predicted Alerts:**', ...alertLines, '',
    '**Open Grievances:**', ...grievanceLines, '',
    '**Guard Status:**', ...guardLines,
  ].join('\n');
}

/** Generates an AI situational summary of guards, alerts and grievances. */
export async function summarizeDashboard(
  input: SummarizeDashboardInput
): Promise<SummarizeDashboardOutput> {
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

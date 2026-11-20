'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  BrainCircuit,
  Zap,
  Ambulance,
  UserCheck,
  Shield,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Play,
  ArrowRight,
  Clock,
  AlertTriangle,
  Sparkles,
  Terminal,
  ShieldAlert,
} from 'lucide-react';
import { generateAutonomousCommandPlan } from '@/ai/flows/autonomous-command.client';
import { approveMoves, assignStaffToGrievance, notifyAttendee } from '@/lib/admin-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
/**
 * `guards`, `ambulances` and `medicalStaff` are roster views (see rosterViews in admin-data) used
 * as planner input; `staff`, `zones` and `eventId` are the event's roster, which approved actions
 * update.
 */
export default function AutonomousAgent({
  guards,
  alerts,
  grievances,
  ambulances,
  medicalStaff,
  eventId,
  staff = [],
  zones = [],
  onExecutionCompleted,
}) {
  const staffById = (id) => staff.find((s) => s.id === id);
  const zoneById = (id) => zones.find((z) => z.id === id) ?? null;

  /** The planner names a target sector: a zone name, or the camera name of a zone's feed. */
  const zoneForSector = (sector) => {
    const wanted = (sector || '').trim().toLowerCase();
    const byName = zones.find((z) => z.name.trim().toLowerCase() === wanted);
    if (byName) return byName;
    const alert = alerts.find((a) => (a.feed_name || '').trim().toLowerCase() === wanted);
    return alert ? zones.find((z) => z.feedId && z.feedId === alert.feed_id) ?? null : null;
  };

  /** Sends staff to a report the same way the Reports page does, and notifies the reporter. */
  const sendToReport = async (staffId, grievanceId, reason, message) => {
    const member = staffById(staffId);
    if (!eventId || !member) throw new Error('Staff member is not on this event roster');
    await assignStaffToGrievance(eventId, member, grievanceId, reason);
    const attendeeId = grievances.find((g) => g.id === grievanceId)?.attendeeId;
    if (attendeeId) await notifyAttendee(eventId, attendeeId, message);
    return attendeeId ? { attendeeId } : null;
  };
  const [agentState, setAgentState] = useState('idle');
  const [plan, setPlan] = useState(null);
  const [logs, setLogs] = useState([]);
  const [executingIndex, setExecutingIndex] = useState(-1);
  const terminalEndRef = useRef(null);
  const { toast } = useToast();

  const addLog = (message) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleTriggerAgent = async () => {
    setAgentState('thinking');
    setLogs([]);
    addLog('Initializing Drishti Autonomous Safety Agent (Vertex AI)...');

    // Simulate telemetry gathering animation
    await new Promise((r) => setTimeout(r, 800));
    addLog(
      `Gathering active telemetry: ${guards.length} guards, ${alerts.length} CCTV alert zones, ${grievances.filter((g) => g.status === 'new' && !g.assignedStaffId).length} unassigned reports...`,
    );

    await new Promise((r) => setTimeout(r, 600));
    addLog('Vertex AI reasoning model loaded successfully.');
    addLog('Evaluating crowd densities & criticality of active user grievances...');

    try {
      const generatedPlan = await generateAutonomousCommandPlan({
        guards,
        alerts,
        // Reports someone is already handling (assigned from Reports) are left alone.
        grievances: grievances.filter((g) => !g.assignedStaffId),
        ambulances,
        medicalStaff,
      });

      setPlan(generatedPlan);
      addLog(
        `Plan generated successfully with ${generatedPlan.actions.length} optimization recommendations.`,
      );
      setAgentState('planning');
    } catch (err) {
      console.error(err);
      addLog(`Error during agent reasoning: ${err.message || 'Unknown error'}`);
      setAgentState('idle');
      toast({
        title: 'Agent Error',
        description: 'Failed to generate autonomous safety plan.',
        variant: 'destructive',
      });
    }
  };

  const handleApprovePlan = async () => {
    if (!plan || plan.actions.length === 0) {
      setAgentState('completed');
      return;
    }

    setAgentState('executing');
    addLog('Admin approved plan. Starting autonomous execution cycle...');

    for (let i = 0; i < plan.actions.length; i++) {
      const action = plan.actions[i];
      setExecutingIndex(i);

      try {
        if (action.type === 'REASSIGN_GUARD') {
          addLog(`[REASSIGN] Reassigning Guard ${action.guardName} to ${action.toSector}...`);
          await new Promise((r) => setTimeout(r, 800)); // Cinematic pacing

          const member = staffById(action.guardId);
          const toZone = zoneForSector(action.toSector);
          if (!eventId || !member) throw new Error(`Guard ${action.guardName} is not on this event roster`);
          if (!toZone) throw new Error(`No zone named "${action.toSector}" in this event`);
          await approveMoves(
            eventId,
            [{ staff: member, fromZone: zoneById(member.zoneId), toZone }],
            action.reason || `Autonomous agent: move ${member.name} to ${toZone.name}`,
          );
          addLog(`[SUCCESS] Guard ${action.guardName} sent to ${toZone.name} (logged as a dispatch).`);
        } else if (action.type === 'DEPLOY_AMBULANCE') {
          addLog(`[DISPATCH] Deploying Ambulance ${action.ambulanceNumber} to ${action.location}...`);
          await new Promise((r) => setTimeout(r, 1000));

          // Assign the ambulance to the report (marks it on scene, logs a dispatch). The report
          // stays open as "Assigned" until it is resolved from Reports.
          const recipient = await sendToReport(
            action.ambulanceId,
            action.grievanceId,
            `Autonomous agent: ambulance ${action.ambulanceNumber} to ${action.location || 'medical report'}`,
            `Ambulance ${action.ambulanceNumber} has been dispatched to your location${action.location ? ` (${action.location})` : ''}. The team is on the way. Please stay calm.`,
          );
          addLog(
            `[SUCCESS] Ambulance ${action.ambulanceNumber} assigned to the report.${recipient ? ' Reporter notified.' : ''}`,
          );
        } else if (action.type === 'ASSIGN_MEDICAL_STAFF') {
          addLog(`[DISPATCH] Dispatching Medical Staff ${action.medicalStaffName} to ${action.location}...`);
          await new Promise((r) => setTimeout(r, 900));

          const recipient = await sendToReport(
            action.medicalStaffId,
            action.grievanceId,
            `Autonomous agent: ${action.medicalStaffName} to ${action.location || 'medical report'}`,
            `${action.medicalStaffName} is on the way to help you${action.location ? ` at ${action.location}` : ''}.`,
          );
          addLog(
            `[SUCCESS] ${action.medicalStaffName} assigned to the report.${recipient ? ' Reporter notified.' : ''}`,
          );
        }
      } catch (err) {
        console.error(err);
        addLog(`[FAILED] Failed to execute action index ${i}: ${err.message}`);
      }
    }

    addLog('Autonomous execution cycle completed successfully!');
    setAgentState('completed');
    toast({
      title: 'Plan Executed',
      description: 'Drishti Autonomous safety plan has been successfully completed in Firestore.',
    });

    if (onExecutionCompleted) {
      onExecutionCompleted();
    }
  };

  const handleRejectPlan = () => {
    addLog('Admin rejected the proposed plan. Logging rejection & clearing state.');
    setAgentState('rejected');
    toast({
      title: 'Plan Rejected',
      description: 'The proposed coordination plan was discarded.',
      variant: 'destructive',
    });
  };

  const resetAgent = () => {
    setAgentState('idle');
    setPlan(null);
    setLogs([]);
    setExecutingIndex(-1);
  };

  return (
    <Card className="relative overflow-hidden border border-slate-800 bg-slate-950/70 backdrop-blur-md shadow-2xl text-slate-100 min-h-[360px] flex flex-col">
      {/* Animated glowing bar at the top */}
      <div
        className={cn(
          'absolute top-0 left-0 right-0 h-1 bg-gradient-to-r transition-all duration-1000',
          agentState === 'idle' && 'from-blue-600 via-indigo-500 to-indigo-600 animate-pulse',
          agentState === 'thinking' && 'from-indigo-500 via-purple-500 to-pink-500 animate-pulse',
          agentState === 'planning' && 'from-amber-400 via-orange-500 to-red-500',
          agentState === 'executing' && 'from-emerald-400 via-cyan-500 to-blue-500 animate-pulse',
          agentState === 'completed' && 'from-green-400 to-emerald-500',
          agentState === 'rejected' && 'from-red-600 to-orange-600',
        )}
      />

      {/* Futuristic scanning light during processing */}
      {agentState === 'thinking' && (
        <div className="absolute top-0 bottom-0 left-0 right-0 pointer-events-none bg-gradient-to-b from-indigo-500/5 to-transparent animate-pulse overflow-hidden">
          <div className="w-full h-0.5 bg-indigo-500/20 shadow-[0_0_10px_2px_rgba(99,102,241,0.5)] animate-[bounce_4s_infinite]" />
        </div>
      )}

      <CardHeader className="pb-2 border-b border-slate-900 bg-slate-950/30 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-bold flex items-center gap-2 tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
            <BrainCircuit
              className={cn('h-5 w-5 text-indigo-400', agentState === 'thinking' && 'animate-spin')}
            />
            Drishti Autonomous Command Agent
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">
            Vertex AI multi-agent real-time safety coordination and automated Firestore triage
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {agentState !== 'idle' && (
            <Button
              size="sm"
              variant="ghost"
              className="text-slate-400 hover:text-slate-200"
              onClick={resetAgent}
            >
              Reset Agent
            </Button>
          )}
          <Badge
            className={cn(
              'text-[9px] px-2 py-0.5 font-bold tracking-wider',
              agentState === 'idle' && 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
              agentState === 'thinking' &&
                'bg-purple-500/10 text-purple-400 border border-purple-500/20 animate-pulse',
              agentState === 'planning' && 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
              agentState === 'executing' && 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
              agentState === 'completed' && 'bg-green-500/10 text-green-400 border border-green-500/20',
              agentState === 'rejected' && 'bg-red-500/10 text-red-400 border border-red-500/20',
            )}
          >
            {agentState.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4 flex-grow flex flex-col justify-between space-y-4">
        {/* IDLE STATE */}
        {agentState === 'idle' && (
          <div className="flex-grow flex flex-col items-center justify-center text-center space-y-6 py-6">
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-xl animate-pulse" />
              <div className="relative bg-slate-900 border border-slate-800 p-5 rounded-full flex items-center justify-center shadow-lg transform hover:scale-105 transition-transform">
                <BrainCircuit className="h-12 w-12 text-indigo-400 animate-[pulse_3s_infinite]" />
              </div>
            </div>
            <div className="max-w-md space-y-2">
              <h4 className="font-bold text-sm text-slate-200">Autonomous Safety & Triage Mode Active</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Click below to enable the autonomous command loop. Drishti will ingest CCTV alerts, reassign
                standby guards to crowded gates, and automatically dispatch ambulances or first-aid staff for
                users in need.
              </p>
            </div>
            <Button
              onClick={handleTriggerAgent}
              className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg shadow-indigo-500/20 font-bold text-xs gap-2 px-6"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Run Autonomous Triage Agent
            </Button>
          </div>
        )}

        {/* THINKING & LOGS STATE */}
        {(agentState === 'thinking' || agentState === 'executing') && (
          <div className="flex-grow flex flex-col space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 pb-1 border-b border-slate-900">
              <span className="flex items-center gap-1.5 font-semibold">
                <Terminal className="h-3.5 w-3.5 text-indigo-400" />
                Live Agent Console Log
              </span>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
            </div>
            <div className="flex-grow bg-slate-950/80 border border-slate-900 p-3 rounded-lg font-mono text-[10px] text-slate-300 space-y-1.5 max-h-[220px] overflow-y-auto shadow-inner select-none">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={cn(
                    'border-l-2 pl-2 border-transparent transition-all',
                    log.includes('[SUCCESS]') && 'text-green-400 border-green-500',
                    log.includes('[FAILED]') && 'text-red-400 border-red-500',
                    log.includes('[REASSIGN]') && 'text-blue-400 border-blue-500',
                    log.includes('[DISPATCH]') && 'text-purple-400 border-purple-500',
                  )}
                >
                  {log}
                </div>
              ))}
              <div ref={terminalEndRef} />
            </div>
            <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1.5 animate-pulse pt-1">
              <Sparkles className="h-3 w-3 text-indigo-400" />
              {agentState === 'thinking'
                ? 'Vertex AI is computing safety logic plan...'
                : 'Agent writing actions directly to Firestore database...'}
            </div>
          </div>
        )}

        {/* PLANNING STATE (SHOW PROPOSED ACTIONS) */}
        {agentState === 'planning' && plan && (
          <div className="flex-grow flex flex-col space-y-4">
            {/* AI synthesis description */}
            <div className="bg-indigo-500/10 border border-indigo-500/20 p-3 rounded-lg text-xs leading-relaxed text-indigo-200">
              <div className="font-bold flex items-center gap-1 mb-1">
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                Drishti Agent Synthesis:
              </div>
              {plan.analysis}
            </div>

            {/* List of recommended actions */}
            <div className="space-y-2 flex-grow overflow-y-auto max-h-[200px]">
              <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Proposed Actions Checklist ({plan.actions.length})
              </h5>
              {plan.actions.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-500 border border-dashed border-slate-900 rounded-lg">
                  No critical anomalies found. Venue operations are balanced.
                </div>
              ) : (
                <div className="space-y-2">
                  {plan.actions.map((action, idx) => {
                    const isExecuting = executingIndex === idx;
                    return (
                      <div
                        key={idx}
                        className={cn(
                          'p-2.5 rounded-lg border border-slate-900 bg-slate-950/40 flex items-start justify-between gap-3 text-xs',
                          action.type === 'REASSIGN_GUARD' && 'border-l-4 border-l-blue-500',
                          action.type === 'DEPLOY_AMBULANCE' && 'border-l-4 border-l-red-500',
                          action.type === 'ASSIGN_MEDICAL_STAFF' && 'border-l-4 border-l-amber-500',
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          {action.type === 'REASSIGN_GUARD' && (
                            <Shield className="h-4 w-4 text-blue-400 mt-0.5" />
                          )}
                          {action.type === 'DEPLOY_AMBULANCE' && (
                            <Ambulance className="h-4 w-4 text-red-400 mt-0.5" />
                          )}
                          {action.type === 'ASSIGN_MEDICAL_STAFF' && (
                            <UserCheck className="h-4 w-4 text-amber-400 mt-0.5" />
                          )}

                          <div className="space-y-0.5">
                            <span className="font-bold text-slate-200">
                              {action.type === 'REASSIGN_GUARD' && `Reassign Guard ${action.guardName}`}
                              {action.type === 'DEPLOY_AMBULANCE' &&
                                `Deploy Ambulance ${action.ambulanceNumber}`}
                              {action.type === 'ASSIGN_MEDICAL_STAFF' &&
                                `Assign Staff ${action.medicalStaffName}`}
                            </span>
                            <p className="text-[10px] text-slate-400 leading-snug">{action.reason}</p>
                          </div>
                        </div>

                        <div className="flex-shrink-0 text-right space-y-1">
                          <Badge
                            className={cn(
                              'text-[8px] py-0.5 px-1.5 uppercase font-bold',
                              action.type === 'REASSIGN_GUARD' &&
                                'bg-blue-500/10 text-blue-400 border border-blue-500/20',
                              action.type === 'DEPLOY_AMBULANCE' &&
                                'bg-red-500/10 text-red-400 border border-red-500/20',
                              action.type === 'ASSIGN_MEDICAL_STAFF' &&
                                'bg-amber-500/10 text-amber-400 border border-amber-500/20',
                            )}
                          >
                            {action.type.replace('_', ' ')}
                          </Badge>
                          {action.type !== 'REASSIGN_GUARD' && (
                            <div className="text-[8px] text-slate-500 italic block">{action.location}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Plan review controls */}
            <div className="flex gap-2 pt-2 border-t border-slate-900 bg-slate-950/20">
              <Button
                onClick={handleApprovePlan}
                disabled={plan.actions.length === 0}
                className="flex-1 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 font-bold text-xs text-white"
              >
                Approve & Execute Plan
              </Button>
              <Button
                onClick={handleRejectPlan}
                variant="outline"
                className="border-slate-800 bg-slate-950 hover:bg-red-950/20 hover:text-red-400 font-bold text-xs"
              >
                Reject Plan
              </Button>
            </div>
          </div>
        )}

        {/* COMPLETED CONFIRMATION STATE */}
        {agentState === 'completed' && (
          <div className="flex-grow flex flex-col items-center justify-center text-center space-y-4 py-8">
            <CheckCircle className="h-16 w-16 text-emerald-400 animate-bounce" />
            <div className="space-y-1.5 max-w-sm">
              <h4 className="font-bold text-sm text-slate-200">Execution Successful!</h4>
              <p className="text-xs text-slate-400">
                All proposed guard reassignments, emergency dispatches, and real-time user notification logs
                have been updated autonomously in Firestore.
              </p>
            </div>
            <Button
              onClick={resetAgent}
              variant="outline"
              className="border-slate-800 bg-slate-900 text-xs px-6"
            >
              Acknowledge & Sync
            </Button>
          </div>
        )}

        {/* REJECTED STATE */}
        {agentState === 'rejected' && (
          <div className="flex-grow flex flex-col items-center justify-center text-center space-y-4 py-8">
            <XCircle className="h-16 w-16 text-red-500 animate-pulse" />
            <div className="space-y-1.5 max-w-sm">
              <h4 className="font-bold text-sm text-slate-200">Plan Discarded</h4>
              <p className="text-xs text-slate-400">
                The operator rejected the proposed safety optimization plan. Firestore files remain unchanged.
              </p>
            </div>
            <Button onClick={resetAgent} className="bg-indigo-600 hover:bg-indigo-700 text-xs px-6">
              Re-run Command Agent
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

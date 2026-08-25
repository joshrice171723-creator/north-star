import React from 'react';
import { LoaderCircle, Pause, Play, RotateCcw, MessageCircle, ExternalLink } from 'lucide-react';

const stageLabel = (stage) => ({
  target: 'Target',
  researching: 'Researching',
  preparing_documents: 'Preparing documents',
  ready: 'Ready to apply',
  opening: 'Opening employer application',
  applying: 'Filling and reviewing',
  awaiting_email: 'Awaiting employer confirmation',
  needs_user_answer: 'Needs your answer',
  failed: 'Needs retry',
  blocked: 'Blocked',
  applied: 'Applied',
})[stage] || String(stage || 'Queued').replaceAll('_', ' ');

export default function ApplicationQueueDrawer({
  status,
  currentApplicationId,
  starting = false,
  onStart,
  onPause,
  onOpenJob,
  onAnswer,
  onRetry,
}) {
  const queue = Array.isArray(status?.queue) ? status.queue : [];
  const activeId = status?.activeApplicationId || currentApplicationId;
  const canStart = Boolean(queue.find((entry) => entry.applicationId === currentApplicationId)?.canStart || status?.counts?.eligible || status?.counts?.preparable);
  return <section className="assistant-queue-drawer" aria-live="polite">
    <div className="assistant-queue-heading">
      <div>
        <span className="eyebrow">APPLICATION QUEUE</span>
        <b>{status?.paused ? 'Paused' : status?.activeStep || 'Ready to continue'}</b>
      </div>
      <span className={`assistant-queue-status${status?.activeApplicationId ? ' active' : ''}`}>
        {status?.activeApplicationId ? <LoaderCircle size={12} /> : null}
        {status?.activeApplicationId ? 'Now working' : `${status?.counts?.total || queue.length} jobs`}
      </span>
    </div>
    {status?.message && <p className="assistant-queue-message">{status.message}</p>}
    <div className="assistant-queue-controls">
      <button className="primary" disabled={starting || !canStart} onClick={() => onStart?.(currentApplicationId)}>
        <Play size={13} /> {starting ? 'Starting workflow…' : 'Start application workflow'}
      </button>
      <button className="secondary" disabled={status?.paused && !status?.activeApplicationId} onClick={onPause}>
        <Pause size={13} /> Pause
      </button>
    </div>
    <div className="assistant-queue-counts">
      <span><b>{status?.counts?.preparable || 0}</b> to prepare</span>
      <span><b>{status?.counts?.eligible || 0}</b> ready</span>
      <span><b>{status?.counts?.needsUserAnswer || 0}</b> need answers</span>
      <span><b>{status?.counts?.failed || 0}</b> failed</span>
    </div>
    <div className="assistant-queue-list">
      {queue.length ? queue.map((entry) => {
        const active = entry.applicationId === activeId;
        const needsAnswer = entry.stage === 'needs_user_answer' || entry.automationState === 'needs_user_answer';
        const retryable = entry.stage === 'failed' || entry.automationState === 'failed' || entry.automationCheckpoint?.answerReadyForRetry === true;
        return <div className={`assistant-queue-row${active ? ' active' : ''}`} key={entry.applicationId || entry.jobId}>
          <button className="assistant-queue-job" onClick={() => onOpenJob?.(entry)}>
            <span>{entry.company || 'Unknown employer'} — {entry.roleTitle || 'Untitled role'}</span>
            <small>{stageLabel(entry.stage || entry.automationState)}{entry.activeStep ? ` · ${entry.activeStep}` : ''}{entry.pauseReason ? ` · ${entry.pauseReason}` : ''}</small>
          </button>
          {needsAnswer && <button className="secondary assistant-queue-action" onClick={() => onAnswer?.(entry)}><MessageCircle size={12} /> Answer</button>}
          {retryable && <button className="secondary assistant-queue-action" onClick={() => onRetry?.(entry)}><RotateCcw size={12} /> Retry</button>}
          {entry.stage === 'ready' && <button className="secondary assistant-queue-action" onClick={() => onOpenJob?.(entry)}><ExternalLink size={12} /> Open</button>}
        </div>;
      }) : <small className="assistant-queue-empty">No application workflow jobs are waiting.</small>}
    </div>
  </section>;
}

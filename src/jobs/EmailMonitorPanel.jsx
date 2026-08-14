import React, { useEffect, useMemo, useState } from 'react';
import { Ban, BriefcaseBusiness, CircleAlert, Mail, Search, X } from 'lucide-react';

export default function EmailMonitorPanel({ jobs = [] }) {
  const [source, setSource] = useState({ configured: false, email: '' });
  const [emails, setEmails] = useState([]);
  const [blockedSenders, setBlockedSenders] = useState([]);
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [includeBlocked, setIncludeBlocked] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [savedSource, savedEmails, blocked] = await Promise.all([
      window.desktopShell?.getEmailSource?.(),
      window.desktopShell?.listJobEmails?.({ jobOnly: true, includeExcluded, includeBlocked, limit: 50 }),
      window.desktopShell?.listBlockedJobEmailSenders?.(),
    ]);
    if (savedSource) setSource(savedSource);
    setEmails(savedEmails || []);
    setBlockedSenders(blocked || []);
  };
  useEffect(() => { load().catch((cause) => setMessage(cause?.message || 'Could not load email monitor.')); }, [includeExcluded, includeBlocked]);

  const sync = async () => { setBusy(true); try { const result = await window.desktopShell?.syncJobEmails?.(); setMessage(result?.message || `Synced ${result?.imported || 0} messages.`); await load(); } catch (cause) { setMessage(cause?.message || 'Could not sync Gmail.'); } finally { setBusy(false); } };
  const markSeen = async (email) => { try { const updated = await window.desktopShell?.markJobEmailSeen?.({ emailId: email.id }); setEmails((current) => current.map((entry) => entry.id === email.id ? updated : entry)); setSelectedEmail(updated); } catch (cause) { setMessage(cause?.message || 'Could not mark email as seen.'); } };
  const setExcluded = async (email, excluded) => { setBusy(true); try { await window.desktopShell?.setJobEmailExcluded?.({ emailId: email.id, excluded }); setSelectedEmail(null); await load(); setMessage(excluded ? 'Email excluded as not relevant.' : 'Email restored.'); } catch (cause) { setMessage(cause?.message || 'Could not update email relevance.'); } finally { setBusy(false); } };
  const setJob = async (emailId, jobId) => { if (!jobId) return; setBusy(true); try { await window.desktopShell?.linkJobEmail?.({ emailId, jobId }); await load(); } catch (cause) { setMessage(cause?.message || 'Could not link email.'); } finally { setBusy(false); } };
  const blockSender = async (sender) => { setBusy(true); try { await window.desktopShell?.blockJobEmailSender?.({ senderKey: sender.senderKey, sender: sender.sender }); setSelectedEmail(null); await load(); setMessage(`Blocked ${sender.sender || sender.senderKey}.`); } catch (cause) { setMessage(cause?.message || 'Could not block sender.'); } finally { setBusy(false); } };
  const unblockSender = async (sender) => { setBusy(true); try { await window.desktopShell?.unblockJobEmailSender?.({ senderKey: sender.senderKey }); await load(); } catch (cause) { setMessage(cause?.message || 'Could not restore sender.'); } finally { setBusy(false); } };
  const senderGroups = useMemo(() => [...emails.reduce((groups, email) => { const key = email.senderKey || email.sender || 'unknown-sender'; const group = groups.get(key) || { senderKey: key, sender: email.sender || 'Unknown sender', emails: [] }; group.emails.push(email); groups.set(key, group); return groups; }, new Map()).values()], [emails]);

  return <section className="job-source-settings email-monitor">
    <div><span className="eyebrow">EMAIL INTELLIGENCE · LOCAL RAG</span><h3>Monitor job-related email</h3><p>Messages are grouped by sender. New messages and messages without a pipeline job are called out clearly.</p></div>
    <div className="job-source-actions"><span>{source.configured ? `Connected: ${source.email || 'Gmail'}` : 'Not connected'}</span><button className="secondary" onClick={sync} disabled={busy || !source.configured}>Sync now</button><button className="secondary" onClick={() => setIncludeExcluded((value) => !value)}>{includeExcluded ? 'Hide excluded' : 'Show excluded'}</button><button className="secondary" onClick={() => setIncludeBlocked((value) => !value)}>{includeBlocked ? 'Hide blocked' : 'Show blocked'}</button></div>
    <div className="email-rag-search"><label className="board-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={async (event) => { if (event.key === 'Enter') setResults(query.trim() ? await window.desktopShell?.searchJobEmails?.(query, 10) : []); }} placeholder="Search indexed job email…" /></label><button className="secondary" onClick={async () => setResults(query.trim() ? await window.desktopShell?.searchJobEmails?.(query, 10) : [])}>Search context</button></div>
    {message && <small className="job-source-message">{message}</small>}
    {blockedSenders.length > 0 && <div className="email-blocked-list"><b>Blocked senders</b>{blockedSenders.map((sender) => <span key={sender.senderKey}>{sender.sender}<button className="secondary" disabled={busy} onClick={() => unblockSender(sender)}>Restore</button></span>)}</div>}
    <div className="email-rag-results">{results.map((result) => <article key={result.id}><b>{result.subject || '(No subject)'}</b><small>{result.sender} · {result.receivedAt || 'Date unknown'}</small><p>{result.content}</p></article>)}{senderGroups.map((group) => <section className="email-sender-group" key={group.senderKey}><header className="email-sender-head"><div><b><Mail size={14} /> {group.sender}</b><small>{group.emails.length} message{group.emails.length === 1 ? '' : 's'}</small></div><div className="email-statuses">{group.emails.some((email) => !email.isSeen) && <span className="email-status email-status-new"><CircleAlert size={13} /> New</span>}{group.emails.some((email) => !(email.linkedJobIds || []).length) && <span className="email-status email-status-unassigned"><BriefcaseBusiness size={13} /> Unassigned</span>}<button className="secondary" disabled={busy} onClick={() => blockSender(group)}><Ban size={13} /> Block sender</button></div></header>{group.emails.map((email) => <article className={`email-link-card${email.isExcluded ? ' email-excluded' : ''}`} key={email.id}><button className="email-open-button" onClick={() => markSeen(email)}><b>{email.subject || '(No subject)'}</b><small>{email.sender} · {email.received_at || 'Date unknown'}</small></button><div className="email-link-actions">{!email.isSeen && <span className="email-message-new"><CircleAlert size={12} /> Not seen</span>}{!(email.linkedJobIds || []).length && <span className="email-message-unassigned"><BriefcaseBusiness size={12} /> Not assigned</span>}<select aria-label={`Link ${email.subject || 'email'} to pipeline job`} defaultValue="" disabled={busy || !jobs.length || email.isExcluded} onChange={(event) => { setJob(email.id, event.target.value); event.target.value = ''; }}><option value="">{jobs.length ? 'Link to pipeline job…' : 'Add a pipeline job first'}</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.company} — {job.roleTitle}</option>)}</select><button className="secondary" disabled={busy} onClick={() => setExcluded(email, !email.isExcluded)}>{email.isExcluded ? 'Restore' : 'Not relevant'}</button></div></article>)}</section>)}{!results.length && !senderGroups.length && <small>Sync Gmail to index job-related messages.</small>}</div>
    {selectedEmail && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedEmail(null); }}><article className="email-detail-modal" role="dialog" aria-modal="true"><div className="job-modal-head"><div><span className="eyebrow">EMAIL DETAIL</span><h2>{selectedEmail.subject || '(No subject)'}</h2></div><button className="close" aria-label="Close email" onClick={() => setSelectedEmail(null)}><X size={18} /></button></div><div className="email-detail-body">{selectedEmail.body || '(This email has no text content.)'}</div><div className="job-modal-foot"><button className="secondary" disabled={busy} onClick={() => setExcluded(selectedEmail, !selectedEmail.isExcluded)}>{selectedEmail.isExcluded ? 'Restore' : 'Not relevant'}</button><button className="secondary" disabled={busy} onClick={() => blockSender(selectedEmail)}><Ban size={13} /> Block sender</button><button className="primary" onClick={() => setSelectedEmail(null)}>Close</button></div></article></div>}
  </section>;
}

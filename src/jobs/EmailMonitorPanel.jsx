import React, { useEffect, useMemo, useState } from 'react';
import { Ban, BriefcaseBusiness, CircleAlert, Mail, Search } from 'lucide-react';

const readableEmailBody = (body) => {
  const source = String(body || '');
  if (!/<\/?[a-z][\s\S]*>/i.test(source) || typeof DOMParser === 'undefined') return source;
  const document = new DOMParser().parseFromString(source, 'text/html');
  document.querySelectorAll('script,style,noscript,template').forEach((node) => node.remove());
  return (document.body.innerText || document.body.textContent || source).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
};

const needsReview = (email) => !email.isExcluded && (!email.isSeen || !(email.linkedJobIds || []).length);
const isAssigned = (email) => !email.isExcluded && (email.linkedJobIds || []).length > 0;

export default function EmailMonitorPanel({ jobs = [] }) {
  const [source, setSource] = useState({ configured: false, email: '' });
  const [emails, setEmails] = useState([]);
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [view, setView] = useState('review');
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [savedSource, savedEmails] = await Promise.all([
      window.desktopShell?.getEmailSource?.(),
      window.desktopShell?.listJobEmails?.({ jobOnly: true, includeExcluded, limit: 50 }),
    ]);
    if (savedSource) setSource(savedSource);
    setEmails(savedEmails || []);
  };
  useEffect(() => { load().catch((cause) => setMessage(cause?.message || 'Could not load email monitor.')); }, [includeExcluded]);

  const sync = async () => { setBusy(true); try { const result = await window.desktopShell?.syncJobEmails?.(); setMessage(result?.message || `Synced ${result?.imported || 0} messages.`); await load(); } catch (cause) { setMessage(cause?.message || 'Could not sync Gmail.'); } finally { setBusy(false); } };
  const connect = async () => { setBusy(true); try { const saved = await window.desktopShell?.connectGmail?.(); setSource(saved || { configured: false, email: '' }); setMessage('Gmail connected. Read-only sync runs every 10 minutes while the app is open.'); } catch (cause) { setMessage(cause?.message || 'Could not connect Gmail.'); } finally { setBusy(false); } };
  const markSeen = async (email) => { try { const updated = await window.desktopShell?.markJobEmailSeen?.({ emailId: email.id }); setEmails((current) => current.map((entry) => entry.id === email.id ? updated : entry)); setSelectedEmail(updated); } catch (cause) { setMessage(cause?.message || 'Could not mark email as seen.'); } };
  const setExcluded = async (email, excluded) => { setBusy(true); try { await window.desktopShell?.setJobEmailExcluded?.({ emailId: email.id, excluded }); setSelectedEmail(null); await load(); setMessage(excluded ? 'Email excluded as not relevant.' : 'Email restored.'); } catch (cause) { setMessage(cause?.message || 'Could not update email relevance.'); } finally { setBusy(false); } };
  const setJob = async (emailId, jobId) => { if (!jobId) return; setBusy(true); try { await window.desktopShell?.linkJobEmail?.({ emailId, jobId }); await load(); } catch (cause) { setMessage(cause?.message || 'Could not link email.'); } finally { setBusy(false); } };
  const blockSender = async (sender) => { setBusy(true); try { await window.desktopShell?.blockJobEmailSender?.({ senderKey: sender.senderKey, sender: sender.sender }); setSelectedEmail(null); await load(); setMessage(`Blocked ${sender.sender || sender.senderKey}.`); } catch (cause) { setMessage(cause?.message || 'Could not block sender.'); } finally { setBusy(false); } };
  const viewEmails = useMemo(() => view === 'assigned' ? emails.filter(isAssigned) : view === 'not-relevant' ? emails.filter((email) => email.isExcluded) : emails.filter(needsReview), [emails, view]);
  const senderGroups = useMemo(() => [...viewEmails.reduce((groups, email) => { const key = email.senderKey || email.sender || 'unknown-sender'; const group = groups.get(key) || { senderKey: key, sender: email.sender || 'Unknown sender', emails: [] }; group.emails.push(email); groups.set(key, group); return groups; }, new Map()).values()], [viewEmails]);
  const counts = { review: emails.filter(needsReview).length, assigned: emails.filter(isAssigned).length, 'not-relevant': emails.filter((email) => email.isExcluded).length };

  return <section className="job-source-settings email-monitor">
    <div><span className="eyebrow">EMAIL INTELLIGENCE - LOCAL RAG</span><h3>Monitor job-related email</h3><p>Messages are grouped by sender. Use the sections to focus on email that still needs a decision.</p></div>
    <div className="job-source-actions"><span>{source.configured ? `Connected: ${source.email || 'Gmail'}` : 'Not connected'}</span><button className="secondary" onClick={connect} disabled={busy}>{busy ? 'Working...' : 'Sign in with Google'}</button><button className="secondary" onClick={sync} disabled={busy || !source.configured}>Sync now</button><button className="secondary" onClick={() => setIncludeExcluded((value) => !value)}>{includeExcluded ? 'Hide not relevant' : 'Include not relevant'}</button></div>
    <div className="email-monitor-tabs" role="tablist" aria-label="Email monitor sections">{[['review', 'Needs review'], ['assigned', 'Assigned'], ['not-relevant', 'Not relevant']].map(([value, label]) => <button key={value} role="tab" aria-selected={view === value} className={view === value ? 'active' : ''} onClick={() => setView(value)}>{label}<span>{counts[value]}</span></button>)}</div>
    <div className="email-rag-search"><label className="board-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={async (event) => { if (event.key === 'Enter') setResults(query.trim() ? await window.desktopShell?.searchJobEmails?.(query, 10) : []); }} placeholder="Search indexed job email..." /></label><button className="secondary" onClick={async () => setResults(query.trim() ? await window.desktopShell?.searchJobEmails?.(query, 10) : [])}>Search context</button></div>
    {message && <small className="job-source-message">{message}</small>}
    <div className="email-rag-results">{results.map((result) => <article key={result.id}><b>{result.subject || '(No subject)'}</b><small>{result.sender} - {result.receivedAt || 'Date unknown'}</small><p>{result.content}</p></article>)}{senderGroups.map((group) => <section className="email-sender-group" key={group.senderKey}><header className="email-sender-head"><div><b><Mail size={14} /> {group.sender}</b><small>{group.emails.length} message{group.emails.length === 1 ? '' : 's'}</small></div><div className="email-statuses">{group.emails.some((email) => !email.isSeen) && <span className="email-status email-status-new"><CircleAlert size={13} /> New</span>}{group.emails.some((email) => !(email.linkedJobIds || []).length) && <span className="email-status email-status-unassigned"><BriefcaseBusiness size={13} /> Unassigned</span>}<button className="secondary" disabled={busy} onClick={() => blockSender(group)}><Ban size={13} /> Block sender</button></div></header>{group.emails.map((email) => <article className={`email-link-card${email.isExcluded ? ' email-excluded' : ''}`} key={email.id}><button className="email-open-button" aria-expanded={selectedEmail?.id === email.id} onClick={() => markSeen(email)}><b>{email.subject || '(No subject)'}</b><small>{email.sender} - {email.received_at || 'Date unknown'}</small></button>{selectedEmail?.id === email.id && <div className="email-inline-body"><div className="email-detail-body">{readableEmailBody(email.body) || '(This email has no text content.)'}</div><div className="email-inline-actions"><button className="secondary" disabled={busy} onClick={() => setExcluded(email, !email.isExcluded)}>{email.isExcluded ? 'Restore' : 'Not relevant'}</button><button className="secondary" disabled={busy} onClick={() => blockSender(email)}><Ban size={13} /> Block sender</button></div></div>}<div className="email-link-actions">{!email.isSeen && <span className="email-message-new"><CircleAlert size={12} /> Not seen</span>}{!(email.linkedJobIds || []).length && <span className="email-message-unassigned"><BriefcaseBusiness size={12} /> Not assigned</span>}<select aria-label={`Link ${email.subject || 'email'} to pipeline job`} defaultValue="" disabled={busy || !jobs.length || email.isExcluded} onChange={(event) => { setJob(email.id, event.target.value); event.target.value = ''; }}><option value="">{jobs.length ? 'Link to pipeline job...' : 'Add a pipeline job first'}</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.company} - {job.roleTitle}</option>)}</select><button className="secondary" disabled={busy} onClick={() => setExcluded(email, !email.isExcluded)}>{email.isExcluded ? 'Restore' : 'Not relevant'}</button></div></article>)}</section>)}{!results.length && !senderGroups.length && <small>{view === 'review' ? 'No email needs review.' : view === 'assigned' ? 'No assigned email.' : 'No not-relevant email.'}</small>}</div>
  </section>;
}

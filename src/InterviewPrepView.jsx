import React, { useEffect, useMemo, useState } from 'react';
import { Brain, Check, Clock3, Filter, Flame, RotateCcw, Sparkles, Target } from 'lucide-react';
import './interviewPrep.css';

const fundamentals = [
  { id: 'story', title: 'Tell a clear story', prompt: 'Walk through a meaningful problem you solved. What was the situation, what did you do, and what changed?', cue: 'Use Situation → Action → Result, then name what you learned.' },
  { id: 'tradeoff', title: 'Explain a tradeoff', prompt: 'Describe a decision where you had to balance speed, quality, risk, or stakeholder needs.', cue: 'State the constraints first, then explain why your choice fit them.' },
  { id: 'role-fit', title: 'Connect your experience', prompt: 'Why is this role the right next step for you, and what evidence supports that claim?', cue: 'Connect one concrete achievement to the role’s likely priorities.' },
  { id: 'questions', title: 'Ask useful questions', prompt: 'What would you want to learn from the interviewer before deciding whether this team is a fit?', cue: 'Ask about priorities, success measures, constraints, and collaboration.' }
];

const generalCards = [
  ['What is your strongest example of ownership?', 'Frame the context, the decision you owned, the result, and what you would repeat or change.'],
  ['Tell me about a difficult stakeholder conversation.', 'Show how you listened, made the disagreement concrete, and moved toward a decision.'],
  ['What would you do in your first 30 days?', 'Start with learning the users, goals, constraints, and existing signals before proposing changes.']
].map(([front, back], index) => ({ id: `general-${index}`, front, back }));

const clean = (value) => String(value || '').trim();

export default function InterviewPrepView({ jobs = [] }) {
  const [records, setRecords] = useState([]);
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('loading');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ratings, setRatings] = useState(() => { try { return JSON.parse(localStorage.getItem('north-star-interview-ratings') || '{}'); } catch { return {}; } });
  const [mock, setMock] = useState({ active: false, index: 0, remaining: 45, response: '', selfRating: null, completed: false });
  const [fundamentalsDone, setFundamentalsDone] = useState(() => { try { return JSON.parse(localStorage.getItem('north-star-interview-fundamentals') || '{}'); } catch { return {}; } });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const applications = await window.desktopShell?.listJobApplications?.() || [];
        const loaded = await Promise.all(applications.map(async (application) => {
          const [answers, applicationEvents] = await Promise.all([
            window.desktopShell?.listJobApplicationAnswers?.(application.id) || [],
            window.desktopShell?.listJobApplicationEvents?.(application.id) || []
          ]);
          const job = jobs.find((candidate) => candidate.id === application.jobId) || {};
          return {
            application,
            job,
            answers: (answers || []).filter((answer) => answer.normalizedCategory === 'interview_question').map((answer) => ({ ...answer, jobId: application.jobId, jobTitle: job.roleTitle || 'Saved interview question', company: job.company || 'General preparation' })),
            events: (applicationEvents || []).filter((event) => event.eventType === 'interview_simulation_completed')
          };
        }));
        if (!cancelled) { setRecords(loaded.flatMap((entry) => entry.answers)); setEvents(loaded.flatMap((entry) => entry.events)); setStatus('ready'); }
      } catch (cause) { if (!cancelled) setStatus(cause?.message || 'Could not load interview preparation.'); }
    })();
    return () => { cancelled = true; };
  }, [jobs]);

  useEffect(() => { try { localStorage.setItem('north-star-interview-ratings', JSON.stringify(ratings)); } catch { /* best-effort local progress */ } }, [ratings]);
  useEffect(() => { try { localStorage.setItem('north-star-interview-fundamentals', JSON.stringify(fundamentalsDone)); } catch { /* best-effort local progress */ } }, [fundamentalsDone]);
  useEffect(() => {
    if (!mock.active) return undefined;
    const timer = window.setInterval(() => setMock((current) => current.remaining > 1 ? { ...current, remaining: current.remaining - 1 } : { ...current, active: false, completed: true, remaining: 0 }), 1000);
    return () => window.clearInterval(timer);
  }, [mock.active]);

  const sources = useMemo(() => [...new Set(records.map((record) => record.company).filter(Boolean))], [records]);
  const visibleRecords = useMemo(() => records.filter((record) => (!query || `${record.questionText} ${record.answerText} ${record.jobTitle} ${record.company}`.toLowerCase().includes(query.toLowerCase())) && (sourceFilter === 'all' || record.company === sourceFilter)), [records, query, sourceFilter]);
  const cards = useMemo(() => (visibleRecords.length ? visibleRecords.map((record) => ({ id: record.id, front: record.questionText, back: record.answerText || 'Add your answer or talking points from the question library.' })) : generalCards), [visibleRecords]);
  const card = cards[cardIndex % cards.length];
  const weakAreas = useMemo(() => fundamentals.map((item) => ({ ...item, score: fundamentalsDone[item.id] ? 100 : Math.min(100, Math.round((records.filter((record) => record.answerText).length / Math.max(1, records.length)) * 60)) })).filter((item) => item.score < 100), [fundamentalsDone, records]);
  const mockPrompt = fundamentals[mock.index % fundamentals.length];

  const rateCard = (rating) => { setRatings((current) => ({ ...current, [card.id]: rating })); setFlipped(false); setCardIndex((current) => (current + 1) % cards.length); };
  const startMock = () => setMock({ active: true, index: 0, remaining: 45, response: '', selfRating: null, completed: false });
  const nextMock = () => setMock((current) => ({ ...current, index: current.index + 1, remaining: 45, response: '', selfRating: null, completed: current.index >= fundamentals.length - 1 }));
  const completion = fundamentals.filter((item) => fundamentalsDone[item.id]).length;

  return <section className="interview-prep-view">
    <div className="interview-prep-intro"><div><span className="eyebrow">CAREER · INTERVIEW PREPARATION</span><h1>Build confidence before the conversation.</h1><p>One independent place for questions, practice, and the areas that need another pass. Job context stays attached when it exists.</p></div><div className="interview-prep-score"><strong>{completion}/{fundamentals.length}</strong><small>fundamentals practiced</small></div></div>
    {status !== 'ready' && <div className="job-search-status">{status === 'loading' ? 'Loading saved preparation…' : status}</div>}
    <div className="interview-prep-grid">
      <section className="interview-prep-panel interview-library"><div className="panel-heading"><div><span className="eyebrow">1 · QUESTION LIBRARY</span><h2>Questions across your pipeline</h2><p>{records.length ? `${records.length} saved question${records.length === 1 ? '' : 's'} with job context.` : 'Your saved job questions will appear here as you build application work.'}</p></div><Filter size={18}/></div><div className="interview-filters"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search questions, answers, or roles…" aria-label="Search interview questions" /><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} aria-label="Filter interview questions by company"><option value="all">All sources</option>{sources.map((source) => <option key={source}>{source}</option>)}</select></div>{visibleRecords.length ? <div className="interview-library-list">{visibleRecords.map((record) => <article key={record.id}><div><b>{record.questionText}</b><small>{record.company} · {record.jobTitle}</small></div><span className={record.answerText ? 'answer-ready' : ''}>{record.answerText ? 'Notes ready' : 'Needs notes'}</span></article>)}</div> : <div className="interview-empty"><Brain size={20}/><b>{records.length ? 'No questions match these filters.' : 'Start with general practice below.'}</b><span>When you save interview questions inside a job workspace, they are collected here automatically.</span></div>}</section>
      <section className="interview-prep-panel interview-flashcard-panel"><div className="panel-heading"><div><span className="eyebrow">2 · FLASHCARD STUDY</span><h2>Recall, reveal, rate</h2><p>{visibleRecords.length ? 'Study the filtered question set.' : 'A general deck keeps the flow useful before any job questions are saved.'}</p></div><span className="card-count">{Object.keys(ratings).length} rated</span></div><button className={`central-flashcard${flipped ? ' flipped' : ''}`} onClick={() => setFlipped((current) => !current)}><small>{flipped ? 'YOUR NOTES / ANSWER' : 'QUESTION'}</small><strong>{flipped ? card.back : card.front}</strong><em>{flipped ? 'Rate your confidence below' : 'Click to reveal'}</em></button><div className="flashcard-ratings"><button onClick={() => rateCard('again')}>Again</button><button onClick={() => rateCard('hard')}>Hard</button><button className="primary" onClick={() => rateCard('ready')}>Ready</button></div></section>
      <section className="interview-prep-panel interview-mock-panel"><div className="panel-heading"><div><span className="eyebrow">3 · MOCK INTERVIEW</span><h2>Timed prompt rehearsal</h2><p>Answer out loud or in the box, then self-assess before moving on.</p></div><Clock3 size={18}/></div>{mock.active || mock.completed ? <><div className="mock-prompt"><div><small>PROMPT {Math.min(mock.index + 1, fundamentals.length)} / {fundamentals.length}</small><h3>{mockPrompt.prompt}</h3></div><b className={mock.remaining < 10 ? 'time-warning' : ''}>{mock.remaining}s</b></div><textarea value={mock.response} onChange={(event) => setMock((current) => ({ ...current, response: event.target.value }))} placeholder="Capture the answer you would say…" rows="4" /> <div className="mock-actions"><span>Self-assessment:</span>{[1, 2, 3, 4, 5].map((value) => <button className={mock.selfRating === value ? 'selected' : ''} key={value} onClick={() => setMock((current) => ({ ...current, selfRating: value }))}>{value}</button>)}<button className="secondary" onClick={nextMock}>{mock.index >= fundamentals.length - 1 ? 'Finish' : 'Next prompt'}</button></div></> : <div className="mock-start"><Target size={24}/><b>Four prompts · 45 seconds each</b><span>Practice a story, a tradeoff, role fit, and your questions for the interviewer.</span><button className="primary" onClick={startMock}>Start mock interview</button></div>}</section>
      <section className="interview-prep-panel interview-study-panel"><div className="panel-heading"><div><span className="eyebrow">4 · TARGETED STUDY PLAN</span><h2>Work the weak areas</h2><p>Use your ratings and completed fundamentals to choose the next useful rep.</p></div><Flame size={18}/></div><div className="study-plan-list">{weakAreas.length ? weakAreas.map((item) => <button key={item.id} onClick={() => setFundamentalsDone((current) => ({ ...current, [item.id]: true }))}><span><b>{item.title}</b><small>{item.cue}</small></span><em>{item.score}%</em><Check size={15}/></button>) : <div className="study-complete"><Check size={18}/> All fundamentals practiced. Keep a light review cadence.</div>}</div><small className="study-history">{events.length ? `${events.length} job simulation result${events.length === 1 ? '' : 's'} found in your history.` : 'No job simulation results yet; this plan works independently of a selected job.'}</small></section>
      <section className="interview-prep-panel interview-fundamentals-panel"><div className="panel-heading"><div><span className="eyebrow">5 · INTERVIEW FUNDAMENTALS</span><h2>Practice the essentials</h2><p>Short, repeatable reps for any interview format.</p></div><Sparkles size={18}/></div><div className="fundamentals-list">{fundamentals.map((item) => <article className={fundamentalsDone[item.id] ? 'done' : ''} key={item.id}><div><b>{item.title}</b><p>{item.prompt}</p></div><button className="secondary" onClick={() => setFundamentalsDone((current) => ({ ...current, [item.id]: !current[item.id] }))}>{fundamentalsDone[item.id] ? <><RotateCcw size={13}/> Review again</> : <><Check size={13}/> Mark practiced</>}</button></article>)}</div></section>
    </div>
  </section>;
}

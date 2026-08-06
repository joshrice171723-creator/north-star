import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen, Brain, Check, ChevronDown, ChevronRight, ExternalLink, FileText, Flame, LayoutDashboard, ListChecks, Play, Search, Settings, Target, X } from 'lucide-react';
import './styles.css';

const examFacts = [
  ['Exam code', 'CCAR-P'], ['Questions', '63 questions'], ['Duration', '120 minutes'],
  ['Question types', 'Multiple-choice & multiple-response'], ['Passing score', '720 / 1,000 scaled score'],
  ['Exam fee', '$175 USD'], ['Delivery', 'Online proctored or Pearson VUE test center'], ['Validity', '12 months']
];

const examDomains = [
  ['Integration', 19], ['Solution Design & Architecture', 17], ['Evaluation, Testing & Optimization', 16],
  ['Governance, Safety & Risk Management', 14], ['Stakeholder Communication & Lifecycle Management', 14],
  ['Claude Models, Prompting & Context Engineering', 13], ['Developer Productivity & Operational Enablement', 7]
];
const domainBlueprint = examDomains.map(([label, weight], index) => ({ id: `domain-${index + 1}`, label, weight }));

const STATUS_LABELS = ['Not started', 'In progress', 'Complete', 'Skipped / already experienced'];
const item = (id, title, type, meta = {}, children = []) => ({ id, title, type, status: 'Not started', children, ...meta });
const numbered = (prefix, count, type) => Array.from({ length: count }, (_, index) => item(`${prefix}-${index + 1}`, `${type === 'lecture' ? 'Lecture' : 'Quiz'} ${String(index + 1).padStart(2, '0')}`, type));
const flattenItems = (items) => items.flatMap((entry) => [entry, ...flattenItems(entry.children || [])]);
const getStatus = (entry) => entry.children?.length ? (entry.children.every((child) => child.status === 'Complete') ? 'Complete' : entry.children.some((child) => child.status !== 'Not started') ? 'In progress' : 'Not started') : entry.status;
const getProgress = (entry) => entry.children?.length ? Math.round(entry.children.filter((child) => child.status === 'Complete').length / entry.children.length * 100) : (getStatus(entry) === 'Complete' || getStatus(entry) === 'Skipped / already experienced' ? 100 : getStatus(entry) === 'In progress' ? 50 : 0);
const updateEntries = (items, id, status) => items.map((entry) => entry.id === id ? { ...entry, status } : { ...entry, children: updateEntries(entry.children || [], id, status) });

const curriculum = [
  { id: 'recommended', title: 'Official recommended preparation', accent: '#f08b68', type: 'official-recommended', note: 'Recommended preparation only. Anthropic does not make course order or completion mandatory.', lessons: [
    item('claude-101', 'Claude 101', 'course', { duration: 'Course', academyUrl: 'https://anthropic.skilljar.com/claude-101', domainIds: ['domain-6'] }),
    item('ai-fluency', 'AI Fluency: Framework & Foundations', 'course', { duration: 'Course', academyUrl: 'https://anthropic.skilljar.com/ai-fluency-framework-foundations', domainIds: ['domain-5', 'domain-6'] }),
    item('ai-capabilities', 'AI Capabilities and Limitations', 'course', { duration: 'Course', academyUrl: 'https://anthropic.skilljar.com/ai-capabilities-and-limitations', domainIds: ['domain-4', 'domain-6'] }),
    item('claude-api', 'Building with the Claude API', 'course', { duration: '84 lectures · 10 quizzes', academyUrl: 'https://anthropic.skilljar.com/claude-with-the-anthropic-api', domainIds: ['domain-1', 'domain-6', 'domain-7'], note: 'Anthropic displayed total: 84 lectures and 10 quizzes. Public section counts total 87 lectures; both figures are shown because they differ.' }),
    item('mcp-intro', 'Introduction to Model Context Protocol', 'course', { duration: '16 lectures · 1 quiz', academyUrl: 'https://anthropic.skilljar.com/introduction-to-model-context-protocol', domainIds: ['domain-1', 'domain-6'] }),
    item('claude-code', 'Claude Code in Action', 'course', { duration: 'Course', academyUrl: 'https://anthropic.skilljar.com/claude-code-in-action', domainIds: ['domain-7'] })
  ]},
  { id: 'professional-prep', title: 'Official Professional Prep Course', accent: '#7d9edc', type: 'professional-prep', note: 'Official Professional Prep Course · 733 minutes total (approximately 12 hours 13 minutes).', lessons: [
    item('platform-design', 'Claude Platform & Solution Design', 'module', { duration: '238 min', domainIds: ['domain-2', 'domain-3'] }),
    item('enterprise-production', 'Enterprise Integration & Production', 'module', { duration: '158 min', domainIds: ['domain-1', 'domain-4'] }),
    item('responsible-ai', 'Responsible AI, Safety & Risk for Architects', 'module', { duration: '114 min', domainIds: ['domain-4'] }),
    item('stakeholder-lifecycle', 'Stakeholder Engagement, Lifecycle & GTM', 'module', { duration: '178 min', domainIds: ['domain-5'] }),
    item('team-enablement', 'Team Enablement & Operational Productivity', 'module', { duration: '45 min', domainIds: ['domain-7', 'domain-5'] })
  ]},
  { id: 'supplemental', title: 'Official supplemental preparation', accent: '#b394df', type: 'supplemental', note: 'Optional preparation. Platform branches are not required Professional-path steps.', lessons: [
    item('mcp-advanced', 'Model Context Protocol: Advanced Topics', 'course', { duration: '15 lectures · 2 quizzes · ~1.1 hr', academyUrl: 'https://anthropic.skilljar.com/model-context-protocol-advanced-topics', domainIds: ['domain-1', 'domain-6'], note: 'Lecture names are unavailable until authenticated course access. Numbered placeholders preserve the public count without inventing titles.' }, [...numbered('mcp-advanced-lecture', 15, 'lecture'), ...numbered('mcp-advanced-quiz', 2, 'quiz')]),
    item('bedrock', 'Claude with Amazon Bedrock', 'course', { duration: '85 lectures · 10 quizzes', academyUrl: 'https://anthropic.skilljar.com/claude-in-amazon-bedrock', domainIds: ['domain-1'], note: 'Optional platform specialization' }),
    item('google-cloud', 'Claude on Google Cloud', 'course', { duration: '85 lectures · 10 quizzes', academyUrl: 'https://anthropic.skilljar.com/claude-with-google-vertex', domainIds: ['domain-1'], note: 'Optional platform specialization' })
  ]},
  { id: 'practice', title: 'App-created practice', accent: '#72b997', type: 'practice', note: 'Practice created by this app, not official Anthropic Academy content or official exam questions.', lessons: [
    item('practice-solution', 'Solution design scenarios', 'practice', { duration: 'Practice set' }),
    item('practice-integration', 'Integration scenarios', 'practice', { duration: 'Practice set' }),
    item('practice-evaluation', 'Evaluation and optimization drills', 'practice', { duration: 'Practice set' }),
    item('practice-governance', 'Governance and safety drills', 'practice', { duration: 'Practice set' }),
    item('practice-stakeholder', 'Stakeholder/lifecycle drills', 'practice', { duration: 'Practice set' }),
    item('practice-cross-domain', 'Cross-domain scenarios', 'practice', { duration: 'Practice set' }),
    item('practice-mock', 'Full mock exam', 'practice', { duration: 'Practice set' })
  ]}
];

const prompts = ['Explain this lesson simply', 'Quiz me on what I studied', 'Give me an architecture scenario'];
const STORAGE_KEY = 'claude-architect-study-workspace-v1';
const defaultExpanded = { recommended: true, 'professional-prep': true, supplemental: false, practice: false };
const practiceDrills = [
  { id: 'drill-integration', title: 'Integration boundary drill', domainIds: ['domain-1'], prompt: 'A team needs Claude to summarize support tickets while keeping customer records in its own systems. Which design choice best preserves a clear integration boundary?', options: ['Send the full customer database to the model on every request.', 'Use a controlled service boundary that retrieves only the relevant fields and logs the request.', 'Let each client call the model directly with a shared production key.'], answer: 1, rationale: 'A controlled boundary limits data exposure, centralizes policy, and makes the integration observable.' },
  { id: 'drill-solution-design', title: 'Solution design trade-off', domainIds: ['domain-2', 'domain-3'], prompt: 'A production team wants to improve answer quality without changing the model immediately. What is the strongest first step?', options: ['Define representative test cases and measure the current system against them.', 'Remove all safety checks so the model can be more creative.', 'Tune prompts based only on the last user complaint.'], answer: 0, rationale: 'Representative evaluation cases establish a baseline and make optimization decisions evidence-based.' },
  { id: 'drill-governance', title: 'Governance and risk drill', domainIds: ['domain-4'], prompt: 'Before deploying a high-impact workflow, which activity most directly supports responsible operation?', options: ['Document risk owners, escalation paths, and monitoring signals.', 'Assume the vendor handles every downstream risk.', 'Disable logging to reduce operational overhead.'], answer: 0, rationale: 'Clear ownership, escalation, and monitoring make risk controls actionable after launch.' },
  { id: 'drill-stakeholder', title: 'Stakeholder lifecycle drill', domainIds: ['domain-5'], prompt: 'A stakeholder asks why an AI workflow should be piloted before broad rollout. What is the best response?', options: ['A pilot creates a feedback loop to validate outcomes, adoption, and operational fit.', 'Pilots are required for every Anthropic product.', 'A pilot guarantees the system will pass the certification exam.'], answer: 0, rationale: 'Pilots reduce rollout risk and create evidence for iteration with the people who use and govern the system.' },
  { id: 'drill-context', title: 'Context engineering drill', domainIds: ['domain-6'], prompt: 'A long-running assistant receives inconsistent results because its context grows without structure. What should the team try first?', options: ['Add every prior message forever.', 'Define a deliberate context strategy with relevant retrieval, structure, and limits.', 'Randomly change the model temperature after each response.'], answer: 1, rationale: 'A deliberate context strategy keeps information relevant, structured, and within operational limits.' },
  { id: 'drill-operations', title: 'Operational enablement drill', domainIds: ['domain-7'], prompt: 'What most helps developers operate a Claude-powered feature consistently?', options: ['A shared runbook covering deployment, observability, rollback, and ownership.', 'A single undocumented local script.', 'Avoiding version control for prompts and configuration.'], answer: 0, rationale: 'A shared runbook turns operational knowledge into a repeatable team capability.' }
];

const readSavedState = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
};
const restoreModules = (savedModules) => {
  if (!Array.isArray(savedModules)) return curriculum;
  const saved = new Map(flattenItems(savedModules).map((entry) => [entry.id, entry.status]));
  const restore = (items) => items.map((entry) => ({ ...entry, status: saved.get(entry.id) || entry.status, children: restore(entry.children || []) }));
  return curriculum.map((module) => ({ ...module, lessons: restore(module.lessons) }));
};

const getCommandCenterSnapshot = ({ current, completed, total, progress, readinessOverall, reviewQueue, practiceQueue, captures, studyMaterials, studyReviews }) => {
  const needsReview = studyMaterials.filter((material) => studyReviews?.[material.id]?.status === 'Needs review').length;
  const unreviewed = studyMaterials.filter((material) => !studyReviews?.[material.id] || studyReviews[material.id].status === 'Not reviewed').length;
  return {
    current,
    completion: { completed, total, progress },
    readiness: readinessOverall,
    nextActions: [
      ...reviewQueue.slice(0, 5).map((lesson) => ({ id: `lesson:${lesson.id}`, kind: 'lesson', label: lesson.title, detail: `${getStatus(lesson)} · ${lesson.duration}`, item: lesson })),
      ...studyMaterials.filter((material) => studyReviews?.[material.id]?.status === 'Needs review').slice(0, 3).map((material) => ({ id: `flashcard:${material.id}`, kind: 'flashcard', label: material.sourceTitle || 'Academy flashcard', detail: 'Needs review', item: material })),
      ...practiceQueue.slice(0, 3).map((drill) => ({ id: `practice:${drill.id}`, kind: 'practice', label: drill.title, detail: 'App-created practice', item: drill }))
    ].slice(0, 8),
    counts: { remainingOfficial: reviewQueue.length, practice: practiceQueue.length, captures: captures.length, materials: studyMaterials.length, needsReview, unreviewed }
  };
};

function App() {
  const savedState = useMemo(readSavedState, []);
  const [modules, setModules] = useState(() => restoreModules(savedState?.modules));
  const [activeLesson, setActiveLesson] = useState(() => savedState?.activeLesson || 'platform-design');
  const [view, setView] = useState(() => ['overview', 'curriculum', 'practice', 'command-center'].includes(savedState?.view) ? savedState.view : 'command-center');
  const [expanded, setExpanded] = useState(() => ({ ...defaultExpanded, ...(savedState?.expanded || {}) }));
  const [notes, setNotes] = useState(() => savedState?.notes || '');
  const [practiceResults, setPracticeResults] = useState(() => savedState?.practiceResults || {});
  const [activeDrillId, setActiveDrillId] = useState(() => savedState?.activeDrillId || practiceDrills[0].id);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [curriculumQuery, setCurriculumQuery] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [captureState, setCaptureState] = useState({ status: 'idle', message: '' });
  const [captures, setCaptures] = useState([]);
  const [captureQuery, setCaptureQuery] = useState('');
  const [selectedCaptureId, setSelectedCaptureId] = useState(null);
  const [selectedCaptureIds, setSelectedCaptureIds] = useState([]);
  const [studyMaterials, setStudyMaterials] = useState([]);
  const [studyReviews, setStudyReviews] = useState({});
  const appRef = useRef(null);
  const splitterRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const allLessons = useMemo(() => modules.flatMap((m) => flattenItems(m.lessons)), [modules]);
  const officialLessons = allLessons.filter((lesson) => lesson.type !== 'practice');
  const current = allLessons.find((lesson) => lesson.id === activeLesson) || allLessons[0];
  const reviewQueue = useMemo(() => officialLessons
    .filter((lesson) => !['Complete', 'Skipped / already experienced'].includes(getStatus(lesson)))
    .sort((a, b) => ({ 'In progress': 0, 'Not started': 1 }[getStatus(a)] - ({ 'In progress': 0, 'Not started': 1 }[getStatus(b)]))), [officialLessons]);
  const readiness = useMemo(() => domainBlueprint.map((domain) => {
    const mapped = officialLessons.filter((lesson) => lesson.domainIds?.includes(domain.id));
    const assessed = mapped.filter((lesson) => getStatus(lesson) !== 'Skipped / already experienced');
    const evidence = assessed.length ? Math.round(assessed.reduce((sum, lesson) => sum + ({ Complete: 100, 'In progress': 50, 'Not started': 0 }[getStatus(lesson)] || 0), 0) / assessed.length) : null;
    return { ...domain, mapped, evidence };
  }), [officialLessons]);
  const readinessOverall = useMemo(() => {
    const assessed = readiness.filter((domain) => domain.evidence !== null);
    return assessed.length ? Math.round(assessed.reduce((sum, domain) => sum + domain.evidence * domain.weight, 0) / assessed.reduce((sum, domain) => sum + domain.weight, 0)) : null;
  }, [readiness]);
  const normalizedQuery = curriculumQuery.trim().toLowerCase();
  const visibleModules = useMemo(() => modules.map((module) => ({ ...module, lessons: module.lessons.filter((lesson) => !normalizedQuery || `${module.title} ${module.note || ''} ${lesson.title} ${lesson.type} ${lesson.note || ''}`.toLowerCase().includes(normalizedQuery)) })).filter((module) => module.lessons.length), [modules, normalizedQuery]);
  const completed = officialLessons.filter((lesson) => getStatus(lesson) === 'Complete' || getStatus(lesson) === 'Skipped / already experienced').length;
  const progress = Math.round((completed / officialLessons.length) * 100);
  const selectedCapture = captures.find((capture) => capture.id === selectedCaptureId) || captures[0] || null;
  const visibleCaptures = useMemo(() => {
    const query = captureQuery.trim().toLowerCase();
    return captures.filter((capture) => !query || `${capture.pageTitle} ${capture.sourceUrl} ${capture.courseLessonId || ''} ${capture.contentType} ${capture.content}`.toLowerCase().includes(query));
  }, [captures, captureQuery]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ modules, activeLesson, view, expanded, notes, practiceResults, activeDrillId })); } catch { /* local persistence is best-effort */ }
  }, [modules, activeLesson, view, expanded, notes, practiceResults, activeDrillId]);

  const updateStatus = (id, status) => setModules((items) => items.map((m) => ({ ...m, lessons: updateEntries(m.lessons, id, status) })));
  const openReviewItem = (lesson) => {
    const module = modules.find((entry) => flattenItems(entry.lessons).some((item) => item.id === lesson.id));
    setActiveLesson(lesson.id);
    setCurriculumQuery('');
    setExpanded((currentExpanded) => module ? { ...currentExpanded, [module.id]: true } : currentExpanded);
    setView('curriculum');
  };
  const openAcademyCourse = (lesson) => {
    if (lesson?.academyUrl) window.desktopShell?.navigateAcademy?.(lesson.academyUrl);
  };
  const captureAcademyPage = async () => {
    if (!window.desktopShell?.captureAcademyPage) {
      setCaptureState({ status: 'error', message: 'Academy capture is unavailable in this runtime.' });
      return;
    }
    setCaptureState({ status: 'busy', message: 'Reading the currently displayed Academy page…' });
    const result = await window.desktopShell.captureAcademyPage();
    setCaptureState(result?.ok
      ? { status: 'success', message: `Captured “${result.capture.pageTitle || 'Academy page'}” (${result.capture.contentLength} characters).` }
      : { status: 'error', message: result?.error || 'Academy capture failed safely.' });
    if (result?.ok) {
      const loaded = await window.desktopShell.getAcademyCaptures();
      if (loaded?.ok) { setCaptures(loaded.captures); setSelectedCaptureId(result.capture.id); }
    }
  };
  const loadCaptures = async () => {
    if (!window.desktopShell?.getAcademyCaptures) return;
    const result = await window.desktopShell.getAcademyCaptures();
    if (result?.ok) { setCaptures(result.captures); if (!selectedCaptureId && result.captures[0]) setSelectedCaptureId(result.captures[0].id); }
    else setCaptureState({ status: 'error', message: result?.error || 'Could not load captured Academy pages.' });
  };
  const deleteSelectedCapture = async () => {
    if (!selectedCapture) return;
    const result = await window.desktopShell?.deleteAcademyCapture?.(selectedCapture.id);
    if (result?.ok) { setCaptures(result.captures); setSelectedCaptureId(result.captures[0]?.id || null); setSelectedCaptureIds((ids) => ids.filter((id) => id !== selectedCapture.id)); setCaptureState({ status: 'success', message: 'Capture deleted from the local Academy library.' }); }
    else setCaptureState({ status: 'error', message: result?.error || 'Capture deletion failed safely.' });
  };
  const loadStudyMaterials = async () => {
    const result = await window.desktopShell?.getAcademyStudyMaterials?.();
    if (result?.ok) setStudyMaterials(result.materials);
    const reviews = await window.desktopShell?.getAcademyStudyReviews?.();
    if (reviews?.ok) setStudyReviews(reviews.reviews || {});
  };
  const generateFlashcards = async () => {
    if (!selectedCaptureIds.length) { setCaptureState({ status: 'error', message: 'Select one or more saved captures first.' }); return; }
    const result = await window.desktopShell?.generateAcademyFlashcards?.(selectedCaptureIds);
    if (result?.ok) { setStudyMaterials(result.materials); setCaptureState({ status: 'success', message: `Generated ${selectedCaptureIds.length} deterministic flashcard${selectedCaptureIds.length === 1 ? '' : 's'} from selected captures.` }); }
    else setCaptureState({ status: 'error', message: result?.error || 'Flashcard generation failed safely.' });
  };
  const deleteStudyMaterial = async (id) => {
    const result = await window.desktopShell?.deleteAcademyStudyMaterial?.(id);
    if (result?.ok) { setStudyMaterials(result.materials); setCaptureState({ status: 'success', message: 'Generated flashcard deleted.' }); }
    else setCaptureState({ status: 'error', message: result?.error || 'Flashcard deletion failed safely.' });
  };
  useEffect(() => { if (view === 'command-center' || view === 'captures' || view === 'materials') { loadCaptures(); loadStudyMaterials(); } }, [view]);
  const activeDrill = practiceDrills.find((drill) => drill.id === activeDrillId) || practiceDrills[0];
  const practiceQueue = practiceDrills.filter((drill) => !practiceResults[drill.id]);
  const commandCenter = useMemo(() => getCommandCenterSnapshot({ current, completed, total: officialLessons.length, progress, readinessOverall, reviewQueue, practiceQueue, captures, studyMaterials, studyReviews }), [current, completed, officialLessons.length, progress, readinessOverall, reviewQueue, practiceQueue, captures, studyMaterials, studyReviews]);
  const submitDrill = () => {
    if (selectedAnswer === null) return;
    setPracticeResults((results) => ({ ...results, [activeDrill.id]: { answer: selectedAnswer, correct: selectedAnswer === activeDrill.answer, completedAt: new Date().toISOString() } }));
  };
  const selectNextDrill = () => { const next = practiceQueue.find((drill) => drill.id !== activeDrill.id) || practiceDrills.find((drill) => drill.id !== activeDrill.id) || activeDrill; setActiveDrillId(next.id); setSelectedAnswer(null); };
  const setNotesOpen = (open) => { setShowNotes(open); window.desktopShell?.setAcademyVisible?.(!open); };
  const syncAcademyBounds = useCallback(() => {
    if (!appRef.current || !splitterRef.current) return;
    const appRect = appRef.current.getBoundingClientRect();
    const splitterRect = splitterRef.current.getBoundingClientRect();
    window.desktopShell?.setAcademyBounds?.({ x: splitterRect.right - appRect.left, width: appRect.right - splitterRect.right });
  }, []);
  useEffect(() => { const observer = new ResizeObserver(syncAcademyBounds); if (appRef.current) observer.observe(appRef.current); syncAcademyBounds(); return () => observer.disconnect(); }, [syncAcademyBounds]);
  useEffect(() => {
    if (!dragging) return undefined;
    const move = (event) => { const appRect = appRef.current?.getBoundingClientRect(); if (!appRect) return; const academyWidth = Math.max(320, Math.min(appRect.width - 210 - 260, appRect.right - event.clientX)); appRef.current.style.setProperty('--academy-width', `${academyWidth}px`); syncAcademyBounds(); };
    const stop = () => setDragging(false); window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop); document.body.classList.add('is-resizing');
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); document.body.classList.remove('is-resizing'); };
  }, [dragging, syncAcademyBounds]);

  return <div className="app" ref={appRef}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon">✦</div><div><b>Claude Architect</b><small>Professional certification</small></div></div>
      <div className="nav-label">WORKSPACE</div>
      <nav>
        <button className={view === 'command-center' ? 'nav active' : 'nav'} onClick={() => setView('command-center')}><ListChecks size={17}/> Command center</button>
        <button className={view === 'overview' ? 'nav active' : 'nav'} onClick={() => setView('overview')}><LayoutDashboard size={17}/> Overview</button>
        <button className={view === 'curriculum' ? 'nav active' : 'nav'} onClick={() => setView('curriculum')}><BookOpen size={17}/> Curriculum <em>{completed}/{officialLessons.length}</em></button>
        <button className="nav" onClick={() => setNotesOpen(true)}><FileText size={17}/> My notes</button>
        <button className={view === 'practice' ? 'nav active' : 'nav'} onClick={() => setView('practice')}><Brain size={17}/> Practice</button>
      </nav>
      <div className="path-card"><div className="path-symbol"><Target size={16}/></div><div><b>CCAR-P</b><small>Claude Certified Architect</small></div><ChevronRight size={15}/></div>
      <div className="sidebar-footer"><button className="nav"><Settings size={17}/> Settings</button><div className="profile"><div className="avatar">J</div><div><b>Josh</b><small>Professional path</small></div></div></div>
    </aside>

    <main className="main">
      <header><div className="crumb">CCAR-P <ChevronRight size={14}/> <b>{view === 'command-center' ? 'Command center' : view === 'curriculum' ? 'Curriculum' : view === 'practice' ? 'Practice' : 'Study workspace'}</b></div><div className="header-actions"><div className="streak"><Target size={15}/> Focused study workspace</div></div></header>
      <div className="main-scroll">
        <section className="hero"><div><span className="eyebrow">CLAUDE CERTIFICATION</span><h1>Claude Certified Architect – Professional <span>✦</span></h1><p>Build toward CCAR-P with official preparation, supplemental study, and clearly labeled app practice.</p></div><div className="progress"><strong>{progress}%</strong><small>official learning completion</small></div></section>
        <section className="stats"><div className="stat"><label>OFFICIAL LEARNING COMPLETION</label><b>{completed}/{officialLessons.length} items</b><div className="bar"><i style={{ width: `${progress}%` }} /></div><small>Courses, modules, lectures, and quizzes · exam readiness is separate</small></div><div className="stat"><label>ESTIMATED EXAM READINESS</label><b>{readinessOverall === null ? 'Not assessed' : `${readinessOverall}% evidence`}</b><small>App-derived estimate · not an official passing prediction</small></div><div className="stat"><label>PREREQUISITES</label><b>None required</b><small>Courses are recommended, not mandatory</small></div></section>
        {view === 'command-center' && <section className="command-center"><div className="command-intro"><div><span className="eyebrow">LEARNING COMMAND CENTER</span><h2>Know what matters next.</h2><p>A read-only coordination layer over your existing curriculum, review, practice, notes, and Academy study data.</p></div><button className="primary" onClick={() => openReviewItem(commandCenter.nextActions[0]?.item || current)}><Play size={15}/> Continue learning</button></div><div className="command-grid"><button className="command-card" onClick={() => setView('curriculum')}><BookOpen size={20}/><label>OFFICIAL COMPLETION</label><b>{progress}%</b><small>{completed}/{officialLessons.length} items complete or skipped</small></button><button className="command-card" onClick={() => setView('overview')}><Target size={20}/><label>READINESS EVIDENCE</label><b>{readinessOverall === null ? 'Not assessed' : `${readinessOverall}%`}</b><small>App-derived estimate, not a passing prediction</small></button><button className="command-card" onClick={() => setView('practice')}><Brain size={20}/><label>PRACTICE BACKLOG</label><b>{commandCenter.counts.practice}</b><small>App-created drills remaining</small></button><button className="command-card" onClick={() => setNotesOpen(true)}><FileText size={20}/><label>PERSONAL NOTES</label><b>{notes.trim() ? 'Active' : 'Ready'}</b><small>{notes.trim() ? `${notes.trim().length} characters saved locally` : 'Capture your next insight'}</small></button></div><section className="command-panel"><div className="section-head compact"><div><h2>Next actions</h2><p>Prioritized from existing state; opening this list never changes progress.</p></div><span className="queue-count">{commandCenter.nextActions.length} shown</span></div>{commandCenter.nextActions.length ? <div className="command-actions">{commandCenter.nextActions.map((action) => <button className="command-action" key={action.id} onClick={() => action.kind === 'lesson' ? openReviewItem(action.item) : action.kind === 'practice' ? setView('practice') : setView('command-center')}><span className="review-icon"><Play size={13}/></span><span><b>{action.label}</b><small>{action.detail}</small></span><ChevronRight size={16}/></button>)}</div> : <div className="review-empty"><Check size={18}/> Nothing needs attention right now.</div>}</section><div className="command-foot"><span><b>{commandCenter.counts.captures}</b> saved Academy captures</span><span><b>{commandCenter.counts.materials}</b> generated flashcards</span><span><b>{commandCenter.counts.unreviewed}</b> unreviewed cards</span><span><b>{commandCenter.counts.needsReview}</b> cards needing review</span></div></section>}
        {view === 'overview' && <><section className="practice-card"><Target size={22}/><h2>CCAR-P exam overview</h2><p><b>Claude Certified Architect – Professional</b> · Passing score 720 on a 100–1,000 scaled score · $175 USD · Online proctored or Pearson VUE test center · Credential valid for 12 months.</p><div className="exam-facts">{examFacts.map(([label, value]) => <div key={label}><label>{label}</label><b>{value}</b></div>)}</div><p><b>No mandatory prerequisites or required courses.</b> Recommended preparation helps build context; readiness is not represented by course completion alone.</p></section><section className="readiness-card"><div className="readiness-heading"><div><span className="eyebrow">ESTIMATED APP READINESS</span><h2>Exam-domain readiness</h2><p>Transparent evidence from official curriculum statuses. This is an estimate, not an official passing prediction.</p></div><div className="readiness-total">{readinessOverall === null ? 'Not assessed' : `${readinessOverall}%`}<small>weighted evidence</small></div></div><div className="readiness-list">{readiness.map((domain) => <div className="readiness-row" key={domain.id}><div className="readiness-label"><b>{domain.label}</b><span>{domain.weight}% exam weight · {domain.mapped.length} mapped official item{domain.mapped.length === 1 ? '' : 's'}</span></div><strong>{domain.evidence === null ? 'Not assessed' : `${domain.evidence}%`}</strong><div className="readiness-bar"><i style={{ width: `${domain.evidence || 0}%` }}/></div></div>)}</div><div className="readiness-method"><b>How the estimate is formed</b><span>Complete = 100% evidence · In progress = 50% · Not started = 0% · Skipped items are excluded. Course completion changes evidence only; it never marks a domain mastered.</span></div></section></>}
        {view !== 'command-center' && <>
          <div className="section-head"><div><h2>{view === 'curriculum' ? 'Official curriculum & practice' : 'Continue learning'}</h2><p>Use this focused workspace to move through the certification path, track progress, and study alongside Anthropic Academy.</p></div>{view !== 'curriculum' && <button className="link" onClick={() => setView('curriculum')}>View full curriculum <ChevronRight size={15}/></button>}</div>
          <section className="lesson-card"><div className="lesson-art"><BookOpen size={27}/><span>01</span></div><div className="lesson-copy"><label>{current.type === 'practice' ? 'APP-CREATED PRACTICE' : current.title.toUpperCase()}</label><h3>{current.title}</h3><p>{current.note || 'Official course or module metadata is shown without inventing lecture titles.'}</p><small><Play size={13}/> {current.duration} &nbsp; · &nbsp; {current.type === 'practice' ? 'App practice' : 'Anthropic preparation'}</small></div>{current.academyUrl ? <button className="academy-hint academy-launch" onClick={() => openAcademyCourse(current)} title={`Open ${current.title} in Anthropic Academy`}><Play size={15}/> Open in Academy</button> : <span className="academy-hint"><ExternalLink size={15}/> Academy is live on the right</span>}</section>
          {view !== 'curriculum' && <section className="review-next"><div className="section-head compact"><div><h2>Review next</h2><p>Official items needing attention, with in-progress work first. App-created practice is kept separate.</p></div><span className="queue-count">{reviewQueue.length} remaining</span></div>{reviewQueue.length ? <div className="review-list">{reviewQueue.slice(0, 8).map((lesson) => <button className="review-item" key={lesson.id} onClick={() => openReviewItem(lesson)}><span className="review-icon"><Play size={13}/></span><span><b>{lesson.title}</b><small>{getStatus(lesson)} · {lesson.type === 'practice' ? 'App-created practice' : lesson.duration}</small></span><span className="review-link">Review next</span><ChevronRight size={16}/></button>)}</div> : <div className="review-empty"><Check size={18}/> All official curriculum items are complete or skipped.</div>}</section>}
          <div className="section-head compact"><div><h2>Learning path</h2><p>Recommended order is logical guidance only; Anthropic does not require it.</p></div></div>
          <label className="curriculum-search"><Search size={16}/><input value={curriculumQuery} onChange={(e) => setCurriculumQuery(e.target.value)} placeholder="Search courses, modules, or practice..." aria-label="Search curriculum" />{curriculumQuery && <button type="button" onClick={() => setCurriculumQuery('')} aria-label="Clear curriculum search"><X size={15}/></button>}</label>
          <div className="modules">{visibleModules.length ? visibleModules.map((module) => <div className="module" key={module.id}><button className="module-header" onClick={() => setExpanded((x) => ({ ...x, [module.id]: !x[module.id] }))}><i style={{ background: module.accent }}/><div><b>{module.title}</b><small>{module.lessons.length} matching item{module.lessons.length === 1 ? '' : 's'}</small></div><span>{module.lessons.filter((l) => getStatus(l) === 'Complete' || getStatus(l) === 'Skipped / already experienced').length}/{module.lessons.length}</span>{expanded[module.id] ? <ChevronDown size={17}/> : <ChevronRight size={17}/>}</button>{expanded[module.id] && <><p className="module-note">{module.note}</p><div className="lesson-list">{module.lessons.map((lesson) => <div key={lesson.id}><button className={lesson.id === activeLesson ? 'lesson-row selected' : 'lesson-row'} onClick={() => setActiveLesson(lesson.id)}><b>{lesson.title}</b><small>{lesson.duration} · {getProgress(lesson)}%</small></button><div className="status-controls"><span>{lesson.children?.length ? `${lesson.children.length} sub-items` : lesson.type}</span><select value={lesson.status} onChange={(e) => updateStatus(lesson.id, e.target.value)} aria-label={`Status for ${lesson.title}`}>{STATUS_LABELS.map((status) => <option key={status}>{status}</option>)}</select></div>{lesson.children?.length && <div className="subitems">{lesson.children.map((child) => <div className="subitem" key={child.id}><span>{child.title}</span><select value={child.status} onChange={(e) => updateStatus(child.id, e.target.value)} aria-label={`Status for ${child.title}`}>{STATUS_LABELS.map((status) => <option key={status}>{status}</option>)}</select></div>)}</div>}</div>)}</div></>}</div>) : <div className="empty-search"><Search size={18}/><b>No curriculum items found</b><span>Try a different course, module, or practice term.</span></div>}</div>
        </>}
      </div>
    </main>
    <div className={dragging ? 'academy-splitter dragging' : 'academy-splitter'} ref={splitterRef} role="separator" aria-label="Resize Academy panel" onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); setDragging(true); }}><span/></div>
    <div className="academy-slot" aria-label="Anthropic Academy native browser panel" />
    {showNotes && <div className="modal" onClick={() => setNotesOpen(false)}><div className="notes" onClick={(e) => e.stopPropagation()}><button className="close" onClick={() => setNotesOpen(false)}><X size={18}/></button><span className="eyebrow">PERSONAL NOTES</span><h2>{current.title}</h2><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Capture an insight, question, or example..."/><button className="primary" onClick={() => setNotesOpen(false)}>Save note <Check size={15}/></button></div></div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App />);


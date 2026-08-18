from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib import colors

OUTPUT = 'output/pdf/Joshua_Rice_Kyndryl_Cover_Letter.pdf'

body = [
    "Dear Kyndryl Hiring Team,",
    "I am drawn to Kyndryl’s Senior Lead, Full-Stack Forward Deployed Engineer role because it centers on stepping into complex customer problems, understanding how work is actually done, and turning that understanding into dependable software. My strongest engineering work has been done in exactly that environment: close to domain experts and users, working through ambiguity, making practical technical decisions, and owning systems from implementation through production troubleshooting and iteration.",
    "At WeInfuse, I joined as the third software engineer and partnered daily with the CEO, a former infusion-clinic owner and primary product expert, to translate real clinic workflows into production software for a HIPAA-compliant healthcare platform. I independently built and maintained core client-facing workflows for medication-inventory tracking, insurance billing, patient cost estimates, and treatment-profitability calculations. I clarified operational constraints, proposed implementations, shipped across the stack, and refined the results through stakeholder feedback. I also diagnosed production failures across Angular.js and React frontends, Rails backends, APIs, background jobs, and data flows, then implemented durable fixes. During my tenure, the platform grew from more than 100 infusion-center locations and 65,000 treatments to more than 670 locations and 1 million completed appointments. As the engineering organization grew, I was promoted to Senior and interviewed and mentored developers while continuing to own production systems directly.",
    "More recently, I built North Star - AI Command Center as an independent end-to-end AI application. Its user-triggered pipeline gathers listings from USAJOBS, Adzuna, Remotive, Dice, and Greenhouse and processes more than 500 listings per search. A deterministic 0-100 pre-filter removes low-signal roles before OpenRouter-backed LLM evaluation, reducing token use by about 80% while ranking the strongest opportunities against a supplied resume. The system then turns those results into tracked application workflows, generates tailored resume and cover-letter drafts, ingests recruiting activity from Gmail and Google Voice, and supports browser-assisted applications with user approval before submission. Building North Star has deepened my hands-on work with LLM integrations, agent orchestration, tool use, context management, model routing, token optimization, external data sources, and human-in-the-loop AI workflows.",
    "What I would bring to Kyndryl is a combination of production full-stack experience and a forward-deployed mindset: work directly with the people closest to the problem, understand the operational reality, make sound technical trade-offs, build across system boundaries, and stay accountable for whether the solution actually works. I am prepared to relocate to the Dallas-Fort Worth area and would welcome the opportunity to work onsite with Kyndryl’s Frisco Agentic AI Lab and directly with enterprise customers.",
    "Thank you for your consideration. I would welcome the opportunity to discuss how my production engineering background and current work building AI-enabled systems could contribute to Kyndryl’s forward-deployed engineering team.",
]

styles = getSampleStyleSheet()
name = ParagraphStyle('Name', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=20, leading=24, textColor=colors.HexColor('#132238'), spaceAfter=2)
role = ParagraphStyle('Role', parent=styles['Normal'], fontName='Helvetica', fontSize=9.5, leading=13, textColor=colors.HexColor('#526174'), spaceAfter=12)
date = ParagraphStyle('Date', parent=styles['Normal'], fontName='Helvetica', fontSize=10, leading=14, textColor=colors.HexColor('#526174'), spaceAfter=18)
paragraph = ParagraphStyle('Letter', parent=styles['BodyText'], fontName='Helvetica', fontSize=9.2, leading=13.1, textColor=colors.HexColor('#202938'), alignment=TA_LEFT, spaceAfter=8)

doc = SimpleDocTemplate(OUTPUT, pagesize=LETTER, rightMargin=0.72*inch, leftMargin=0.72*inch, topMargin=0.52*inch, bottomMargin=0.58*inch, title='Joshua Rice - Kyndryl Cover Letter', author='Joshua Rice')
story = [Paragraph('Joshua Rice', name), Paragraph('Senior Lead, Full-Stack Forward Deployed Engineer', role), HRFlowable(width='100%', thickness=1, color=colors.HexColor('#3A78A1'), spaceAfter=11), Paragraph('August 18, 2026', date)]
story.extend(Paragraph(item, paragraph) for item in body)
story.extend([Spacer(1, 4), Paragraph('Best regards,', paragraph), Spacer(1, 7), Paragraph('Joshua Rice', ParagraphStyle('Signature', parent=paragraph, fontName='Helvetica-Bold', spaceAfter=0))])

def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor('#D8E0E8'))
    canvas.line(doc.leftMargin, 0.48*inch, LETTER[0] - doc.rightMargin, 0.48*inch)
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(colors.HexColor('#718096'))
    canvas.drawString(doc.leftMargin, 0.29*inch, 'Joshua Rice | Kyndryl application')
    canvas.drawRightString(LETTER[0] - doc.rightMargin, 0.29*inch, f'{doc.page}')
    canvas.restoreState()

doc.build(story, onFirstPage=footer, onLaterPages=footer)

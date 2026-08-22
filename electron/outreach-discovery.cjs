const MAX_HTML = 350000;
const FETCH_TIMEOUT = 9000;
const TITLE_TERMS = /(recruiter|talent acquisition|hiring manager|engineering manager|director of engineering|head of engineering|vp of engineering|vice president of engineering|people operations)/i;
const PAGE_HINTS = ['team', 'about', 'leadership', 'careers', 'contact', 'people'];

function clean(value, max = 500) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max); }
function safeUrl(value) { try { const url = new URL(String(value || '')); return ['http:', 'https:'].includes(url.protocol) ? url : null; } catch { return null; } }
function origin(value) { const url = safeUrl(value); return url ? url.origin : ''; }
function htmlText(html) { return clean(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' '), MAX_HTML); }
function links(html, baseUrl) {
  const found = []; const pattern = /href\s*=\s*["']([^"']+)["']/gi; let match;
  while ((match = pattern.exec(String(html || ''))) && found.length < 80) { try { const url = new URL(match[1], baseUrl); if (['http:', 'https:'].includes(url.protocol)) found.push(url.toString()); } catch {} }
  return [...new Set(found)];
}
function emails(value) { return [...new Set(String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])].map((email) => email.toLowerCase()).filter((email) => !/^(info|hello|support|sales|contact|admin|privacy|security)@/i.test(email)); }
function nameFromEmail(email) { const local = email.split('@')[0].replace(/[._-]+/g, ' ').trim(); return local.split(' ').map((part) => part ? part[0].toUpperCase() + part.slice(1) : '').join(' '); }
function githubOrg(value) { const url = safeUrl(value); if (!url || url.hostname !== 'github.com') return ''; const parts = url.pathname.split('/').filter(Boolean); return parts[0] || ''; }
function linkedinCompany(value) { const url = safeUrl(value); if (!url || !url.hostname.endsWith('linkedin.com')) return ''; const match = url.pathname.match(/\/company\/([^/]+)/i); return match ? match[1] : ''; }
function candidateKey(candidate) { return `${candidate.email || ''}|${candidate.profileUrl || ''}|${candidate.name || ''}`.toLowerCase(); }
function inferRole(text, fallback = 'Potential hiring contact') { const match = String(text || '').match(/(?:senior |technical |internal |executive )?(?:recruiter|talent acquisition|hiring manager|engineering manager|director of engineering|head of engineering|vp of engineering|vice president of engineering|people operations)/i); return clean(match?.[0] || fallback, 180); }
function extractWebCandidates(pageUrl, html, fallbackRole) {
  const text = htmlText(html); const pageCandidates = []; const pageEmails = emails(`${html} ${text}`); const pageLinks = links(html, pageUrl); const profileLinks = pageLinks.filter((url) => /linkedin\.com\/in\//i.test(url));
  for (const email of pageEmails) pageCandidates.push({ name: nameFromEmail(email), title: inferRole(text, fallbackRole), email, profileUrl: profileLinks[0] || '', sourceUrl: pageUrl, sourceEvidence: `Public email ${email} was explicitly present on ${pageUrl}.`, sourceType: 'company website', verificationStatus: 'probable', verificationMethod: 'explicit_public_email', verificationSource: pageUrl, confidence: 60 });
  for (const profileUrl of profileLinks.slice(0, 10)) { const nearby = text.slice(Math.max(0, text.toLowerCase().indexOf('linkedin')), 700); pageCandidates.push({ name: '', title: inferRole(nearby, fallbackRole), email: '', profileUrl, sourceUrl: pageUrl, sourceEvidence: `LinkedIn profile link was published on ${pageUrl}; confirm the person’s current hiring responsibility there.`, sourceType: 'company website → LinkedIn', verificationStatus: 'unverified', verificationMethod: 'public_profile_link', verificationSource: pageUrl, confidence: 35 }); }
  return pageCandidates;
}
async function fetchPublic(url, fetchImpl) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try { const response = await fetchImpl(url, { headers: { Accept: 'text/html,application/json', 'User-Agent': 'North-Star-Outreach/1.0 (local user initiated)' }, signal: controller.signal }); if (!response.ok) return { ok: false, status: response.status, text: '' }; return { ok: true, status: response.status, text: String(await response.text()).slice(0, MAX_HTML) }; } catch (error) { return { ok: false, status: 0, text: '', error: error?.message || 'request failed' }; } finally { clearTimeout(timer); }
}
async function discoverGithub(input, fetchImpl, candidates, sources) {
  const org = githubOrg(input.githubUrl || input.companyWebsite || ''); if (!org) return;
  const endpoint = `https://api.github.com/orgs/${encodeURIComponent(org)}/members?per_page=50`;
  const result = await fetchPublic(endpoint, fetchImpl); sources.push({ type: 'GitHub', url: endpoint, status: result.ok ? 'read' : 'unavailable' }); if (!result.ok) return;
  let members = []; try { members = JSON.parse(result.text); } catch { return; }
  for (const member of Array.isArray(members) ? members.slice(0, 25) : []) {
    const profileUrl = `https://api.github.com/users/${encodeURIComponent(member.login)}`; const profile = await fetchPublic(profileUrl, fetchImpl); if (!profile.ok) continue; let data; try { data = JSON.parse(profile.text); } catch { continue; }
    const bio = `${data.name || ''} ${data.bio || ''} ${data.company || ''}`; if (!TITLE_TERMS.test(bio) && !/engineering|talent|recruit/i.test(bio)) continue;
    candidates.push({ name: clean(data.name || member.login, 180), title: inferRole(bio, 'Engineering / talent contact'), email: emails(data.email || '')[0] || '', profileUrl: data.html_url || `https://github.com/${member.login}`, sourceUrl: data.html_url || profileUrl, sourceEvidence: `GitHub public profile for ${data.name || member.login} lists: ${clean(bio, 320)}.`, sourceType: 'GitHub', verificationStatus: data.email ? 'probable' : 'unverified', verificationMethod: data.email ? 'explicit_public_profile_email' : 'public_profile', verificationSource: data.html_url || profileUrl, confidence: data.email ? 65 : 35 });
  }
}
async function discoverOutreachContacts(input = {}, { fetchImpl = globalThis.fetch } = {}) {
  const jobTitle = clean(input.jobTitle, 180); const company = clean(input.company, 180); const fallbackRole = /engineering|software|ai|implementation|solutions/i.test(jobTitle) ? 'Engineering recruiting contact' : 'Recruiting contact'; const candidates = []; const sources = []; const warnings = [];
  const website = origin(input.companyWebsite || input.jobUrl); if (website) {
    const initial = safeUrl(input.companyWebsite || input.jobUrl); const first = await fetchPublic(initial.toString(), fetchImpl); sources.push({ type: 'Company website', url: initial.toString(), status: first.ok ? 'read' : 'unavailable' }); if (first.ok) {
      candidates.push(...extractWebCandidates(initial.toString(), first.text, fallbackRole));
      const pageUrls = links(first.text, initial.toString()).filter((url) => new URL(url).origin === website && PAGE_HINTS.some((hint) => new URL(url).pathname.toLowerCase().includes(hint))).slice(0, 5);
      for (const pageUrl of [...new Set(pageUrls)]) { const page = await fetchPublic(pageUrl, fetchImpl); sources.push({ type: 'Company website', url: pageUrl, status: page.ok ? 'read' : 'unavailable' }); if (page.ok) candidates.push(...extractWebCandidates(pageUrl, page.text, fallbackRole)); }
    } else warnings.push(`Could not read ${initial.hostname}.`);
  }
  await discoverGithub(input, fetchImpl, candidates, sources);
  const linkedinSlug = linkedinCompany(input.linkedinUrl); const linkedinSearch = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${company} ${jobTitle} recruiter hiring manager`)}`; sources.push({ type: 'LinkedIn', url: input.linkedinUrl || linkedinSearch, status: linkedinSlug ? 'search_target' : 'search_target' }); candidates.push({ name: '', title: 'Recruiter / hiring manager lead', email: '', profileUrl: input.linkedinUrl || linkedinSearch, sourceUrl: input.linkedinUrl || linkedinSearch, sourceEvidence: `Targeted LinkedIn search for ${company} ${jobTitle} recruiter hiring manager. Open it to confirm the current person and role.`, sourceType: 'LinkedIn', verificationStatus: 'unverified', verificationMethod: 'targeted_search', verificationSource: input.linkedinUrl || linkedinSearch, confidence: 30 });
  const unique = [...new Map(candidates.filter((candidate) => candidate.email || candidate.profileUrl || candidate.name).map((candidate) => [candidateKey(candidate), candidate])).values()].sort((left, right) => (right.confidence || 0) - (left.confidence || 0));
  if (!unique.length) warnings.push('No public hiring contact was found. Keep the job for manual research rather than guessing an address.');
  return { ok: true, company, jobTitle, candidates: unique.slice(0, 30), sources, warnings };
}
module.exports = { discoverOutreachContacts, extractWebCandidates, githubOrg, linkedinCompany };

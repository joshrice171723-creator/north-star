const path = require('path');

const EXPORT_ROOT_NAME = 'Claude Architect';
const APPLICATIONS_FOLDER_NAME = 'Job Applications';

function safeSegment(value, fallback) {
  const normalized = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return normalized || fallback;
}

function applicationExportDirectory(documentsPath, job = {}) {
  const company = safeSegment(job.company, 'Unknown company');
  const role = safeSegment(job.roleTitle, 'Untitled role');
  return path.join(documentsPath, EXPORT_ROOT_NAME, APPLICATIONS_FOLDER_NAME, `${company} - ${role}`);
}

function applicationExportFilename(document, extension) {
  const kind = document?.documentType === 'cover_letter' ? 'Cover Letter' : 'Resume';
  const version = Number.isInteger(document?.version) ? document.version : 'latest';
  return `${kind} - v${version}.${extension}`;
}

module.exports = { applicationExportDirectory, applicationExportFilename, safeSegment };

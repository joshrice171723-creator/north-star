const generic = require('./generic.cjs');
const adapters = [generic];
function selectAdapter(context = {}) { const matches = adapters.filter((adapter) => adapter.matches(context)); return matches.length === 1 ? matches[0] : generic; }
function boundedDiagnostic(input = {}) { return { adapterKey: String(input.adapterKey || 'generic').slice(0, 80), adapterVersion: Number(input.adapterVersion) || 1, operation: String(input.operation || 'observe').slice(0, 80), outcome: String(input.outcome || 'unknown').slice(0, 80), reasonCode: String(input.reasonCode || '').slice(0, 120), durationMs: Math.max(0, Math.min(Number(input.durationMs) || 0, 300000)) }; }
module.exports = { adapters, selectAdapter, boundedDiagnostic };

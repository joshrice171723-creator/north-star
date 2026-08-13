import React, { useMemo, useState } from 'react';
import { ExternalLink, Gift, MapPin, Search, ShieldCheck } from 'lucide-react';

const STORAGE_KEY = 'north-star-free-finds-v1';
const DEFAULTS = { location: '', craigslistSite: '', query: 'free' };

function readSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
  catch { return DEFAULTS; }
}

const cleanCraigslistSite = (value) => value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\.craigslist\.org.*$/, '').replace(/[^a-z0-9-]/g, '');

export default function FreeFindsView() {
  const [settings, setSettings] = useState(readSettings);
  const [saved, setSaved] = useState(false);
  const craigslistSite = cleanCraigslistSite(settings.craigslistSite);
  const query = settings.query.trim() || 'free';
  const location = settings.location.trim();
  const sources = useMemo(() => [
    { name: 'Craigslist', title: 'Free stuff, newest first', description: craigslistSite ? `Free listings on ${craigslistSite}.craigslist.org` : 'Set your local Craigslist site to enable a direct search.', ready: Boolean(craigslistSite), url: craigslistSite ? `https://${craigslistSite}.craigslist.org/search/zip?query=${encodeURIComponent(query)}&sort=date` : '', action: 'Search free listings' },
    { name: 'Facebook Marketplace', title: 'Facebook Marketplace', description: location ? `Search Marketplace for “${query}” near ${location}. Sign in on Facebook to use its location filters.` : 'Sign in on Facebook, then choose your location and search for free items.', ready: true, url: `https://www.facebook.com/marketplace/search?query=${encodeURIComponent(query)}`, action: 'Open Marketplace' },
    { name: 'Buy Nothing', title: 'Buy Nothing', description: 'Find the official local Buy Nothing group for gifts, lending, and requests.', ready: true, url: 'https://buynothingproject.org/find-a-group', action: 'Find a group' },
    { name: 'Freecycle', title: 'Freecycle', description: 'Browse local reuse groups and set your own town or neighborhood.', ready: true, url: 'https://www.freecycle.org/browse', action: 'Browse Freecycle' },
  ], [craigslistSite, location, query]);
  const update = (field, value) => { setSettings((current) => ({ ...current, [field]: value })); setSaved(false); };
  const save = () => { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, craigslistSite })); setSaved(true); };
  const open = (url) => window.desktopShell?.openExternal?.(url);

  return <section className="free-finds-view">
    <div className="free-finds-intro"><div><span className="eyebrow">LOCAL FREE-FINDS DESK</span><h2>Find useful things being given away nearby.</h2><p>Set your area once, then jump into local free listings, community gifting groups, and reuse networks.</p></div><Gift size={34} aria-hidden="true" /></div>
    <section className="free-finds-settings" aria-label="Free Finds search settings">
      <label><MapPin size={15} /> Your city or area<input value={settings.location} onChange={(event) => update('location', event.target.value)} placeholder="e.g. Chicago, IL" /></label>
      <label><Search size={15} /> What to look for<input value={settings.query} onChange={(event) => update('query', event.target.value)} placeholder="free" /></label>
      <label>Craigslist site<input value={settings.craigslistSite} onChange={(event) => update('craigslistSite', event.target.value)} placeholder="e.g. chicago" /><small>Use the part before “.craigslist.org”.</small></label>
      <button className="primary" type="button" onClick={save}>Save area</button>{saved && <span className="free-finds-saved">Saved locally</span>}
    </section>
    <div className="free-finds-note"><ShieldCheck size={15}/><span>Marketplace sessions stay on the original sites. This desk does not scrape Facebook, bypass sign-in, or collect marketplace credentials.</span></div>
    <div className="free-finds-grid">{sources.map((source) => <article className="free-source-card" key={source.name}><div><span className="eyebrow">{source.name}</span><h3>{source.title}</h3><p>{source.description}</p></div><button className="secondary" type="button" disabled={!source.ready} onClick={() => open(source.url)}>{source.action} <ExternalLink size={14}/></button></article>)}</div>
    <p className="free-finds-safety">Pickup tip: keep communication on the marketplace, meet in a public place when possible, and never send money for an item advertised as free.</p>
  </section>;
}

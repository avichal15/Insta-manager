import type { PublishFormat, ScheduledPost } from '../../shared/types';
import { MESSAGE_TYPES, type MessageTypeValue } from '../message-types';

type Tab = 'draft' | 'schedule' | 'queue';
const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']);
const maxFileBytes = 250 * 1024 * 1024;

export function initCreatorDock(): void {
  if (document.getElementById('im-creator-dock')) return;

  let open = false, tab: Tab = 'draft', format: PublishFormat = 'reel';
  let caption = '', status = '', date = localDate(new Date()), time = '13:00';
  let files: File[] = [], posts: ScheduledPost[] = [];
  const dock = document.createElement('aside');
  dock.id = 'im-creator-dock';
  dock.className = 'im-creator-dock';
  dock.setAttribute('aria-hidden', 'true');
  dock.setAttribute('aria-label', 'Creator workspace');
  document.body.append(dock);

  const send = <T,>(type: MessageTypeValue, data?: unknown) => new Promise<T>((resolve) => chrome.runtime.sendMessage({ type, data }, resolve));
  const refresh = async () => { posts = await send<ScheduledPost[]>(MESSAGE_TYPES.GET_SCHEDULED_POSTS); };
  const show = (next: boolean, nextTab?: Tab) => {
    open = next;
    if (nextTab) tab = nextTab;
    dock.classList.toggle('im-creator-dock-open', open);
    dock.setAttribute('aria-hidden', String(!open));
    if (open) void refresh().catch(() => { posts = []; }).finally(render);
    else render();
  };

  const draft = () => `
    <div class="im-format-picker">${(['post', 'reel', 'story'] as PublishFormat[]).map((item) => `<button type="button" data-format="${item}" class="${format === item ? 'is-active' : ''}">${item}</button>`).join('')}</div>
    <section class="im-dock-section"><label class="im-dock-label" for="im-caption-input">Caption <span>${caption.length}/2,200</span></label><textarea id="im-caption-input" maxlength="2200" placeholder="Write a caption…">${escapeHtml(caption)}</textarea><div class="im-caption-actions"><button type="button" data-clean>Clean spacing</button><button type="button" data-tags>Move hashtags to footer</button></div></section>
    <section class="im-dock-section"><div class="im-dock-label">Media <span>${files.length ? `${files.length} selected` : 'Optional'}</span></div><label class="im-dock-media" for="im-file-input"><span><b>Add media</b><small>MP4, WebM, JPG, PNG, or WebP · up to 20 files</small></span><input id="im-file-input" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple></label>${files.length ? `<div class="im-media-list">${files.map((file, index) => `<div data-media-index="${index}"><span>${file.type.startsWith('video/') ? 'Video' : 'Image'}</span><em>${escapeHtml(file.name)}</em></div>`).join('')}</div>` : ''}</section>
    <footer class="im-dock-footer"><button type="button" class="im-dock-secondary" data-clear ${files.length || caption ? '' : 'disabled'}>Clear</button><button type="button" class="im-dock-primary" id="im-btn-publish" data-handoff>Prepare in Instagram</button></footer>`;
  const schedule = () => `<section class="im-dock-section"><h2>Set a reminder</h2><p class="im-dock-help">This creates a Chrome reminder. Instagram posting always stays under your review.</p><label class="im-dock-label">Date and time</label><div class="im-date-time"><input id="im-date" type="date" min="${localDate(new Date())}" value="${date}"><input id="im-time" type="time" value="${time}"></div><p class="im-dock-note">Media files are not retained after the page closes. Reselect them before handing off to Instagram.</p></section><footer class="im-dock-footer"><button type="button" class="im-dock-secondary" data-tab="draft">Back</button><button type="button" class="im-dock-primary" data-schedule>Schedule reminder</button></footer>`;
  const queue = () => `<section class="im-dock-section"><h2>Scheduled reminders</h2>${posts.length ? `<div class="im-dock-queue">${posts.map((post) => `<article><div><b>${escapeHtml(post.type)} · ${post.status === 'due' ? 'Due now' : new Date(post.scheduledAt).toLocaleString()}</b><span>${escapeHtml(post.mediaName ? `${post.mediaName} · reselect required` : 'Caption-only draft')}</span></div><button type="button" data-use="${post.id}">Open</button><button type="button" data-delete="${post.id}" aria-label="Delete reminder">×</button></article>`).join('')}</div>` : '<p class="im-dock-empty">No scheduled reminders yet.</p>'}</section>`;

  function render(): void {
    dock.innerHTML = `<header class="im-dock-header"><div><strong>Creator</strong><span>Draft, schedule, hand off</span></div><button class="im-dock-icon" type="button" data-close aria-label="Close creator">×</button></header><nav class="im-dock-nav" aria-label="Creator sections">${(['draft', 'schedule', 'queue'] as Tab[]).map((item) => `<button type="button" data-tab="${item}" class="${tab === item ? 'is-active' : ''}">${item === 'queue' ? `Queue <span>${posts.length}</span>` : item[0].toUpperCase() + item.slice(1)}</button>`).join('')}</nav><div class="im-dock-body">${tab === 'draft' ? draft() : tab === 'schedule' ? schedule() : queue()}${status ? `<p class="im-dock-status" role="status">${escapeHtml(status)}</p>` : ''}</div>`;
    bind();
  }

  function bind(): void {
    dock.querySelector('[data-close]')?.addEventListener('click', () => show(false));
    dock.querySelectorAll<HTMLElement>('[data-tab]').forEach((element) => element.addEventListener('click', () => { const next = element.dataset.tab; if (next === 'draft' || next === 'schedule' || next === 'queue') { tab = next; render(); } }));
    dock.querySelectorAll<HTMLElement>('[data-format]').forEach((element) => element.addEventListener('click', () => { const next = element.dataset.format; if (next === 'post' || next === 'reel' || next === 'story') { format = next; render(); } }));
    const input = dock.querySelector<HTMLTextAreaElement>('#im-caption-input');
    input?.addEventListener('input', () => { caption = input.value; });
    dock.querySelector('[data-clean]')?.addEventListener('click', () => { caption = caption.split('\n').map((line) => line.trim().replace(/\s+/g, ' ')).join('\n').replace(/\n{3,}/g, '\n\n').trim(); render(); });
    dock.querySelector('[data-tags]')?.addEventListener('click', () => { const tags = [...new Set(caption.match(/#[\p{L}\p{N}_]+/gu) ?? [])]; caption = [caption.replace(/#[\p{L}\p{N}_]+/gu, '').trim(), tags.join(' ')].filter(Boolean).join('\n\n').slice(0, 2200); render(); });
    const mediaInput = dock.querySelector<HTMLInputElement>('#im-file-input');
    mediaInput?.addEventListener('change', () => { const next = [...(mediaInput.files ?? [])]; if (next.length > 20) status = 'Select no more than 20 files.'; else if (next.some((file) => !allowed.has(file.type) || file.size > maxFileBytes)) status = 'Choose supported files under 250 MB.'; else { files = next; status = ''; } render(); });
    dock.querySelector('[data-clear]')?.addEventListener('click', () => { files = []; caption = ''; status = ''; render(); });
    dock.querySelector<HTMLInputElement>('#im-date')?.addEventListener('change', (event) => { date = (event.target as HTMLInputElement).value; });
    dock.querySelector<HTMLInputElement>('#im-time')?.addEventListener('change', (event) => { time = (event.target as HTMLInputElement).value; });
    dock.querySelector('[data-schedule]')?.addEventListener('click', () => void scheduleReminder());
    dock.querySelector('[data-handoff]')?.addEventListener('click', () => void handoff());
    dock.querySelectorAll<HTMLElement>('[data-use]').forEach((element) => element.addEventListener('click', () => { const post = posts.find((item) => item.id === element.dataset.use); if (!post) return; format = post.type; caption = post.caption; tab = 'draft'; status = post.mediaName ? `Draft opened. Reselect ${post.mediaName}; media was not retained.` : 'Draft opened.'; render(); }));
    dock.querySelectorAll<HTMLElement>('[data-delete]').forEach((element) => element.addEventListener('click', () => void remove(element.dataset.delete)));
  }

  async function scheduleReminder(): Promise<void> {
    if (!caption && !files.length) { status = 'Add media or write a caption before scheduling.'; render(); return; }
    const response = await send<{ success: boolean; error?: string }>(MESSAGE_TYPES.SCHEDULE_POST, { type: format, caption, scheduledAt: new Date(`${date}T${time}:00`).getTime(), mediaName: files.length > 1 ? `${files.length} files · ${files[0].name}` : files[0]?.name ?? null, mediaType: files.length > 1 ? 'carousel' : files[0]?.type ?? null });
    status = response.success ? 'Reminder scheduled. Reselect media before publishing.' : response.error ?? 'Could not schedule reminder.';
    if (response.success) { await refresh(); tab = 'queue'; }
    render();
  }
  async function remove(id?: string): Promise<void> { if (!id) return; await send(MESSAGE_TYPES.DELETE_SCHEDULED_POST, { id }); await refresh(); status = 'Scheduled reminder deleted.'; render(); }
  async function handoff(): Promise<void> {
    if (!caption && !files.length) { status = 'Add media or write a caption before opening Instagram Create.'; render(); return; }
    const icon = document.querySelector<HTMLElement>('a[href^="/create/"], a svg[aria-label="New post"], button svg[aria-label="New post"]');
    const create = icon?.closest<HTMLElement>('a,button,[role="button"]') ?? icon;
    if (!create) { status = 'Instagram’s Create control was not found.'; render(); return; }
    try { if (caption) await navigator.clipboard.writeText(caption); } catch { /* Clipboard permission is optional. */ }
    const selection = [...files], existing = new Set(document.querySelectorAll('input[type="file"]'));
    let delivered = false;
    const deliver = () => { const nativeInput = [...document.querySelectorAll<HTMLInputElement>('input[type="file"]')].find((item) => !existing.has(item) && !dock.contains(item)); if (!nativeInput || delivered) return false; delivered = true; const transfer = new DataTransfer(); selection.forEach((file) => transfer.items.add(file)); nativeInput.files = transfer.files; nativeInput.dispatchEvent(new Event('change', { bubbles: true })); return true; };
    const observer = new MutationObserver(() => { if (deliver()) observer.disconnect(); });
    if (selection.length) observer.observe(document.body, { childList: true, subtree: true });
    show(false); create.click(); if (selection.length && deliver()) observer.disconnect();
    window.setTimeout(() => observer.disconnect(), 10_000);
  }

  chrome.runtime.onMessage.addListener((message: { type?: string }) => { if (message.type === 'TOGGLE_ASSISTANT') show(!open); else if (message.type === 'OPEN_SCHEDULED_POST') show(true, 'queue'); });
  document.addEventListener('im-open-creator', () => show(true));
  render();
}
function localDate(value: Date): string { return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); }
function escapeHtml(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }

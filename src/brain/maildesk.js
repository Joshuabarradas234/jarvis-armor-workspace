/**
 * JARVIS Core — the inbox: read, sort, label, draft.
 *  - Every new email is sorted into a category and labelled in Gmail (JARVIS/Needs reply, JARVIS/Billing…).
 *  - Anything a real person is waiting on gets a draft reply saved in your Gmail Drafts, and a request (#n)
 *    to send it. Nothing is ever sent without your YES. Billing is always left for you.
 *  - Every email gets a one-line summary and a mood, so "is anyone mad?" has an answer.
 */
import {Imap, parseMessage, freshText, buildMessage, smtpSend, imapDate, validAddress} from './email.js';
import {ask} from './llm.js';
import {extractJson, clip, oneLine} from './util.js';

export class MailDesk {
  constructor({store, approvals, key, orders, log}) {
    Object.assign(this, {store, approvals, key, orders, log: log || (() => {})});
    this.busy = null;
  }
  cfg() { return this.store.get().email; }
  ready() { const c = this.cfg(); return !!(c.enabled && c.address && this.store.secret('emailPassword')); }
  st() { return this.store.state.email || {uidValidity: 0, lastUid: 0, items: []}; }
  saveSt(s) { s.items = (s.items || []).slice(-500); this.store.setState({email: s}); }
  async open() {
    const c = this.cfg();
    if (!this.ready()) throw Error('Email is not set up (Settings → JARVIS Core → Email).');
    const im = new Imap({host: c.imapHost, port: c.imapPort, user: c.address, pass: this.store.secret('emailPassword'), log: this.log});
    try { await im.login(); } catch (e) { try { im.sock?.destroy(); } catch {} throw e; }
    return im;
  }
  async test() { const im = await this.open(); try { const b = await im.select('INBOX', true); return {ok: true, messages: b.exists, gmail: !!im.gmail}; } finally { await im.logout(); } }
  /** What the model knows about you when it writes as you. */
  voice() {
    const o = this.orders.parse(); const me = this.store.get().owner;
    return [`You write emails for ${me.name}. British English, warm, brief and direct; no corporate filler.`,
      o.sections.about.length ? 'About them:\n' + o.sections.about.map(x => '- ' + x.text).join('\n') : '',
      o.sections.facts.length ? 'Facts about their business:\n' + o.sections.facts.map(x => '- ' + x.text).join('\n') : '',
      o.sections.ask.length ? 'Things they always decide themselves:\n' + o.sections.ask.map(x => '- ' + x.text).join('\n') : ''].filter(Boolean).join('\n\n');
  }
  /** Look at new mail. `max` caps how many are read in one go. Returns what happened. */
  check({max = 40, trigger = 'schedule'} = {}) {
    if (this.busy) return this.busy;
    this.busy = this._check({max, trigger}).finally(() => { this.busy = null; });
    return this.busy;
  }
  async _check({max}) {
    const c = this.cfg(), key = this.key(), me = String(c.address).toLowerCase();
    const s = this.st();
    const im = await this.open();
    const out = {fetched: 0, sorted: [], drafted: 0, needReply: 0, labelled: 0, cost: 0, errors: []};
    try {
      const box = await im.select('INBOX');
      if (s.uidValidity !== box.uidValidity) { s.uidValidity = box.uidValidity; s.lastUid = 0; }
      let uids = s.lastUid ? (await im.search(`UID ${s.lastUid + 1}:*`)).filter(u => u > s.lastUid) : await im.search(`SINCE ${imapDate(new Date(Date.now() - 2 * 864e5))}`);
      uids = uids.sort((a, b) => a - b).slice(0, max);   // oldest first: the rest are picked up next time, never skipped
      if (!uids.length) { this.saveSt(s); return out; }
      const msgs = await im.fetch(uids);
      out.fetched = msgs.length;
      const mails = msgs.map(m => { let p; try { p = parseMessage(m.raw); } catch (e) { out.errors.push(`Could not read email ${m.uid}: ${e.message}`); return null; } return {uid: m.uid, labels: m.labels, flags: m.flags, thread: String(m.thread || ''), date: p.date || m.date, from: p.from, replyTo: p.replyTo, to: p.to, cc: p.cc,
        subject: p.subject || '(no subject)', text: freshText(p.text).slice(0, 6000), messageId: p.messageId, references: p.references, bulk: !!(p.listUnsubscribe || /bulk|list|junk/.test(p.precedence) || /auto/.test(p.autoSubmitted)), attachments: p.attachments.map(a => a.name)}; })
        .filter(m => m && m.from.address !== me);   // your own sent mail is not news (and one that could not be read is skipped)
      // sort in batches of 10 with the fast model
      const cats = c.categories;
      for (let i = 0; i < mails.length; i += 10) {
        const batch = mails.slice(i, i + 10);
        let verdicts = [];
        if (key && this.store.budgetLeft() > 0.02) {
          try {
            const r = await ask({key, model: this.store.get().models.fast, maxTokens: 1800,
              system: `You sort ${this.store.get().owner.name || 'the owner'}'s inbox. Categories: ${cats.join(', ')}.\n"Needs reply" = a real person is waiting for an answer from them. Newsletters, notifications, receipts and automated mail never need a reply.\nAnswer with JSON only.`,
              prompt: `For each email return {"i": number, "category": one of the categories, "needsReply": true/false, "urgent": true/false, "mood": "angry"|"unhappy"|"neutral"|"happy", "billing": true/false (about money owed, invoices, payments, refunds, subscriptions), "summary": "one line, at most 18 words"}.\nReturn a JSON array.\n\n` +
                batch.map((m, j) => `### Email ${j}\nFrom: ${m.from.name} <${m.from.address}>\nSubject: ${m.subject}\nAutomated: ${m.bulk ? 'probably' : 'no sign'}\n${m.attachments.length ? 'Attachments: ' + m.attachments.join(', ') + '\n' : ''}\n${clip(m.text, 1500)}`).join('\n\n')});
            out.cost += r.cost; this.store.addSpend(r.cost, 'email');
            verdicts = extractJson(r.text) || [];
          } catch (e) { out.errors.push(e.message); }
        }
        batch.forEach((m, j) => {
          const v = (Array.isArray(verdicts) ? verdicts.find(x => Number(x?.i) === j) : null) || {};
          m.category = cats.includes(v.category) ? v.category : m.bulk ? (cats.includes('Newsletters') ? 'Newsletters' : cats[cats.length - 1]) : 'FYI';
          m.billing = !!v.billing || m.category === 'Billing'; if (m.billing && cats.includes('Billing')) m.category = 'Billing';
          m.needsReply = !m.bulk && !!v.needsReply && !m.billing; if (m.needsReply && cats.includes('Needs reply') && m.category !== 'Customers') m.category = 'Needs reply';
          m.urgent = !!v.urgent; m.mood = ['angry', 'unhappy', 'neutral', 'happy'].includes(v.mood) ? v.mood : 'neutral';
          m.summary = clip(oneLine(v.summary || m.subject), 160);
        });
      }
      // labels, grouped so it is one command per label
      const byLabel = new Map();
      for (const m of mails) { const l = `${c.labelPrefix}/${m.category}`; if (!byLabel.has(l)) byLabel.set(l, []); byLabel.get(l).push(m.uid); if (m.mood === 'angry' || m.mood === 'unhappy') { const k = `${c.labelPrefix}/Unhappy`; if (!byLabel.has(k)) byLabel.set(k, []); byLabel.get(k).push(m.uid); } }
      for (const [label, list] of byLabel) { try { await im.createBox(label); await im.addLabels(list, [label]); out.labelled += list.length; } catch (e) { out.errors.push(`Label ${label}: ${e.message}`); } }
      // drafts for anything that needs you
      const drafts = mails.filter(m => m.needsReply);
      out.needReply = drafts.length;
      let draftsBox = '';
      if (drafts.length && c.draftReplies && key) {
        try { draftsBox = await im.specialBox('\\Drafts', ['[Gmail]/Drafts', '[Google Mail]/Drafts', 'Drafts']); } catch (e) { out.errors.push(e.message); }
        for (const m of drafts.slice(0, 15)) {
          if (this.store.budgetLeft() < 0.05) { out.errors.push('Stopped drafting: today\'s budget is used up.'); break; }
          try {
            const to = m.replyTo?.address ? m.replyTo : m.from;
            if (!validAddress(to.address)) throw Error(`the reply address “${String(to.address).slice(0, 60)}” is not valid`);
            const other = m.replyTo?.address && m.replyTo.address !== m.from.address;   // replies would go somewhere else: say so plainly
            const body = await this.writeReply(m);
            const subject = /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`;
            const msg = buildMessage({from: {name: this.store.get().owner.name, address: c.address}, to: [to], subject, text: body, inReplyTo: m.messageId, references: [...m.references, m.messageId].filter(Boolean).slice(-10)});
            if (draftsBox) await im.append(draftsBox, msg.raw, ['\\Draft', '\\Seen']);
            const a = this.approvals.create({kind: 'email', title: `Send my reply to ${to.address}${other ? ` (⚠ not the sender, ${m.from.address})` : ''}: “${clip(m.subject, 60)}”`, detail: `To: ${to.name ? `${to.name} <${to.address}>` : to.address}${other ? `\n⚠ The email came from ${m.from.address} but asks for replies to go to ${to.address}.` : ''}\nSubject: ${subject}\n\n${body}`,
              payload: {to, subject, text: body, inReplyTo: m.messageId, references: [...m.references, m.messageId].filter(Boolean).slice(-10), draftId: msg.messageId, draftsBox, uid: m.uid}, ref: `email:${m.messageId || m.uid}`, group: 'email', risk: 'normal', expiresHours: 96});
            m.draft = true; m.approvalId = a.id; out.drafted++;
          } catch (e) { out.errors.push(`Draft for “${m.subject}”: ${e.message}`); }
        }
      }
      for (const m of mails) {
        const row = {uid: m.uid, at: m.date || Date.now(), seen: Date.now(), from: m.from.name || m.from.address, address: m.from.address, subject: m.subject, category: m.category, needsReply: m.needsReply, urgent: m.urgent,
          mood: m.mood, billing: m.billing, summary: m.summary, draft: !!m.draft, approvalId: m.approvalId || 0, messageId: m.messageId};
        s.items.push(row); out.sorted.push(row);
      }
      s.lastUid = Math.max(s.lastUid || 0, ...msgs.map(m => m.uid));
      this.saveSt(s);
    } finally { await im.logout(); }
    if (out.sorted.length) this.store.act('email', `Sorted ${out.sorted.length} email${out.sorted.length === 1 ? '' : 's'}${out.drafted ? `, drafted ${out.drafted} repl${out.drafted === 1 ? 'y' : 'ies'} (waiting for your OK)` : ''}.`, {auto: true});
    return out;
  }
  async writeReply(m) {
    const r = await ask({key: this.key(), model: this.store.get().models.brain, maxTokens: 900, system: this.voice() + `\n\nWrite only the body of the reply: no subject line, no "Subject:", no placeholders like [Your Name] — sign off with just "${this.store.get().owner.name.split(' ')[0]}". Keep it short. Never agree to money, refunds, discounts, deadlines or commitments that are not in the facts above; say you will come back to them instead. If you need a fact you do not have, write it in [square brackets] so it is easy to spot.`,
      prompt: `Reply to this email.\n\nFrom: ${m.from.name} <${m.from.address}>\nSubject: ${m.subject}\n\n${clip(m.text, 5000)}`});
    this.store.addSpend(r.cost, 'email');
    return r.text.replace(/^subject:.*\n+/i, '').trim();
  }
  /**
   * Send an approved reply. If its draft is still in Gmail, what goes out is the draft as it is now (so any edits
   * you made there are kept), and the draft is removed afterwards. If the draft is gone, you probably sent or
   * deleted it yourself, so nothing is sent.
   */
  async send(p) {
    const c = this.cfg(); const to = p.to?.address || p.to;
    if (!validAddress(to)) throw Error('That reply address is not valid, so I have not sent it.');
    const im = await this.open();
    try {
      let text = p.text, uids = [];
      if (p.draftsBox && p.draftId) {
        try { await im.select(p.draftsBox); uids = await im.search(`HEADER Message-ID ${JSON.stringify(p.draftId)}`); } catch { uids = null; }
        if (Array.isArray(uids) && !uids.length) return {sent: false, note: 'The draft was no longer in Drafts, so you probably sent or deleted it yourself. I have not sent anything.'};
        if (uids?.length) { try { const [m] = await im.fetch([uids[uids.length - 1]], {bytes: 200000}); const parsed = m ? parseMessage(m.raw) : null; if (parsed?.text?.trim()) text = parsed.text.trim(); } catch {} }
      }
      const msg = buildMessage({from: {name: this.store.get().owner.name, address: c.address}, to: [{name: p.to?.name || '', address: to}], subject: p.subject, text, inReplyTo: p.inReplyTo, references: p.references || []});
      await smtpSend({host: c.smtpHost, port: c.smtpPort, user: c.address, pass: this.store.secret('emailPassword'), to: [to], raw: msg.raw, log: this.log});
      if (uids?.length) { try { await im.deleteUids(uids); } catch {} }
      return {sent: true, edited: text !== p.text};
    } finally { await im.logout(); }
  }
  /** Send any email (for the "send_email" tool, after approval). */
  async sendNew({to, subject, text}) {
    const c = this.cfg(); if (!this.ready()) throw Error('Email is not set up.');
    const list = [].concat(to).map(x => typeof x === 'string' ? {name: '', address: x.trim()} : x);
    if (!list.length || !list.every(x => validAddress(x.address))) throw Error('That is not a valid email address.');
    const msg = buildMessage({from: {name: this.store.get().owner.name, address: c.address}, to: list, subject, text});
    await smtpSend({host: c.smtpHost, port: c.smtpPort, user: c.address, pass: this.store.secret('emailPassword'), to: list.map(x => x.address), raw: msg.raw, log: this.log});
    return true;
  }
  async search(query, {max = 15} = {}) {
    const im = await this.open();
    try {
      await im.select('INBOX', true);
      let uids;
      try { uids = im.gmail ? await im.search(`X-GM-RAW ${JSON.stringify(String(query).slice(0, 200))}`) : null; } catch { uids = null; }
      if (!uids) uids = await im.search(`TEXT ${JSON.stringify(String(query).replace(/\b\w+:\S+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || String(query).slice(0, 100))}`);
      const msgs = await im.fetch(uids.slice(-max), {bytes: 20000});
      return msgs.reverse().map(m => { const p = parseMessage(m.raw); return {uid: m.uid, date: new Date(p.date || m.date).toISOString(), from: p.from.name ? `${p.from.name} <${p.from.address}>` : p.from.address, subject: p.subject, preview: clip(oneLine(freshText(p.text)), 300)}; });
    } finally { await im.logout(); }
  }
  async read(uid) {
    const im = await this.open();
    try { await im.select('INBOX', true); const [m] = await im.fetch([Number(uid)], {bytes: 120000}); if (!m) throw Error('No email with that number.'); const p = parseMessage(m.raw);
      return {uid: m.uid, date: new Date(p.date || m.date).toISOString(), from: p.from, to: p.to, subject: p.subject, text: clip(p.text, 12000), attachments: p.attachments}; }
    finally { await im.logout(); }
  }
  async label(uid, category) { category = String(category || '').replace(/[\u0000-\u001f\u007f"\\%*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40); if (!category) throw Error('That label has no name.'); const im = await this.open(); try { await im.select('INBOX'); const l = `${this.cfg().labelPrefix}/${category}`; await im.createBox(l); await im.addLabels([Number(uid)], [l]); return true; } finally { await im.logout(); } }
  async archive(uid) { const im = await this.open(); try { await im.select('INBOX'); await im.archive([Number(uid)]); return true; } finally { await im.logout(); } }
  /** Sorted email since a moment, for reports and questions. */
  since(ms) { return (this.st().items || []).filter(x => (x.seen || x.at) >= ms); }
}

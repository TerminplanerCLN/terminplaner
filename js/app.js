/**
 * app.js — Frontend-Controller für "Werpfährtmich?"
 * ---------------------------------------------------------------
 * Cleanes, professionelles UI. Adresssuche (Nominatim), echte
 * Karten (Leaflet/OSRM), Pferdeanzahl + Verladehilfe, voller
 * Fahrt-Lebenszyklus mit Storno-Fenster, Abschluss und Bewertung.
 */
const App = {
  state: {
    role: 'rider',
    userId: null,          // ID des eingeloggten Nutzers (= riderId = driverId)
    riderId: null, driverId: null,
    profile: null,         // rohes Profil aus der DB (für is_rider/is_driver)
    riderTab: 'anfrage', driverTab: 'auftraege',
    draft: { pickup: null, dropoff: null, route: null },
  },
  el: null,
  _maps: {},

  async init() {
    this.el = document.getElementById('app');
    // Auf Login/Logout reagieren
    API.onAuthChange((user) => { this.handleAuth(user); });
    const user = await API.currentUser();
    this.handleAuth(user);
  },

  async handleAuth(user) {
    // Mehrfach-Trigger (signIn liefert Session UND onAuthChange feuert)
    // gegen paralleles Rendern absichern.
    const uid = user ? user.id : null;
    if (this._authState === uid && this._authRendered) return;
    this._authState = uid;
    this._authRendered = false;
    if (!user) { this.renderHome(); this._authRendered = true; return; }
    this.state.userId = user.id;
    this.state.riderId = user.id;
    this.state.driverId = user.id;
    try {
      this.state.profile = await API.getMyProfile();
    } catch (e) {
      await new Promise((r) => setTimeout(r, 800));
      this.state.profile = await API.getMyProfile();
    }
    this.state.role = this.state.profile?.is_driver && !this.state.profile?.is_rider ? 'driver' : 'rider';
    this.renderApp();
    this._authRendered = true;
  },

  renderApp() {
    this.el = document.getElementById('app');
    this.el.style.display = '';
    this.renderChrome();
    this.bindTopbar();
    this.render();
  },

  /** Baut Topbar (mit Rollenumschalter + Logout) statt Demo-Reset. */
  renderChrome() {
    const bar = document.getElementById('topbar');
    if (!bar) return;
    const isAdmin = !!this.state.profile?.is_admin;
    bar.innerHTML = `
      <div class="brand"><span class="mark">${ICON.logo()}</span> Werpfährtmich?</div>
      <div class="role-switch">
        <button data-role="rider" class="${this.state.role === 'rider' ? 'active' : ''}">Reiter</button>
        <button data-role="driver" class="${this.state.role === 'driver' ? 'active' : ''}">Fahrer</button>
        ${isAdmin ? `<button data-role="admin" class="${this.state.role === 'admin' ? 'active' : ''}">Admin</button>` : ''}
      </div>
      <span class="topbar-user">${esc(this.state.profile?.full_name || '')}</span>
      <button class="btn-reset" id="logoutBtn">Abmelden</button>`;
  },

  bindTopbar() {
    document.querySelectorAll('.role-switch button').forEach((b) => {
      b.addEventListener('click', async () => {
        this.state.role = b.dataset.role;
        this.destroyMaps();
        this.syncTopbar();
        this.render();
      });
    });
    const lo = document.getElementById('logoutBtn');
    if (lo) lo.addEventListener('click', async () => { await API.signOut(); });
    this.syncTopbar();
  },
  syncTopbar() {
    document.querySelectorAll('.role-switch button').forEach((b) =>
      b.classList.toggle('active', b.dataset.role === this.state.role));
  },

  destroyMaps() {
    Object.values(this._maps).forEach((m) => { try { m.remove(); } catch (e) {} });
    this._maps = {};
  },

  render() {
    this.destroyMaps();
    this._renderToken = (this._renderToken || 0) + 1;
    if (this.state.role === 'admin') this.renderAdmin();
    else if (this.state.role === 'rider') this.renderRider();
    else this.renderDriver();
  },

  /* =============================================================
   * ADMIN — Meldungen als Tabelle, Detailansicht mit Maßnahmen
   * =========================================================== */
  async renderAdmin() {
    const token = this._renderToken;
    this.el = document.getElementById('app');
    this.el.innerHTML = `
      <div class="wrap">
        <div class="page-head">
          <div class="eyebrow">Admin</div>
          <h1>Meldungen</h1>
          <p>Eingegangene Hinweise von Nutzern. Eine Meldung bedeutet zunächst nur, dass ein Nutzer einen möglichen Verstoß gemeldet hat — nicht, dass er zutrifft. Du entscheidest über die Maßnahme. Endgültiges Löschen eines Kontos erfolgt im Supabase-Dashboard.</p>
        </div>
        <div id="adminBody"><div class="empty">Lade Meldungen…</div></div>
      </div>`;
    let reports;
    try { reports = await API.listReports(); }
    catch (e) { if (token === this._renderToken) document.getElementById('adminBody').innerHTML = `<div class="notice">Fehler beim Laden: ${esc(e.message)}</div>`; return; }
    if (token !== this._renderToken) return;
    const body = document.getElementById('adminBody');
    if (!reports.length) { body.innerHTML = `<div class="empty">Keine Meldungen vorhanden.</div>`; return; }
    this._reports = reports; // für Detailansicht merken

    const statusLabel = { open: 'Offen', in_review: 'In Prüfung', resolved: 'Erledigt' };
    const statusBadge = { open: 'badge-amber', in_review: 'badge-accent', resolved: 'badge-gray' };
    const stateChip = (rs) => {
      if (!rs) return '';
      if (rs.blocked) return `<span class="badge" style="background:var(--red-soft);color:var(--red)">Dauerhaft gesperrt</span>`;
      if (rs.blockedUntil && new Date(rs.blockedUntil).getTime() > Date.now()) return `<span class="badge badge-amber">Temporär gesperrt</span>`;
      if (rs.offersDisabled) return `<span class="badge badge-amber">Angebote aus</span>`;
      if (rs.warnings > 0) return `<span class="badge badge-gray">${rs.warnings}× verwarnt</span>`;
      return '';
    };
    body.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Nr.</th><th>Nutzer</th><th>Grund</th><th>Datum</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${reports.map((r) => `
              <tr>
                <td class="mono">#${r.ticketNo || '—'}</td>
                <td>${esc(r.reportedName)} ${stateChip(r.reportedStatus)}</td>
                <td>${esc(r.category || 'Ohne Kategorie')}</td>
                <td class="nowrap">${fmtDate(r.at)}</td>
                <td><span class="badge ${statusBadge[r.status] || 'badge-gray'}">${statusLabel[r.status] || r.status}</span></td>
                <td><button class="btn btn-secondary btn-sm" data-open-report="${r.id}">Öffnen</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    body.querySelectorAll('[data-open-report]').forEach((b) =>
      b.addEventListener('click', () => this.showReportDetail(b.dataset.openReport)));
  },

  showReportDetail(reportId) {
    const r = (this._reports || []).find((x) => x.id === reportId);
    if (!r) return;
    const rs = r.reportedStatus || {};
    const statusLabel = { open: 'Offen', in_review: 'In Prüfung', resolved: 'Erledigt' };
    const tempSperrOptions = [7, 14, 30];
    const modal = document.createElement('div');
    modal.className = 'modal-bg';
    modal.innerHTML = `<div class="modal modal-lg">
      <div class="card-head"><h3>Meldung #${r.ticketNo || ''}</h3><button class="btn-reset" data-close>Schließen</button></div>
      <div class="card-pad">
        <div class="bs-row"><span>Gemeldeter Nutzer</span><b>${esc(r.reportedName)}</b></div>
        <div class="bs-row"><span>Melder</span><b>${esc(r.reporterRef)}</b></div>
        <div class="bs-row"><span>Kategorie</span><b>${esc(r.category || 'Ohne Kategorie')}</b></div>
        <div class="bs-row"><span>Eingegangen</span><b>${fmtDate(r.at)}</b></div>
        <div class="bs-row"><span>Bisherige Meldungen gegen diesen Nutzer</span><b>${r.priorReports}</b></div>
        <div class="bs-row"><span>Aktueller Kontostatus</span><b>${
          rs.blocked ? 'Dauerhaft gesperrt'
          : (rs.blockedUntil && new Date(rs.blockedUntil).getTime() > Date.now()) ? 'Temporär gesperrt bis ' + new Date(rs.blockedUntil).toLocaleDateString('de-DE')
          : rs.offersDisabled ? 'Angebote deaktiviert'
          : 'Aktiv'}${rs.warnings ? ` · ${rs.warnings}× verwarnt` : ''}</b></div>

        <div class="section-label" style="margin:18px 0 8px">Beschreibung</div>
        <div class="notice" style="white-space:pre-wrap">${esc(r.message)}</div>

        <div class="section-label" style="margin:18px 0 8px">Meldungsstatus</div>
        <div class="admin-actions">
          <button class="btn btn-secondary btn-sm" data-rstatus="in_review" ${r.status === 'in_review' ? 'disabled' : ''}>In Prüfung</button>
          <button class="btn btn-secondary btn-sm" data-rstatus="resolved" ${r.status === 'resolved' ? 'disabled' : ''}>Meldung schließen</button>
        </div>

        <div class="section-label" style="margin:18px 0 8px">Maßnahmen gegen den Nutzer</div>
        <div class="admin-actions">
          <button class="btn btn-secondary btn-sm" data-warn="${r.reportedId}">Verwarnen</button>
          ${rs.offersDisabled
            ? `<button class="btn btn-secondary btn-sm" data-offers="on" data-uid="${r.reportedId}">Angebote wieder aktivieren</button>`
            : `<button class="btn btn-secondary btn-sm" data-offers="off" data-uid="${r.reportedId}">Angebote deaktivieren</button>`}
          ${tempSperrOptions.map((d) => `<button class="btn btn-secondary btn-sm" data-tempblock="${d}" data-uid="${r.reportedId}">${d} Tage sperren</button>`).join('')}
          ${rs.blocked
            ? `<button class="btn btn-secondary btn-sm" data-unblock="${r.reportedId}">Sperre aufheben</button>`
            : `<button class="btn btn-danger btn-sm" data-block="${r.reportedId}">Dauerhaft sperren</button>`}
        </div>
        <p class="meta" style="font-size:12px;color:var(--ink-3);margin-top:14px">Hinweis: „Verwarnen“, „sperren“ und „deaktivieren“ sind deine Entscheidungen auf Basis deiner Nutzungsbedingungen. Die Meldung selbst trifft keine Aussage über die Wahrheit des Vorwurfs.</p>
      </div></div>`;

    const close = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal || e.target.hasAttribute('data-close')) close(); });

    const done = (msg) => { toast(msg, 'ok'); close(); this.renderAdmin(); };
    const wrap = async (fn, msg) => { try { await fn(); done(msg); } catch (e) { toast(e.message, 'err'); } };

    modal.querySelectorAll('[data-rstatus]').forEach((b) => b.addEventListener('click', () =>
      wrap(() => API.setReportStatus(r.id, b.dataset.rstatus), 'Status aktualisiert')));
    modal.querySelector('[data-warn]')?.addEventListener('click', () =>
      wrap(() => API.warnUser(r.reportedId), 'Nutzer verwarnt'));
    modal.querySelectorAll('[data-offers]').forEach((b) => b.addEventListener('click', () =>
      wrap(() => API.setOffersDisabled(b.dataset.uid, b.dataset.offers === 'off'), b.dataset.offers === 'off' ? 'Angebote deaktiviert' : 'Angebote aktiviert')));
    modal.querySelectorAll('[data-tempblock]').forEach((b) => b.addEventListener('click', () => {
      const until = new Date(Date.now() + (+b.dataset.tempblock) * 86400000).toISOString();
      wrap(() => API.setUserBlockedUntil(b.dataset.uid, until), `Nutzer für ${b.dataset.tempblock} Tage gesperrt`);
    }));
    modal.querySelector('[data-block]')?.addEventListener('click', () => {
      if (!confirm('Diesen Nutzer dauerhaft sperren?')) return;
      wrap(() => API.setUserBlocked(r.reportedId, true), 'Nutzer dauerhaft gesperrt');
    });
    modal.querySelector('[data-unblock]')?.addEventListener('click', () =>
      wrap(() => API.setUserBlocked(r.reportedId, false), 'Sperre aufgehoben'));

    document.body.appendChild(modal);
  },

  /* =============================================================
   * HOMEPAGE — Startseite vor dem Login
   * =========================================================== */
  renderHome() {
    const bar = document.getElementById('topbar');
    if (bar) bar.innerHTML = `
      <div class="brand"><span class="mark">${ICON.logo()}</span> Werpfährtmich?</div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn-home-nav ghost" id="homeLogin">Anmelden</button>
        <button class="btn-home-nav solid" id="homeSignup">Konto erstellen</button>
      </div>`;
    const app = document.getElementById('app');
    app.style.display = '';
    app.innerHTML = `
      <div class="home">
        <!-- Hero -->
        <section class="hero">
          <div class="hero-inner">
            <div class="hero-logo"><img src="logo.png" alt="Werpfährtmich?"></div>
            <h1>Pferdetransport,<br>von Mensch zu Mensch.</h1>
            <p class="hero-sub">Werpfährtmich? verbindet Pferdehalter mit Anhängeranbietern in der Region. Sie stellen eine Anfrage, passende Fahrer melden sich mit ihrem Angebot — mit Preis, Bewertung und allen Infos vorab.</p>
            <div class="hero-actions">
              <button class="btn btn-hero-primary" id="heroFind">Transport finden</button>
              <button class="btn btn-hero-ghost" id="heroDrive">Als Fahrer anbieten</button>
            </div>
            <div class="hero-tagline">Mitfahrgelegenheiten für Pferde.</div>
          </div>
        </section>

        <!-- Bild-Galerie mit Fade-in -->
        <section class="photo-band">
          <div class="home-wrap">
            <div class="photo-grid">
              <figure class="photo reveal"><img src="foto-transport-1.jpg" alt="Zwei Pferde blicken aus einem Pferdeanhänger" loading="lazy"></figure>
              <figure class="photo reveal"><img src="foto-transport-2.jpg" alt="Geöffneter Pferdetransporter mit Auffahrrampe" loading="lazy"></figure>
            </div>
          </div>
        </section>

        <!-- So funktioniert's -->
        <section class="home-section">
          <div class="home-wrap">
            <div class="section-eyebrow">So funktioniert's</div>
            <h2>In wenigen Schritten zum Transport</h2>
            <div class="how-grid">
              <div class="how-col">
                <div class="how-label">Für Pferdebesitzer</div>
                <ol class="how-steps">
                  <li><b>Anfrage stellen.</b> Abhol- und Zieladresse, Datum und Anzahl der Pferde eingeben.</li>
                  <li><b>Angebote erhalten.</b> Fahrer aus Ihrer Umgebung melden sich mit ihrem Preis.</li>
                  <li><b>Fahrer wählen.</b> Bewertungen und Angaben vergleichen und annehmen.</li>
                </ol>
              </div>
              <div class="how-col">
                <div class="how-label">Für Fahrer</div>
                <ol class="how-steps">
                  <li><b>Profil anlegen.</b> Fahrzeug, Anhänger, Preise und Verfügbarkeit festlegen.</li>
                  <li><b>Passende Anfragen sehen.</b> Nur Anfragen in Ihrem Umkreis und Ihrer Zeit.</li>
                  <li><b>Angebot abgeben.</b> Sie entscheiden selbst, wann und zu welchem Preis.</li>
                </ol>
              </div>
            </div>
          </div>
        </section>

        <!-- Vorteile -->
        <section class="home-section alt">
          <div class="home-wrap">
            <div class="section-eyebrow">Warum Werpfährtmich?</div>
            <h2>Kein Automatismus. Echte Menschen.</h2>
            <div class="feat-grid">
              <div class="feat">
                <div class="feat-ico">${ICON.users()}</div>
                <h3>Echte Angebote</h3>
                <p>Keine automatische Zuteilung. Jeder Fahrer entscheidet selbst und nennt Ihnen seinen Preis vorab.</p>
              </div>
              <div class="feat">
                <div class="feat-ico">${ICON.mapPin()}</div>
                <h3>Fahrer aus der Region</h3>
                <p>Sie sehen Fahrer in Ihrem Umkreis — kurze Wege, faire Anfahrt.</p>
              </div>
              <div class="feat">
                <div class="feat-ico">${ICON.star(true)}</div>
                <h3>Transparente Profile</h3>
                <p>Bewertungen, abgeschlossene Fahrten und alle Angaben, bevor Sie sich entscheiden.</p>
              </div>
              <div class="feat">
                <div class="feat-ico">${ICON.doc()}</div>
                <h3>Preis vorab</h3>
                <p>Der Preis steht im Angebot — berechnet aus Anfahrt und Kilometern. Keine Überraschungen.</p>
              </div>
            </div>
          </div>
        </section>

        <!-- FAQ -->
        <section class="home-section">
          <div class="home-wrap narrow">
            <div class="section-eyebrow">Häufige Fragen</div>
            <h2>Gut zu wissen</h2>
            <div class="faq">
              <details class="faq-item">
                <summary>Was brauche ich, um als Fahrer anzubieten?</summary>
                <div class="faq-body">
                  <p>Sie benötigen ein geeignetes Zugfahrzeug mit Pferdeanhänger oder einen Pferdetransporter sowie die passende Ausstattung für einen sicheren Transport.</p>
                  <p>Dazu kommen die erforderlichen Unterlagen: die zum Gespann passende Führerscheinklasse (in der Regel B mit Anhänger bzw. BE) und – bei Transporten in Verbindung mit einer wirtschaftlichen Tätigkeit – die nach der EU-Tiertransportverordnung (EG) Nr. 1/2005 vorgeschriebenen Nachweise. Für gewerbliche Fahrten über 65 km gehören dazu insbesondere die Zulassung als Transportunternehmer und ein Befähigungsnachweis.</p>
                  <p>Welche Voraussetzungen in Ihrem konkreten Fall gelten, hängt von Zweck, Entfernung und Dauer der Fahrt ab. Bitte informieren Sie sich eigenständig bei Ihrem zuständigen Veterinäramt. Werpfährtmich? prüft diese Voraussetzungen nicht – die Verantwortung dafür liegt bei Ihnen als Anbieter.</p>
                </div>
              </details>
              <details class="faq-item">
                <summary>Was brauche ich als Pferdebesitzer?</summary>
                <div class="faq-body">
                  <p>Im Grunde nur Ihr Pferd und einen Termin, zu dem es abgeholt werden soll. Sie stellen eine Anfrage mit Start, Ziel und Zeitpunkt, und passende Fahrer melden sich mit ihrem Angebot.</p>
                  <p>Planen Sie ausreichend Zeit ein und begegnen Sie den Fahrern respektvoll – ein guter Transport ist Teamarbeit. Prüfen Sie vor der Übergabe selbst die Angaben und Unterlagen des Fahrers.</p>
                </div>
              </details>
              <details class="faq-item">
                <summary>Wer ist mein Vertragspartner?</summary>
                <div class="faq-body">
                  <p>Der Transportvertrag kommt direkt zwischen Ihnen und dem Fahrer zustande. Werpfährtmich? ist eine Vermittlungsplattform und führt die Transporte nicht selbst durch. Wir stellen den Kontakt her – gefahren wird von den Anbietern.</p>
                </div>
              </details>
              <details class="faq-item">
                <summary>Prüft Werpfährtmich? die Anbieter und ihre Dokumente?</summary>
                <div class="faq-body">
                  <p>Nein. Die Angaben und hinterlegten Dokumente der Anbieter prüfen wir grundsätzlich nicht auf ihre rechtliche Gültigkeit. Anbieter sind selbst dafür verantwortlich, die für ihre Transporte geltenden gesetzlichen Voraussetzungen zu erfüllen. Auf jedem Profil sehen Sie, welche Angaben Selbstauskunft sind – so können Sie sich vor der Buchung ein eigenes Bild machen.</p>
                </div>
              </details>
              <details class="faq-item">
                <summary>Wie wird der Preis bestimmt?</summary>
                <div class="faq-body">
                  <p>Jeder Fahrer legt seine Konditionen selbst fest – üblicherweise aus einer Anfahrtspauschale und einem Preis pro Kilometer. Den Gesamtpreis sehen Sie im Angebot, bevor Sie es annehmen. So gibt es keine Überraschungen.</p>
                </div>
              </details>
              <details class="faq-item">
                <summary>Wie weit reichen die Fahrten?</summary>
                <div class="faq-body">
                  <p>Fahrer legen selbst fest, in welchem Umkreis sie Transporte anbieten. Der maximale Umkreis auf Werpfährtmich? beträgt 65 km – die Entfernung, bis zu der nach der EU-Tiertransportverordnung geringere Anforderungen gelten. Für weiter reichende oder besonders lange Transporte gelten zusätzliche gesetzliche Vorgaben.</p>
                </div>
              </details>
            </div>
          </div>
        </section>

        <!-- Call to Action -->
        <section class="home-cta">
          <div class="home-wrap">
            <h2>Bereit für den nächsten Transport?</h2>
            <p>Ein Konto genügt — Sie können Pferde transportieren lassen und selbst fahren.</p>
            <div class="hero-actions">
              <button class="btn btn-hero-primary" id="ctaSignup">Jetzt Konto erstellen</button>
              <button class="btn btn-hero-ghost" id="ctaLogin">Anmelden</button>
            </div>
          </div>
        </section>

        <!-- Footer -->
        <footer class="home-footer">
          <div class="home-wrap footer-inner">
            <div class="footer-brand"><span class="mark">${ICON.logo()}</span> Werpfährtmich?</div>
            <div class="footer-links">
              <a href="#" data-legal="impressum">Impressum</a>
              <a href="#" data-legal="agb">AGB</a>
              <a href="#" data-legal="datenschutz">Datenschutz</a>
            </div>
            <div class="footer-copy">© ${new Date().getFullYear()} Werpfährtmich?</div>
          </div>
        </footer>
      </div>`;

    // Verdrahtung: alle Wege führen zu Login oder Registrierung
    const toSignup = () => this.renderAuth('signup');
    const toLogin = () => this.renderAuth('login');
    ['homeSignup', 'heroDrive', 'heroFind', 'ctaSignup'].forEach((id) => {
      const b = document.getElementById(id); if (b) b.addEventListener('click', toSignup);
    });
    ['homeLogin', 'ctaLogin'].forEach((id) => {
      const b = document.getElementById(id); if (b) b.addEventListener('click', toLogin);
    });
    // "Transport finden" führt zur Registrierung (Reiter-Konto)
    const hf = document.getElementById('heroFind'); if (hf) { hf.removeEventListener('click', toSignup); hf.addEventListener('click', toSignup); }
    // Rechtstext-Links: vorerst Hinweis, dass in Arbeit
    app.querySelectorAll('[data-legal]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      toast('Diese Seite wird noch erstellt.', '');
    }));

    // Fade-in beim Scrollen: Elemente mit .reveal einblenden, sobald sichtbar
    const revealEls = app.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window && revealEls.length) {
      const obs = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) { entry.target.classList.add('is-visible'); obs.unobserve(entry.target); }
        });
      }, { threshold: 0.15 });
      revealEls.forEach((el) => obs.observe(el));
    } else {
      // Fallback: falls kein Observer, direkt sichtbar
      revealEls.forEach((el) => el.classList.add('is-visible'));
    }
  },

  /* =============================================================
   * AUTH — Login & Registrierung
   * =========================================================== */
  renderAuth(mode = 'login') {
    const bar = document.getElementById('topbar');
    if (bar) bar.innerHTML = `<button class="brand brand-btn" id="authHome"><span class="mark">${ICON.logo()}</span> Werpfährtmich?</button>`;
    const app = document.getElementById('app');
    app.style.display = '';
    const isLogin = mode === 'login';
    app.innerHTML = `
      <div class="auth-wrap">
        <div class="auth-card">
          <div class="auth-head">
            <div class="auth-logo"><img src="logo.png" alt="Werpfährtmich?"></div>
            <div class="auth-brand">werpfährtmich?</div>
            <div class="auth-slogan">Mitfahrgelegenheiten für Pferde.</div>
            <h1 style="margin-top:20px">${isLogin ? 'Willkommen zurück' : 'Konto erstellen'}</h1>
            <p>${isLogin ? 'Melde dich an, um Transporte zu finden oder anzubieten.' : 'Ein Konto genügt — du kannst Pferde transportieren lassen und selbst fahren.'}</p>
          </div>
          <div id="authError" class="notice" style="display:none;color:var(--red);background:var(--red-soft);border-color:#F0C2C2;margin-bottom:16px"></div>
          ${isLogin ? '' : `
            <label class="field"><span>Name</span><input type="text" id="auName" placeholder="Vor- und Nachname" autocomplete="name"></label>
            <label class="field"><span>Telefon (Pflicht)</span><input type="tel" id="auPhone" placeholder="+49 …" autocomplete="tel"></label>`}
          <label class="field"><span>E-Mail</span><input type="text" id="auEmail" placeholder="name@beispiel.de" autocomplete="email"></label>
          <label class="field"><span>Passwort</span><input type="password" id="auPass" placeholder="Mindestens 6 Zeichen" autocomplete="${isLogin ? 'current-password' : 'new-password'}"></label>
          ${isLogin ? '' : `
            <label class="consent-row">
              <input type="checkbox" id="auConsent">
              <span>Ich bestätige, dass meine Angaben richtig sind und dass ich für alle von mir angebotenen Transporte selbst dafür verantwortlich bin, die erforderlichen Fahrerlaubnisse, Genehmigungen, Nachweise und Versicherungen zu besitzen und die geltenden Vorschriften einzuhalten. Hochgeladene Dokumente werden von Werpfährtmich nicht geprüft. Ich akzeptiere die AGB und die Datenschutzerklärung.</span>
            </label>`}
          <button class="btn btn-primary btn-block" id="auSubmit" style="margin-top:8px">${isLogin ? 'Anmelden' : 'Konto erstellen'}</button>
          <div class="auth-switch">
            ${isLogin
              ? 'Noch kein Konto? <button class="link-btn" id="auToggle">Jetzt registrieren</button>'
              : 'Schon registriert? <button class="link-btn" id="auToggle">Zur Anmeldung</button>'}
          </div>
        </div>
      </div>`;

    const err = document.getElementById('authError');
    const showErr = (m) => { err.textContent = m; err.style.display = 'block'; };
    document.getElementById('auToggle').addEventListener('click', () => this.renderAuth(isLogin ? 'signup' : 'login'));
    const authHome = document.getElementById('authHome');
    if (authHome) authHome.addEventListener('click', () => this.renderHome());

    const submit = document.getElementById('auSubmit');
    const run = async () => {
      err.style.display = 'none';
      const email = val('auEmail').trim();
      const pass = val('auPass');
      if (!email || !pass) { showErr('Bitte E-Mail und Passwort eingeben.'); return; }
      submit.disabled = true; submit.textContent = 'Bitte warten…';
      try {
        if (isLogin) {
          await API.signIn(email, pass);
          // onAuthChange übernimmt das Rendern
        } else {
          const name = val('auName').trim();
          const phone = val('auPhone').trim();
          if (!name || !phone) { showErr('Bitte Name und Telefonnummer angeben.'); submit.disabled = false; submit.textContent = 'Konto erstellen'; return; }
          if (!document.getElementById('auConsent').checked) { showErr('Bitte bestätige die Erklärung, um fortzufahren.'); submit.disabled = false; submit.textContent = 'Konto erstellen'; return; }
          const res = await API.signUp(email, pass, name, phone);
          // Zustimmungszeitpunkt festhalten (sobald ein Profil existiert)
          try { const p = await API.getMyProfile(); if (p) await API.saveSelfDeclaration(p.id); } catch (e) {}
          if (!res.session) {
            // E-Mail-Bestätigung ist aktiv
            app.querySelector('.auth-card').innerHTML = `
              <div class="auth-head"><div class="mark auth-mark">${ICON.check()}</div>
              <h1>Fast geschafft</h1>
              <p>Wir haben dir eine E-Mail an <b>${esc(email)}</b> geschickt. Bitte bestätige den Link darin und melde dich anschließend an.</p></div>
              <button class="btn btn-secondary btn-block" onclick="location.reload()">Zur Anmeldung</button>`;
            return;
          }
        }
      } catch (e) {
        showErr(e.message);
        submit.disabled = false; submit.textContent = isLogin ? 'Anmelden' : 'Konto erstellen';
      }
    };
    submit.addEventListener('click', run);
    document.getElementById('auPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  },

  /* =============================================================
   * REITER
   * =========================================================== */
  async renderRider() {
    this.el.innerHTML = `
      <div class="wrap">
        <div class="page-head">
          <div class="eyebrow">Reiter</div>
          <h1>Transport für dein Pferd finden</h1>
          <p>Stell eine Anfrage an Fahrer in deiner Nähe. Du erhältst nur echte Angebote — jeder Fahrer entscheidet selbst und nennt dir vorab seinen Preis.</p>
        </div>
        <div class="tabs" id="riderTabs">
          <button data-tab="anfrage">Anfrage stellen</button>
          <button data-tab="auftraege">Meine Anfragen</button>
          <button data-tab="profil">Mein Profil</button>
        </div>
        <div id="riderBody"></div>
      </div>`;
    this.el.querySelectorAll('#riderTabs button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === this.state.riderTab);
      b.addEventListener('click', () => { this.destroyMaps(); this.state.riderTab = b.dataset.tab; this.renderRider(); });
    });
    const body = document.getElementById('riderBody');
    if (this.state.riderTab === 'anfrage') this.riderRequestForm(body);
    else if (this.state.riderTab === 'auftraege') this.riderRequests(body);
    else this.riderProfile(body);
  },

  async riderRequestForm(body) {
    const token = this._renderToken;
    let rider = await API.getRider(this.state.riderId);
    if (token !== this._renderToken) return; // zwischenzeitlich neu gerendert
    if (!rider) rider = { location: { label: '', lat: null, lng: null }, horse: {} };
    // Startadresse aus Profil vorbelegen, falls vorhanden
    if (!this.state.draft.pickup && rider.location && rider.location.lat != null) {
      this.state.draft.pickup = { ...rider.location };
    }
    const d = this.state.draft;

    body.innerHTML = `
      <div class="grid grid-2-wide">
        <div class="card">
          <div class="card-head"><h2>Neue Transportanfrage</h2></div>
          <div class="card-pad">
            ${addrField('pickup', 'Abholadresse', d.pickup?.label || '', 'Stall, Hof oder Adresse eingeben')}
            ${addrField('dropoff', 'Zieladresse', d.dropoff?.label || '', 'Zieladresse eingeben')}
            <label class="field"><span>Wann?</span>
              <input type="datetime-local" id="when" value="${defaultWhen()}">
            </label>
            <div class="field-row">
              <div>
                <label class="field" style="margin-bottom:8px"><span>Anzahl Pferde</span></label>
                ${stepperField('horseCount', 1, 1, 8)}
              </div>
              <div>
                <label class="field" style="margin-bottom:8px"><span>&nbsp;</span></label>
                <div class="switch-row" style="padding:0;height:40px;align-items:center">
                  <div><div class="switch-label">Verladehilfe</div></div>
                  <label class="switch"><input type="checkbox" id="loadingHelp"><span class="track"></span></label>
                </div>
              </div>
            </div>
            <div class="switch-row" style="border-top:1px solid var(--line);padding-top:16px">
              <div><div class="switch-label">Dringend</div><div class="switch-sub">Z. B. Transport in die Tierklinik</div></div>
              <label class="switch"><input type="checkbox" id="urgent"><span class="track"></span></label>
            </div>
            <button class="btn btn-primary btn-block" id="submitReq" style="margin-top:20px" disabled>${ICON.send()} Route wählen, dann senden</button>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Streckenvorschau</h3><span class="badge badge-gray" id="kmBadge">Keine Route</span></div>
          <div class="card-pad">
            <div class="map" id="routeMap"></div>
            <div class="route-stat" id="routeStat" style="display:none">
              <div><div class="rs-num" id="rsKm">–</div><div class="rs-lbl">Strecke</div></div>
              <div><div class="rs-num" id="rsMin">–</div><div class="rs-lbl">Fahrzeit</div></div>
            </div>
          </div>
        </div>
      </div>`;

    this.initMap('routeMap');
    this.wireAddrField('pickup');
    this.wireAddrField('dropoff');
    this.wireStepper('horseCount');
    if (d.pickup && d.dropoff && d.route) this.updateRoutePreview();

    document.getElementById('submitReq') && document.getElementById('submitReq').addEventListener('click', async () => {
      const btn = document.getElementById('submitReq');
      if (!d.pickup || !d.dropoff) { toast('Bitte Abhol- und Zieladresse wählen', 'err'); return; }
      btn.disabled = true; btn.innerHTML = 'Sende…';
      try {
        await API.createRequest({
          riderId: this.state.riderId,
          pickup: d.pickup, dropoff: d.dropoff,
          when: new Date(val('when')).getTime(),
          urgent: document.getElementById('urgent').checked,
          horseCount: +val('horseCount'),
          loadingHelp: document.getElementById('loadingHelp').checked,
          route: d.route,
        });
        this.state.draft = { pickup: { ...rider.location }, dropoff: null, route: null };
        toast('Anfrage gesendet', 'ok');
        this.state.riderTab = 'auftraege';
        this.renderRider();
      } catch (e) {
        toast(e.message, 'err');
        btn.disabled = false; btn.innerHTML = `${ICON.send()} Anfrage senden`;
      }
    });
  },

  /** Adressfeld-Verdrahtung: Suche mit Debounce + Vorschlagsliste. */
  wireAddrField(key) {
    const input = document.getElementById('addr-' + key);
    const results = document.getElementById('addrres-' + key);
    if (!input || !results) return;
    let timer = null, activeIdx = -1, items = [];

    const close = () => { results.innerHTML = ''; results.style.display = 'none'; activeIdx = -1; };
    const choose = (it) => {
      input.value = it.shortLabel || it.label;
      this.state.draft[key] = { label: it.shortLabel || it.label, lat: it.lat, lng: it.lng };
      close();
      this.tryRoute();
    };

    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      this.state.draft[key] = null;
      this.refreshSubmit();
      if (q.length < 3) { close(); return; }
      results.style.display = 'block';
      results.innerHTML = '<div class="addr-loading">Suche…</div>';
      timer = setTimeout(async () => {
        try {
          // Referenzpunkt für die Umkreis-Bevorzugung: für das Ziel die
          // bereits gewählte Abholadresse, sonst der andere Punkt.
          const near = key === 'dropoff' ? this.state.draft.pickup
                     : key === 'pickup' ? this.state.draft.dropoff : null;
          items = await API.GeoService.search(q, near);
          if (!items.length) { results.innerHTML = '<div class="addr-loading">Keine Treffer</div>'; return; }
          results.innerHTML = items.map((it, i) => {
            const parts = it.label.split(',');
            return `<div class="addr-item" data-i="${i}"><div class="addr-main">${esc(parts[0])}</div><div class="addr-sub">${esc(parts.slice(1, 4).join(',').trim())}</div></div>`;
          }).join('');
          results.querySelectorAll('.addr-item').forEach((el) =>
            el.addEventListener('click', () => choose(items[+el.dataset.i])));
        } catch (e) {
          results.innerHTML = '<div class="addr-loading">Suche nicht erreichbar</div>';
        }
      }, 400);
    });
    input.addEventListener('keydown', (e) => {
      const els = [...results.querySelectorAll('.addr-item')];
      if (!els.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, els.length - 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); }
      else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); choose(items[activeIdx]); return; }
      else return;
      els.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
    });
    input.addEventListener('blur', () => setTimeout(close, 180));
  },

  refreshSubmit() {
    const btn = document.getElementById('submitReq');
    if (!btn) return;
    const ready = this.state.draft.pickup && this.state.draft.dropoff;
    btn.disabled = !ready;
    if (ready) btn.innerHTML = `${ICON.send()} Anfrage senden`;
    else btn.innerHTML = `${ICON.send()} Route wählen, dann senden`;
  },

  /** Wenn beide Adressen gesetzt: Route über OSRM holen und Karte updaten. */
  async tryRoute() {
    const d = this.state.draft;
    this.refreshSubmit();
    if (!d.pickup || !d.dropoff) return;
    const badge = document.getElementById('kmBadge');
    if (badge) { badge.className = 'badge badge-gray'; badge.textContent = 'Berechne…'; }
    try {
      d.route = await API.GeoService.route(d.pickup, d.dropoff);
      this.updateRoutePreview();
    } catch (e) { toast('Route konnte nicht berechnet werden', 'err'); }
  },

  updateRoutePreview() {
    const d = this.state.draft;
    if (!d.route) return;
    const badge = document.getElementById('kmBadge');
    if (badge) { badge.className = 'badge badge-accent'; badge.textContent = d.route.km + ' km'; }
    const stat = document.getElementById('routeStat');
    if (stat) {
      stat.style.display = 'flex';
      document.getElementById('rsKm').textContent = d.route.km + ' km';
      document.getElementById('rsMin').textContent = d.route.minutes != null ? d.route.minutes + ' min' : '≈';
    }
    this.drawRoute('routeMap', d.pickup, d.dropoff, d.route.line);
  },

  /* ---- Leaflet-Helfer ---- */
  initMap(id, center = [52.68, 13.30], zoom = 10) {
    const elm = document.getElementById(id);
    if (!elm || !window.L) return null;
    const map = L.map(id, { zoomControl: true, attributionControl: true }).setView(center, zoom);
    // CARTO "Positron": heller, zurückhaltender Kartenstil, der ohne
    // Referer-Header lädt (die Standard-OSM-Kacheln blockieren Aufrufe
    // aus lokalen Dateien per Nutzungsrichtlinie).
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd',
      attribution: '© OpenStreetMap, © CARTO',
    }).addTo(map);
    this._maps[id] = map;
    return map;
  },
  drawRoute(id, a, b, line) {
    let map = this._maps[id];
    if (!map) map = this.initMap(id);
    if (!map) return;
    // vorherige Layer entfernen (außer Tiles)
    map.eachLayer((l) => { if (!(l instanceof L.TileLayer)) map.removeLayer(l); });
    const pin = (color) => L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8],
      html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>` });
    L.marker([a.lat, a.lng], { icon: pin('#4338CA') }).addTo(map).bindTooltip('Start', { direction: 'top' });
    L.marker([b.lat, b.lng], { icon: pin('#047857') }).addTo(map).bindTooltip('Ziel', { direction: 'top' });
    const bounds = (line && line.length > 1)
      ? L.polyline(line, { color: '#4338CA', weight: 4, opacity: .85 }).addTo(map).getBounds()
      : L.latLngBounds([[a.lat, a.lng], [b.lat, b.lng]]);
    // Leaflet-Fallstrick: In dynamisch eingefügten Containern steht die
    // Höhe beim ersten Zeichnen oft noch nicht fest. Daher Größe mehrfach
    // gestaffelt neu vermessen und den Ausschnitt danach neu setzen.
    const refit = () => { map.invalidateSize(false); map.fitBounds(bounds, { padding: [28, 28] }); };
    map.fitBounds(bounds, { padding: [28, 28] });
    setTimeout(refit, 80);
    setTimeout(refit, 300);
  },

  wireStepper(id) {
    const wrap = document.querySelector(`[data-stepper="${id}"]`);
    if (!wrap) return;
    const input = wrap.querySelector('input');
    wrap.querySelector('[data-dec]').addEventListener('click', () => { input.value = Math.max(+input.min, +input.value - 1); });
    wrap.querySelector('[data-inc]').addEventListener('click', () => { input.value = Math.min(+input.max, +input.value + 1); });
  },

  async riderRequests(body) {
    body.innerHTML = `<div class="list" id="reqList">${skeletonList(2)}</div>`;
    const requests = await API.listRequestsForRider(this.state.riderId);
    const list = document.getElementById('reqList');
    if (!list) return;
    if (!requests.length) {
      list.innerHTML = emptyState(ICON.horse(), 'Noch keine Anfragen', 'Stelle deine erste Transportanfrage im Tab „Anfrage stellen".');
      return;
    }
    const blocks = await Promise.all(requests.map((r) => this.riderRequestBlock(r)));
    if (!document.getElementById('reqList')) return;
    list.innerHTML = transparencyBanner() + blocks.join('');
    // Mini-Karten erst zeichnen, wenn das Layout steht (Container hat Höhe).
    // Fallback-Linie, falls einer Anfrage die gecachte Route fehlt.
    requestAnimationFrame(() => {
      requests.forEach((r) => {
        if (!document.getElementById('map-' + r.id)) return;
        const line = r.routeLine && r.routeLine.length > 1
          ? r.routeLine : [[r.pickup.lat, r.pickup.lng], [r.dropoff.lat, r.dropoff.lng]];
        this.drawRoute('map-' + r.id, r.pickup, r.dropoff, line);
      });
    });
    this.wireRiderOfferButtons();
  },

  async riderRequestBlock(req) {
    const offers = await API.listOffersForRequest(req.id);
    const pending = offers.filter((o) => o.status === 'pending');
    const accepted = offers.find((o) => o.status === 'accepted');
    const statusBadge = {
      open: `<span class="badge badge-accent badge-dot">Offen</span>`,
      assigned: `<span class="badge badge-green badge-dot">Vergeben</span>`,
      done: `<span class="badge badge-gray">Abgeschlossen</span>`,
    }[req.status];

    let offersHtml = '';
    if (req.status === 'open') {
      offersHtml = pending.length
        ? `<div class="section-label" style="margin-top:20px">Angebote (${pending.length})</div><div class="list">${pending.map((o) => this.offerCard(o)).join('')}</div>`
        : `<div class="hint" style="margin-top:18px">Deine Anfrage ist aktiv. Sobald ein Fahrer ein Angebot abgibt, erscheint es hier.</div>`;
    } else if (accepted) {
      offersHtml = `<div class="section-label" style="margin-top:20px">Angenommenes Angebot</div><div class="list">${this.offerCard(accepted, true)}</div>`;
    }
    return `
      <div class="item">
        <div class="item-head">
          <div style="flex:1">
            <div class="route-line"><span class="dot a"></span>${esc(req.pickup.label)}<span class="arrow">→</span><span class="dot b"></span>${esc(req.dropoff.label)}</div>
            <div class="item-meta">
              <span class="mi">${ICON.route()}<b>${req.routeKm} km</b></span>
              <span class="mi">${ICON.clock()}${fmtDate(req.when)}</span>
              <span class="mi">${ICON.horse()}${req.horseCount} ${req.horseCount === 1 ? 'Pferd' : 'Pferde'}</span>
              ${req.loadingHelp ? `<span class="mi">${ICON.hand()}Verladehilfe</span>` : ''}
              ${req.urgent ? '<span class="badge badge-amber">Dringend</span>' : ''}
            </div>
          </div>
          ${statusBadge}
        </div>
        <div class="map-sm" id="map-${req.id}" style="margin-top:16px"></div>
        ${offersHtml}
      </div>`;
  },

  offerCard(offer, isAccepted = false) {
    const d = offer.driver;
    const hasPermit = d.documents && d.documents.transportPermit;
    const hasLicense = d.documents && d.documents.license;
    // WICHTIG: "hinterlegt" != "geprüft". Kein Suggerieren einer Prüfung.
    const docBadge = (hasPermit && hasLicense)
      ? `<span class="badge badge-gray" style="margin-left:8px">${ICON.doc()} Dokumente hinterlegt</span>`
      : `<span class="badge badge-amber" style="margin-left:8px">${ICON.alert()} Dokumente unvollständig</span>`;
    const providerBadge = d.providerType === 'commercial'
      ? `<span class="badge badge-accent" style="margin-left:8px">Gewerblicher Anbieter</span>`
      : `<span class="badge badge-gray" style="margin-left:8px">Privater Anbieter</span>`;
    const head = `
      <div class="item-head">
        <div class="profile-row">
          <div class="avatar">${initials(d.name)}</div>
          <div>
            <div style="font-weight:600;display:flex;align-items:center;flex-wrap:wrap;gap:4px">${esc(d.providerType === 'commercial' && d.company.name ? d.company.name : d.name)}${providerBadge}${docBadge}</div>
            <button class="meta rating-link" data-ratings-driver="${offer.driverId}" data-name="${esc(d.name)}">${starsInline(Math.round(d.rating))} <b>${d.rating}</b> · ${d.trips} Fahrten · Bewertungen ansehen</button>
            <div class="meta">${esc(d.vehicle.make)} ${esc(d.vehicle.model)}</div>
            <div class="pay-row">${paymentBadges(d.payment)}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div class="price-tag">${money(offer.price)}</div>
          <div class="price-sub">${offer.routeKm} km × ${money(offer.pricePerKm)} + ${money(offer.basePrice)}</div>
        </div>
      </div>`;
    const docBtn = `<button class="btn btn-secondary btn-sm" data-docs="${offer.driverId}">${ICON.doc()} Fahrer-Dokumente prüfen</button>`;

    if (!isAccepted) {
      const lowRating = d.rating && d.rating < 4.0;
      const providerLabel = d.providerType === 'commercial' ? 'Gewerblicher Anbieter' : 'Privater Anbieter';
      const providerName = d.providerType === 'commercial' && d.company.name ? d.company.name : d.name;
      return `<div class="item" style="box-shadow:none">
        ${head}
        ${lowRating ? `<div class="notice" style="margin-top:14px;color:var(--red);background:var(--red-soft);border-color:#F0C2C2">${ICON.alert()} Dieser Fahrer hat eine unterdurchschnittliche Bewertung (${d.rating}). Sieh dir die Bewertungen genau an, bevor du annimmst.</div>` : ''}
        <div class="booking-summary">
          <div class="bs-title">Vor der Annahme</div>
          <div class="bs-row"><span>Anbieter</span><b>${esc(providerName)}</b></div>
          <div class="bs-row"><span>Anbieterstatus</span><b>${providerLabel}</b></div>
          <div class="bs-row"><span>Führerschein</span><b>${hasLicense ? 'hinterlegt' : 'nicht hinterlegt'}</b></div>
          <div class="bs-row"><span>Transport-Erlaubnis</span><b>${hasPermit ? 'hinterlegt' : 'nicht hinterlegt'}</b></div>
          <div class="bs-note">Angaben des Fahrers — von Werpfährtmich <b>nicht geprüft</b>. Kontrolliere die Dokumente vor Fahrtantritt selbst. Der Transport wird von ${esc(providerName)} durchgeführt; Werpfährtmich vermittelt nur den Kontakt und ist nicht Vertragspartei.</div>
        </div>
        <div class="item-actions">
          <button class="btn btn-success btn-sm" data-accept="${offer.id}">Angebot annehmen</button>
          <button class="btn btn-secondary btn-sm" data-ratings-driver="${offer.driverId}" data-name="${esc(d.name)}">${ICON.star(true)} Bewertungen</button>
          ${docBtn}
          <button class="btn btn-danger btn-sm" data-reject="${offer.id}">Ablehnen</button>
          <button class="btn-report" data-report="${offer.driverId}" data-name="${esc(d.name)}">${ICON.alert()} Problem melden</button>
        </div>
      </div>`;
    }
    return `<div class="item" style="box-shadow:none">
      ${head}
      <div class="safety-box">
        <div class="safety-head">${ICON.alert()} Sicherheitscheck vor der Übergabe</div>
        <p class="safety-lead">Uns liegt das Wohl Ihres Pferdes am Herzen. Machen Sie am besten ein Foto vom Kennzeichen des Fahrers und gleichen Sie Fahrzeug und Person mit den folgenden Angaben ab, bevor Sie Ihr Pferd übergeben.</p>
        <div class="safety-grid">
          <div class="safety-cell"><div class="sc-lbl">Kennzeichen</div><div class="sc-val plate">${esc(d.vehicle.plate)}</div></div>
          <div class="safety-cell"><div class="sc-lbl">Fahrzeug</div><div class="sc-val">${esc(d.vehicle.make)} ${esc(d.vehicle.model)}</div></div>
          <div class="safety-cell"><div class="sc-lbl">Anhänger</div><div class="sc-val">${esc(d.vehicle.trailer)}</div></div>
          <div class="safety-cell"><div class="sc-lbl">Fahrer</div><div class="sc-val">${esc(d.name)}</div></div>
        </div>
      </div>
      <div class="item-actions" style="margin-top:14px">${docBtn}<span class="meta">Kontakt: <b>${esc(d.phone)}</b></span></div>
      <hr class="divider">
      ${this.lifecyclePanel(offer, 'rider')}
    </div>`;
  },

  lifecyclePanel(offer, viewpoint) {
    const info = API.cancelInfo(offer);
    const myDone = viewpoint === 'rider' ? offer.riderCompleted : offer.driverCompleted;
    const otherDone = viewpoint === 'rider' ? offer.driverCompleted : offer.riderCompleted;
    const otherLabel = viewpoint === 'rider' ? 'Fahrer' : 'Reiter';

    const steps = (active) => `
      <div class="lc-steps">
        <div class="lc-step ${active >= 1 ? (active > 1 ? 'done' : 'active') : ''}"><span class="lc-num">${active > 1 ? '' : '1'}</span>Bestätigt</div>
        <div class="lc-line"></div>
        <div class="lc-step ${active >= 2 ? (active > 2 ? 'done' : 'active') : ''}"><span class="lc-num">${active > 2 ? '' : '2'}</span>Fahrt</div>
        <div class="lc-line"></div>
        <div class="lc-step ${active >= 3 ? 'active' : ''}"><span class="lc-num">3</span>Abschluss</div>
      </div>`;

    if (info.open) {
      return `<div class="lifecycle">${steps(1)}
        <div class="countdown"><span class="cd-time" data-countdown="${offer.acceptedAt}" data-window="${offer.cancelWindowMs}">–:––</span><span class="cd-lbl">bis zur verbindlichen Buchung</span></div>
        <p class="meta" style="font-size:13px;color:var(--ink-3);margin-bottom:14px">Es kann immer etwas dazwischenkommen: In diesem Zeitfenster kann jede Seite kostenlos absagen. Danach ist die Buchung verbindlich und Änderungen laufen nur noch telefonisch.</p>
        <button class="btn btn-danger btn-sm" data-cancel="${offer.id}">Fahrt absagen</button>
      </div>`;
    }
    if (offer.completedAt) {
      const myRating = viewpoint === 'rider' ? offer.ratingByRider : offer.ratingByDriver;
      if (myRating) {
        return `<div class="lifecycle">${steps(4)}
          <div class="hint">Deine Bewertung: ${starsInline(myRating.stars)} ${myRating.comment ? '· „' + esc(myRating.comment) + '"' : ''}</div></div>`;
      }
      return `<div class="lifecycle">${steps(3)}
        <p style="font-size:14px;font-weight:500;margin-bottom:10px">Wie war die Fahrt? Bewerte ${viewpoint === 'rider' ? 'den Fahrer' : 'den Reiter'}.</p>
        ${ratingWidget(offer.id)}</div>`;
    }
    return `<div class="lifecycle">${steps(2)}
      <p class="meta" style="font-size:13px;color:var(--ink-3);margin-bottom:14px">Das Stornofenster ist abgelaufen, die Fahrt ist verbindlich. Nach der Fahrt bestätigen beide Seiten den Abschluss.</p>
      ${myDone
        ? `<div class="hint" style="color:var(--green)">${ICON.check()} Du hast bestätigt. Warte auf ${otherLabel}.</div>`
        : `<button class="btn btn-success btn-sm" data-complete="${offer.id}">Fahrt erfolgreich abgeschlossen</button>`}
      ${otherDone && !myDone ? `<p class="meta" style="margin-top:8px;font-size:13px">${otherLabel} hat bereits bestätigt.</p>` : ''}
    </div>`;
  },

  wireRiderOfferButtons() {
    this.wireLifecycleButtons(() => this.renderRider(), 'rider');
    this.el.querySelectorAll('[data-accept]').forEach((b) =>
      b.addEventListener('click', async () => {
        b.disabled = true; b.textContent = 'Nehme an…';
        try { await API.acceptOffer(b.dataset.accept); toast('Angebot angenommen', 'ok'); this.renderRider(); }
        catch (e) { toast(e.message, 'err'); this.renderRider(); }
      }));
    this.el.querySelectorAll('[data-reject]').forEach((b) =>
      b.addEventListener('click', async () => { await API.rejectOffer(b.dataset.reject); toast('Angebot abgelehnt'); this.renderRider(); }));
  },

  wireLifecycleButtons(rerender, viewpoint) {
    this.startCountdowns(rerender);
    this.el.querySelectorAll('[data-cancel]').forEach((b) =>
      b.addEventListener('click', async () => {
        b.disabled = true;
        try { await API.cancelTrip(b.dataset.cancel, viewpoint); toast('Fahrt abgesagt', 'ok'); rerender(); }
        catch (e) { toast(e.message, 'err'); rerender(); }
      }));
    this.el.querySelectorAll('[data-complete]').forEach((b) =>
      b.addEventListener('click', async () => {
        b.disabled = true; b.textContent = 'Bestätige…';
        try { await API.confirmCompletion(b.dataset.complete, viewpoint); toast('Abschluss bestätigt', 'ok'); rerender(); }
        catch (e) { toast(e.message, 'err'); rerender(); }
      }));
    this.el.querySelectorAll('[data-docs]').forEach((b) =>
      b.addEventListener('click', () => this.showDocsModal(b.dataset.docs)));
    this.wireRatingButtons();
    this.el.querySelectorAll('[data-rate]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const w = btn.closest('.rating-widget'); const s = +w.dataset.stars;
        if (!s) { toast('Bitte Sterne wählen', 'err'); return; }
        btn.disabled = true;
        try { await API.rateTrip(btn.dataset.rate, viewpoint, s, w.querySelector('textarea').value); toast('Danke für deine Bewertung', 'ok'); rerender(); }
        catch (e) { toast(e.message, 'err'); rerender(); }
      }));
    this.el.querySelectorAll('.rating-widget').forEach((w) =>
      w.querySelectorAll('[data-star]').forEach((s) =>
        s.addEventListener('click', () => {
          w.dataset.stars = s.dataset.star;
          w.querySelectorAll('[data-star]').forEach((x) => x.classList.toggle('on', +x.dataset.star <= +s.dataset.star));
        })));
  },

  startCountdowns(rerender) {
    if (this._cdTimer) clearInterval(this._cdTimer);
    const tick = () => {
      const nodes = this.el.querySelectorAll('[data-countdown]');
      if (!nodes.length) { clearInterval(this._cdTimer); return; }
      let expired = false;
      nodes.forEach((n) => {
        const rem = +n.dataset.countdown + +n.dataset.window - Date.now();
        if (rem <= 0) { expired = true; return; }
        const mm = Math.floor(rem / 60000), ss = Math.floor((rem % 60000) / 1000);
        n.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
      });
      if (expired) { clearInterval(this._cdTimer); rerender(); }
    };
    tick(); this._cdTimer = setInterval(tick, 1000);
  },

  async showDocsModal(driverId) {
    const d = await API.getDriver(driverId);
    const row = (label, entry) => entry
      ? `<div class="doc-item"><div class="doc-info"><b>${label}</b><div class="doc-status">${esc(entry.fileName)}</div></div><button class="btn btn-secondary btn-sm" data-view-doc="${esc(entry.path)}">${ICON.doc()} Ansehen</button></div>`
      : `<div class="doc-item missing"><div class="doc-info"><b>${label}</b><div class="doc-status">Nicht hochgeladen</div></div><div>${ICON.alert()}</div></div>`;
    const modal = document.createElement('div');
    modal.className = 'modal-bg';
    modal.innerHTML = `<div class="modal">
      <div class="card-head"><h3>Dokumente — ${esc(d.name)}</h3><button class="btn-reset" data-close>Schließen</button></div>
      <div class="card-pad">
        <div class="notice" style="margin-bottom:16px">Werpfährtmich? prüft diese Dokumente nicht. Kontrolliere selbst, ob Führerschein und Transport-Erlaubnis gültig und auf den Fahrer ausgestellt sind, bevor du dein Pferd übergibst.</div>
        ${row('Führerschein', d.documents?.license)}
        ${row('Pferdetransport-Erlaubnis', d.documents?.transportPermit)}
      </div></div>`;
    modal.addEventListener('click', (e) => { if (e.target === modal || e.target.hasAttribute('data-close')) modal.remove(); });
    modal.querySelectorAll('[data-view-doc]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true; b.textContent = 'Öffne…';
      try { const url = await API.getDocumentUrl(b.dataset.viewDoc); window.open(url, '_blank'); b.innerHTML = `${ICON.doc()} Ansehen`; b.disabled = false; }
      catch (e) { toast('Dokument nicht abrufbar', 'err'); b.disabled = false; }
    }));
    document.body.appendChild(modal);
  },

  wireRatingButtons() {
    this.el.querySelectorAll('[data-ratings-driver]').forEach((b) =>
      b.addEventListener('click', () => this.showRatingsModal('driver', b.dataset.ratingsDriver, b.dataset.name)));
    this.el.querySelectorAll('[data-ratings-rider]').forEach((b) =>
      b.addEventListener('click', () => this.showRatingsModal('rider', b.dataset.ratingsRider, b.dataset.name)));
    this.el.querySelectorAll('[data-report]').forEach((b) =>
      b.addEventListener('click', () => this.showReportModal(b.dataset.report, b.dataset.name)));
  },

  showReportModal(reportedId, name) {
    const cats = [
      'Verdacht auf fehlende Genehmigung',
      'Falsche Angaben zum Anbieterstatus',
      'Problem mit Fahrzeug oder Anhänger',
      'Sicherheitsproblem beim Tiertransport',
      'Betrug oder Zahlungsproblem',
      'Unangemessenes Verhalten',
      'Sonstiger Rechtsverstoß',
    ];
    const modal = document.createElement('div');
    modal.className = 'modal-bg';
    modal.innerHTML = `<div class="modal">
      <div class="card-head"><h3>Problem melden — ${esc(name || '')}</h3><button class="btn-reset" data-close>Schließen</button></div>
      <div class="card-pad">
        <p class="meta" style="font-size:13px;color:var(--ink-3);margin-bottom:14px">Deine Meldung geht vertraulich an den Betreiber und erscheint nicht öffentlich. Beschreibe möglichst konkret, was nicht stimmt.</p>
        <label class="field"><span>Kategorie</span>
          <select id="repCat">${cats.map((c) => `<option>${c}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Beschreibung</span>
          <textarea id="repMsg" placeholder="Was ist das Problem? Je konkreter, desto besser." style="min-height:110px"></textarea>
        </label>
        <button class="btn btn-primary btn-block" id="repSend">Meldung absenden</button>
      </div></div>`;
    modal.addEventListener('click', (e) => { if (e.target === modal || e.target.hasAttribute('data-close')) modal.remove(); });
    modal.querySelector('#repSend').addEventListener('click', async () => {
      const msg = modal.querySelector('#repMsg').value.trim();
      if (!msg) { toast('Bitte beschreibe das Problem', 'err'); return; }
      const btn = modal.querySelector('#repSend'); btn.disabled = true; btn.textContent = 'Sende…';
      try {
        await API.createReport({ reportedId, category: modal.querySelector('#repCat').value, message: msg });
        modal.remove();
        toast('Meldung gesendet — danke für den Hinweis', 'ok');
      } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = 'Meldung absenden'; }
    });
    document.body.appendChild(modal);
  },

  async showRatingsModal(kind, id, name) {
    const isDriver = kind === 'driver';
    const person = isDriver ? await API.getDriver(id) : await API.getRider(id);
    const ratings = isDriver ? await API.listRatingsForDriver(id) : await API.listRatingsForRider(id);
    const avg = person.rating
      ? `<div class="rating-summary"><div class="rs-big">${person.rating}</div><div>${starsInline(Math.round(person.rating))}<div class="meta">${person.trips || 0} bewertete Fahrten</div></div></div>`
      : `<div class="hint">Diese Person ist neu und hat noch keine Bewertungen.</div>`;
    const list = ratings.length
      ? ratings.map((r) => `<div class="review">
          <div class="review-head">${starsInline(r.stars)}<span class="review-from">${esc(r.from)}</span><span class="review-date">${fmtDate(r.at)}</span></div>
          ${r.comment ? `<div class="review-text">${esc(r.comment)}</div>` : '<div class="review-text meta">Kein Kommentar</div>'}
        </div>`).join('')
      : (person.rating ? '<div class="hint">Noch keine schriftlichen Bewertungen vorhanden.</div>' : '');
    const modal = document.createElement('div');
    modal.className = 'modal-bg';
    modal.innerHTML = `<div class="modal">
      <div class="card-head"><h3>Bewertungen — ${esc(name || person.name)}</h3><button class="btn-reset" data-close>Schließen</button></div>
      <div class="card-pad">
        ${avg}
        <div class="section-label" style="margin-top:20px;margin-bottom:12px">${isDriver ? 'Was Reiter über diesen Fahrer sagen' : 'Was Fahrer über diesen Reiter sagen'}</div>
        ${list}
      </div></div>`;
    modal.addEventListener('click', (e) => { if (e.target === modal || e.target.hasAttribute('data-close')) modal.remove(); });
    document.body.appendChild(modal);
  },

  async riderProfile(body) {
    const token = this._renderToken;
    let rider = await API.getRider(this.state.riderId);
    if (token !== this._renderToken) return;
    if (!rider) rider = { name: '', phone: '', location: { label: '', lat: null, lng: null }, horse: {} };
    const h = rider.horse || {};
    body.innerHTML = `
      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><h2>Reiter</h2><span class="badge badge-gray">Person</span></div>
          <div class="card-pad">
            <div class="profile-row" style="margin-bottom:20px"><div class="avatar">${initials(rider.name)}</div><div><div style="font-weight:600">${esc(rider.name)}</div><div class="meta">${esc(rider.phone)}</div></div></div>
            <label class="field"><span>Name</span><input type="text" id="rName" value="${esc(rider.name)}"></label>
            <label class="field"><span>Telefon (Pflicht)</span><input type="tel" id="rPhone" value="${esc(rider.phone)}"></label>
            ${addrField('rloc', 'Standort / Stall', rider.location.label, 'Adresse eingeben')}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Pferd</h2><span class="badge badge-gray">Tier</span></div>
          <div class="card-pad">
            <label class="field"><span>Name</span><input type="text" id="hName" value="${esc(h.name)}"></label>
            <label class="field"><span>Rasse</span><input type="text" id="hBreed" value="${esc(h.breed)}"></label>
            <div class="field-row">
              <label class="field"><span>Stockmaß (cm)</span><input type="number" id="hHeight" value="${h.height}"></label>
              <label class="field"><span>Gewicht (kg)</span><input type="number" id="hWeight" value="${h.weight}"></label>
            </div>
            <label class="field"><span>Temperament</span><select id="hTemp">${['ruhig', 'ausgeglichen', 'nervös', 'jung/unerfahren'].map((t) => `<option ${t === h.temperament ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
            <div class="switch-row"><div><div class="switch-label">Verlädt problemlos</div></div><label class="switch"><input type="checkbox" id="hLoad" ${h.loadingOk ? 'checked' : ''}><span class="track"></span></label></div>
            <label class="field" style="margin-top:8px"><span>Hinweise für den Fahrer</span><textarea id="hNotes">${esc(h.notes)}</textarea></label>
          </div>
        </div>
      </div>
      <div style="margin-top:22px"><button class="btn btn-primary" id="saveRider">Änderungen speichern</button></div>`;

    this.state.draft._rloc = rider.location && rider.location.lat != null ? { ...rider.location } : null;
    this.wireAddrFieldSimple('rloc', (loc) => { this.state.draft._rloc = loc; });
    document.getElementById('saveRider').addEventListener('click', async () => {
      const btn = document.getElementById('saveRider'); btn.disabled = true; btn.textContent = 'Speichere…';
      const patch = {
        name: val('rName'), phone: val('rPhone'),
        horse: { name: val('hName'), breed: val('hBreed'), height: +val('hHeight'), weight: +val('hWeight'), temperament: val('hTemp'), loadingOk: document.getElementById('hLoad').checked, notes: val('hNotes') },
      };
      if (this.state.draft._rloc && this.state.draft._rloc.lat != null) patch.location = this.state.draft._rloc;
      try {
        await API.updateRider(this.state.riderId, patch);
        this.state.draft.pickup = null;
        this.state.profile = await API.getMyProfile();
        this.renderChrome(); this.bindTopbar();
        toast('Profil gespeichert', 'ok');
        this.riderProfile(body);
      } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = 'Änderungen speichern'; }
    });
  },

  /** Einfaches Adressfeld (nur ein Ort, z. B. Profil-Standort). */
  wireAddrFieldSimple(key, onPick) {
    const input = document.getElementById('addr-' + key);
    const results = document.getElementById('addrres-' + key);
    if (!input || !results) return;
    let timer = null;
    const close = () => { results.innerHTML = ''; results.style.display = 'none'; };
    input.addEventListener('input', () => {
      clearTimeout(timer); const q = input.value.trim();
      if (q.length < 3) { close(); return; }
      results.style.display = 'block'; results.innerHTML = '<div class="addr-loading">Suche…</div>';
      timer = setTimeout(async () => {
        try {
          const items = await API.GeoService.search(q);
          if (!items.length) { results.innerHTML = '<div class="addr-loading">Keine Treffer</div>'; return; }
          results.innerHTML = items.map((it, i) => `<div class="addr-item" data-i="${i}"><div class="addr-main">${esc(it.label.split(',')[0])}</div><div class="addr-sub">${esc(it.label.split(',').slice(1, 4).join(',').trim())}</div></div>`).join('');
          results.querySelectorAll('.addr-item').forEach((el) => el.addEventListener('click', () => {
            const it = items[+el.dataset.i];
            input.value = it.shortLabel || it.label;
            onPick({ label: it.shortLabel || it.label, lat: it.lat, lng: it.lng });
            close();
          }));
        } catch (e) { results.innerHTML = '<div class="addr-loading">Nicht erreichbar</div>'; }
      }, 400);
    });
    input.addEventListener('blur', () => setTimeout(close, 180));
  },

  /* =============================================================
   * FAHRER
   * =========================================================== */
  async renderDriver() {
    this.el.innerHTML = `
      <div class="wrap">
        <div class="page-head">
          <div class="eyebrow">Fahrer</div>
          <h1>Anfragen aus deiner Umgebung</h1>
          <p>Du siehst nur Anfragen, die in deinen Radius passen, zu deinen Verfügbarkeitszeiten und deiner Anhänger-Kapazität. Du entscheidest aktiv, ob du ein Angebot abgibst.</p>
        </div>
        <div class="tabs" id="driverTabs">
          <button data-tab="auftraege">Passende Anfragen</button>
          <button data-tab="angebote">Meine Angebote</button>
          <button data-tab="profil">Mein Profil</button>
        </div>
        <div id="driverBody"></div>
      </div>`;
    this.el.querySelectorAll('#driverTabs button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === this.state.driverTab);
      b.addEventListener('click', () => { this.destroyMaps(); this.state.driverTab = b.dataset.tab; this.renderDriver(); });
    });
    const body = document.getElementById('driverBody');
    if (this.state.driverTab === 'auftraege') this.driverRequests(body);
    else if (this.state.driverTab === 'angebote') this.driverOffers(body);
    else this.driverProfile(body);
  },

  async driverRequests(body) {
    const driver = await API.getDriver(this.state.driverId);
    body.innerHTML = `
      <div class="filter-bar">
        <span class="fb-item">${ICON.mapPin()} Umkreis ≤ ${driver.maxRadiusKm} km</span><div class="fb-sep"></div>
        <span class="fb-item">${ICON.clock()} ${driver.availability.from}–${driver.availability.to} Uhr</span><div class="fb-sep"></div>
        <span class="fb-item">${ICON.truck()} bis ${driver.vehicle.capacity} Pferde</span><div class="fb-sep"></div>
        <span class="fb-item">${ICON.route()} ${money(driver.pricePerKm)}/km</span>
      </div>
      <div class="list" id="drReqList">${skeletonList(2)}</div>`;
    const matches = await API.listRequestsForDriver(this.state.driverId);
    const list = document.getElementById('drReqList');
    if (!list) return;
    if (!matches.length) {
      list.innerHTML = emptyState(ICON.inbox(), 'Keine passenden Anfragen', 'Sobald ein Reiter in deinem Umkreis zu einer passenden Zeit anfragt, erscheint die Anfrage hier.');
      return;
    }
    // Reiter-Profile für die passenden Anfragen laden (für Reputation)
    const riders = {};
    for (const m of matches) {
      if (!riders[m.req.riderId]) riders[m.req.riderId] = await API.getRider(m.req.riderId);
    }
    if (!document.getElementById('drReqList')) return;
    list.innerHTML = matches.map((m) => {
      const price = Math.round((driver.basePrice + m.req.routeKm * driver.pricePerKm) * 100) / 100;
      return this.driverRequestCard(m, driver, price, riders[m.req.riderId]);
    }).join('');
    if (!document.getElementById('drReqList')) return;
    requestAnimationFrame(() => {
      matches.forEach((m) => {
        if (!document.getElementById('map-' + m.req.id)) return;
        const line = m.req.routeLine && m.req.routeLine.length > 1
          ? m.req.routeLine : [[m.req.pickup.lat, m.req.pickup.lng], [m.req.dropoff.lat, m.req.dropoff.lng]];
        this.drawRoute('map-' + m.req.id, m.req.pickup, m.req.dropoff, line);
      });
    });
    this.wireDriverOfferButtons();
  },

  driverRequestCard(match, driver, price, rider) {
    const { req, distToPickup } = match;
    const rRating = rider && rider.rating;
    const riderRep = rider
      ? `<button class="meta rating-link" data-ratings-rider="${rider.id}" data-name="${esc(rider.name)}">${esc(rider.name)} · ${rRating ? starsInline(Math.round(rRating)) + ' <b>' + rRating + '</b> · ' + (rider.trips || 0) + ' Fahrten' : 'Neu, noch keine Bewertung'} · ansehen</button>`
      : '';
    const lowRider = rRating && rRating < 4.0;
    return `
      <div class="item">
        <div class="item-head">
          <div style="flex:1">
            <div class="route-line"><span class="dot a"></span>${esc(req.pickup.label)}<span class="arrow">→</span><span class="dot b"></span>${esc(req.dropoff.label)}</div>
            <div class="item-meta">
              <span class="mi">${ICON.route()}<b>${req.routeKm} km</b> Fahrt</span>
              <span class="mi">${ICON.mapPin()}<b>${distToPickup} km</b> bis Abholung</span>
              <span class="mi">${ICON.clock()}${fmtDate(req.when)}</span>
              <span class="mi">${ICON.horse()}${req.horseCount} ${req.horseCount === 1 ? 'Pferd' : 'Pferde'}</span>
              ${req.loadingHelp ? `<span class="mi">${ICON.hand()}Verladehilfe</span>` : ''}
              ${req.urgent ? '<span class="badge badge-amber">Dringend</span>' : ''}
            </div>
            <div style="margin-top:10px">${riderRep}</div>
          </div>
          <div style="text-align:right">
            <div class="price-sub">Dein Angebot</div>
            <div class="price-tag">${money(price)}</div>
            <div class="price-sub">${req.routeKm} km × ${money(driver.pricePerKm)} + ${money(driver.basePrice)}</div>
            <div class="pay-row" style="justify-content:flex-end;margin-top:6px">${paymentBadges(driver.payment)}</div>
          </div>
        </div>
        ${lowRider ? `<div class="notice" style="margin-top:14px;color:var(--red);background:var(--red-soft);border-color:#F0C2C2">${ICON.alert()} Dieser Reiter hat eine unterdurchschnittliche Bewertung (${rRating}). Sieh dir die Bewertungen an, bevor du ein Angebot abgibst.</div>` : ''}
        <div class="map-sm" id="map-${req.id}" style="margin-top:16px"></div>
        <div class="item-actions">
          <button class="btn btn-success btn-sm" data-offer="${req.id}">Angebot abgeben — ${money(price)}</button>
          ${rider ? `<button class="btn btn-secondary btn-sm" data-ratings-rider="${rider.id}" data-name="${esc(rider.name)}">${ICON.star(true)} Reiter-Bewertungen</button>` : ''}
        </div>
      </div>`;
  },

  wireDriverOfferButtons() {
    this.wireRatingButtons();
    this.el.querySelectorAll('[data-offer]').forEach((b) =>
      b.addEventListener('click', async () => {
        b.disabled = true; b.textContent = 'Sende Angebot…';
        try { await API.createOffer({ requestId: b.dataset.offer, driverId: this.state.driverId }); toast('Angebot abgegeben', 'ok'); this.driverRequests(document.getElementById('driverBody')); }
        catch (e) { toast(e.message, 'err'); this.driverRequests(document.getElementById('driverBody')); }
      }));
  },

  async driverOffers(body) {
    body.innerHTML = `<div class="list" id="drOffList">${skeletonList(2)}</div>`;
    const offers = await API.listOffersForDriver(this.state.driverId);
    const list = document.getElementById('drOffList');
    if (!list) return;
    if (!offers.length) {
      list.innerHTML = emptyState(ICON.doc(), 'Noch keine Angebote', 'Im Tab „Passende Anfragen" kannst du Angebote abgeben.');
      return;
    }
    const riders = {};
    for (const o of offers) if (!riders[o.request.riderId]) riders[o.request.riderId] = await API.getRider(o.request.riderId);
    if (!document.getElementById('drOffList')) return;
    list.innerHTML = offers.map((o) => {
      const r = o.request, rider = riders[r.riderId];
      const st = { pending: '<span class="badge badge-accent badge-dot">Wartet auf Reiter</span>', on_hold: '<span class="badge badge-gray">Zurückgestellt</span>', accepted: '<span class="badge badge-green badge-dot">Angenommen</span>', rejected: o.cancelledBy ? '<span class="badge badge-red">Storniert</span>' : '<span class="badge badge-gray">Abgelehnt</span>' }[o.status];
      const lifecycle = o.status === 'accepted'
        ? `<hr class="divider"><div class="item-actions" style="margin-top:0;margin-bottom:14px"><span class="meta">Reiter: <b>${esc(rider.name)}</b> · Kontakt: <b>${esc(rider.phone)}</b></span></div>${this.lifecyclePanel(o, 'driver')}`
        : '';
      return `<div class="item">
        <div class="item-head">
          <div style="flex:1"><div class="route-line"><span class="dot a"></span>${esc(r.pickup.label)}<span class="arrow">→</span><span class="dot b"></span>${esc(r.dropoff.label)}</div>
          <div class="item-meta"><span class="mi">${ICON.route()}<b>${r.routeKm} km</b></span><span class="mi">${ICON.clock()}${fmtDate(r.when)}</span><span class="mi">${ICON.horse()}${r.horseCount}</span></div></div>
          <div style="text-align:right"><div class="price-tag">${money(o.price)}</div><div style="margin-top:4px">${st}</div></div>
        </div>${lifecycle}</div>`;
    }).join('');
    this.wireLifecycleButtons(() => this.driverOffers(document.getElementById('driverBody')), 'driver');
  },

  async driverProfile(body) {
    const token = this._renderToken;
    let d = await API.getDriver(this.state.driverId);
    if (token !== this._renderToken) return;
    if (!d) d = { name: '', phone: '', location: { label: '', lat: null, lng: null }, vehicle: {}, availability: {}, payment: {}, documents: {} };
    const av = d.availability || {};
    const days = [['mon', 'Mo'], ['tue', 'Di'], ['wed', 'Mi'], ['thu', 'Do'], ['fri', 'Fr'], ['sat', 'Sa'], ['sun', 'So']];
    body.innerHTML = `
      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><h2>Fahrer</h2><span class="badge badge-gray">Person</span></div>
          <div class="card-pad">
            <div class="profile-row" style="margin-bottom:16px"><div class="avatar">${initials(d.name)}</div><div><div style="font-weight:600">${esc(d.name)}</div><div class="meta">${starsInline(Math.round(d.rating))} ${d.rating} · ${d.trips} Fahrten</div></div></div>
            <hr class="divider">
            <label class="field"><span>Name</span><input type="text" id="dName" value="${esc(d.name)}"></label>
            <label class="field"><span>Telefon (Pflicht)</span><input type="tel" id="dPhone" value="${esc(d.phone)}"></label>
            ${addrField('dloc', 'Standort', d.location.label, 'Adresse eingeben')}
            <hr class="divider">
            <div class="section-label" style="margin-bottom:8px">In welcher Eigenschaft bietest du an?</div>
            <div class="provider-picker">
              <button type="button" class="prov-opt ${d.providerType !== 'commercial' ? 'on' : ''}" data-prov="private">Privatperson</button>
              <button type="button" class="prov-opt ${d.providerType === 'commercial' ? 'on' : ''}" data-prov="commercial">Gewerblicher Anbieter</button>
            </div>
            <p class="meta" style="font-size:12px;color:var(--ink-3);margin:8px 0 0">Deine Auswahl muss deiner tatsächlichen Tätigkeit entsprechen. Ändert sie sich, aktualisiere den Status.</p>
            <div id="companyFields" style="margin-top:14px;${d.providerType === 'commercial' ? '' : 'display:none'}">
              <label class="field"><span>Unternehmensname</span><input type="text" id="cName" value="${esc(d.company.name)}"></label>
              <label class="field"><span>Geschäftsanschrift</span><input type="text" id="cAddr" value="${esc(d.company.address)}"></label>
              <label class="field"><span>Registernummer (falls vorhanden)</span><input type="text" id="cReg" value="${esc(d.company.register)}"></label>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Fahrzeug &amp; Anhänger</h2><span class="badge badge-gray">Gespann</span></div>
          <div class="card-pad">
            <div class="field-row">
              <label class="field"><span>Marke</span><input type="text" id="vMake" value="${esc(d.vehicle.make)}"></label>
              <label class="field"><span>Modell</span><input type="text" id="vModel" value="${esc(d.vehicle.model)}"></label>
            </div>
            <label class="field"><span>Anhänger</span><input type="text" id="vTrailer" value="${esc(d.vehicle.trailer)}"></label>
            <div class="field-row">
              <label class="field"><span>Kapazität (Pferde)</span><input type="number" id="vCap" value="${d.vehicle.capacity}"></label>
              <label class="field"><span>Kennzeichen</span><input type="text" id="vPlate" value="${esc(d.vehicle.plate)}"></label>
            </div>
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:20px">
        <div class="card-head"><h2>Preise &amp; Verfügbarkeit</h2></div>
        <div class="card-pad">
          <div class="field-row-3">
            <label class="field"><span>Kilometerpreis (€)</span><input type="number" step="0.1" id="pKm" value="${d.pricePerKm}"></label>
            <label class="field"><span>Anfahrtspauschale (€)</span><input type="number" step="1" id="pBase" value="${d.basePrice}"></label>
            <label class="field"><span>Max. Umkreis (km)</span><input type="number" id="pRadius" value="${Math.min(d.maxRadiusKm, 65)}" min="1" max="65"><span class="field-hint">Höchstens 65 km — bis zu dieser Entfernung gelten nach der EU-Tiertransportverordnung geringere Anforderungen.</span></label>
          </div>
          <div class="section-label" style="margin-top:6px">Verfügbare Tage</div>
          <div class="day-picker" id="dayPicker" style="margin-bottom:18px">${days.map(([k, l]) => `<button type="button" class="day-btn ${av[k] ? 'on' : ''}" data-day="${k}">${l}</button>`).join('')}</div>
          <div class="field-row" style="max-width:320px">
            <label class="field"><span>Verfügbar ab</span><input type="time" id="avFrom" value="${av.from}"></label>
            <label class="field"><span>Verfügbar bis</span><input type="time" id="avTo" value="${av.to}"></label>
          </div>
          <div class="section-label" style="margin-top:6px">Akzeptierte Zahlungsarten</div>
          <p class="meta" style="font-size:12.5px;color:var(--ink-3);margin:-6px 0 12px">Wähle, wie du bezahlt werden möchtest. Reiter sehen das vor der Annahme.</p>
          <div class="pay-picker" id="payPicker">
            <button type="button" class="pay-opt ${d.payment?.cash ? 'on' : ''}" data-pay="cash">${ICON.cash()} Bar</button>
            <button type="button" class="pay-opt ${d.payment?.card ? 'on' : ''}" data-pay="card">${ICON.card()} Karte</button>
            <button type="button" class="pay-opt ${d.payment?.invoice ? 'on' : ''}" data-pay="invoice">${ICON.invoice()} Rechnung</button>
          </div>
          <div class="hint" style="margin-top:18px">Beispiel: Eine 30-km-Fahrt kostet beim aktuellen Tarif <b id="exCalc">${money(d.basePrice + 30 * d.pricePerKm)}</b>.</div>
        </div>
      </div>
      <div class="card" style="margin-top:20px">
        <div class="card-head"><h2>Dokumente</h2><span class="badge badge-gray">Reiter prüft vor Fahrt</span></div>
        <div class="card-pad">
          <div class="notice-neutral" style="margin-bottom:16px">Lade Führerschein und deine Pferdetransport-Erlaubnis hoch. Reiter sehen diese unter deinem Angebot und prüfen sie vor Fahrtantritt selbst.</div>
          ${docUploadRow('license', 'Führerschein', d.documents?.license)}
          ${docUploadRow('transportPermit', 'Pferdetransport-Erlaubnis', d.documents?.transportPermit)}
        </div>
      </div>
      <div style="margin-top:22px"><button class="btn btn-primary" id="saveDriver">Änderungen speichern</button></div>`;

    this.state.draft._dloc = d.location && d.location.lat != null ? { ...d.location } : null;
    this.wireAddrFieldSimple('dloc', (loc) => { this.state.draft._dloc = loc; });
    const recalc = () => { document.getElementById('exCalc').textContent = money((+val('pBase') || 0) + 30 * (+val('pKm') || 0)); };
    ['pKm', 'pBase'].forEach((id) => document.getElementById(id).addEventListener('input', recalc));
    body.querySelectorAll('[data-day]').forEach((btn) => btn.addEventListener('click', () => btn.classList.toggle('on')));
    body.querySelectorAll('[data-pay]').forEach((btn) => btn.addEventListener('click', () => btn.classList.toggle('on')));
    // Anbieterstatus-Umschalter (exklusiv) + Firmenfelder ein-/ausblenden
    body.querySelectorAll('[data-prov]').forEach((btn) => btn.addEventListener('click', () => {
      body.querySelectorAll('[data-prov]').forEach((x) => x.classList.remove('on'));
      btn.classList.add('on');
      const cf = document.getElementById('companyFields');
      if (cf) cf.style.display = btn.dataset.prov === 'commercial' ? '' : 'none';
    }));
    body.querySelectorAll('[data-upload]').forEach((inp) => inp.addEventListener('change', async () => {
      const file = inp.files[0]; if (!file) return;
      const st = body.querySelector(`[data-doc-row="${inp.dataset.upload}"] .doc-status`);
      if (st) st.textContent = 'Wird hochgeladen…';
      try {
        await API.uploadDocument(this.state.driverId, inp.dataset.upload, file);
        if (st) st.textContent = file.name;
        toast('Dokument hochgeladen', 'ok');
      } catch (e) {
        if (st) st.textContent = 'Upload fehlgeschlagen';
        toast(e.message, 'err');
      }
    }));
    document.getElementById('saveDriver').addEventListener('click', async () => {
      const btn = document.getElementById('saveDriver'); btn.disabled = true; btn.textContent = 'Speichere…';
      const availability = { from: val('avFrom'), to: val('avTo') };
      body.querySelectorAll('[data-day]').forEach((b) => { availability[b.dataset.day] = b.classList.contains('on'); });
      const payment = { cash: false, card: false, invoice: false };
      body.querySelectorAll('[data-pay]').forEach((b) => { payment[b.dataset.pay] = b.classList.contains('on'); });
      const provBtn = body.querySelector('[data-prov].on');
      const providerType = provBtn ? provBtn.dataset.prov : 'private';
      if (!payment.cash && !payment.card && !payment.invoice) {
        toast('Bitte mindestens eine Zahlungsart wählen', 'err');
        btn.disabled = false; btn.textContent = 'Änderungen speichern'; return;
      }
      if (!this.state.draft._dloc || this.state.draft._dloc.lat == null) {
        toast('Bitte einen Standort wählen — Reiter finden dich über den Umkreis', 'err');
        btn.disabled = false; btn.textContent = 'Änderungen speichern'; return;
      }
      if (providerType === 'commercial' && !val('cName').trim()) {
        toast('Bitte den Unternehmensnamen angeben', 'err');
        btn.disabled = false; btn.textContent = 'Änderungen speichern'; return;
      }
      try {
        await API.updateDriver(this.state.driverId, {
          name: val('dName'), phone: val('dPhone'), location: this.state.draft._dloc,
          vehicle: { make: val('vMake'), model: val('vModel'), trailer: val('vTrailer'), capacity: +val('vCap'), plate: val('vPlate') },
          pricePerKm: +val('pKm'), basePrice: +val('pBase'), maxRadiusKm: Math.min(Math.max(+val('pRadius') || 1, 1), 65), availability, payment,
          providerType,
          company: providerType === 'commercial' ? { name: val('cName'), address: val('cAddr'), register: val('cReg') } : { name: '', address: '', register: '' },
        });
        this.state.profile = await API.getMyProfile();
        this.renderChrome(); this.bindTopbar();
        toast('Fahrerprofil gespeichert', 'ok');
        this.driverProfile(body);
      } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = 'Änderungen speichern'; }
    });
  },
};

/* ===============================================================
 * Utilities
 * ============================================================= */
function val(id) { return document.getElementById(id).value; }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function initials(name) { return (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'; }
function money(n) { return Number(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function fmtDate(ts) { return new Date(ts).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
function defaultWhen() { const d = new Date(Date.now() + 3 * 3600e3); d.setMinutes(0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function starsInline(n) { return `<span class="stars-display">${Array.from({ length: 5 }).map((_, i) => ICON.star(i < n)).join('')}</span>`; }
function paymentList(p) {
  if (!p) return [];
  const out = [];
  if (p.cash) out.push({ key: 'cash', label: 'Bar', icon: ICON.cash() });
  if (p.card) out.push({ key: 'card', label: 'Karte', icon: ICON.card() });
  if (p.invoice) out.push({ key: 'invoice', label: 'Rechnung', icon: ICON.invoice() });
  return out;
}
function paymentBadges(p) {
  const list = paymentList(p);
  if (!list.length) return `<span class="badge badge-gray">Zahlung nicht angegeben</span>`;
  return list.map((x) => `<span class="pay-badge">${x.icon}${x.label}</span>`).join('');
}
function skeletonList(n) { return Array.from({ length: n }).map(() => `<div class="item"><div class="skeleton" style="height:18px;width:55%;margin-bottom:14px"></div><div class="skeleton" style="height:180px;width:100%;border-radius:8px"></div></div>`).join(''); }
function emptyState(ico, title, sub) { return `<div class="empty"><div class="ico">${ico}</div><h3>${title}</h3><p>${sub}</p></div>`; }
function transparencyBanner() {
  return `<div class="transparency-note">
    <div class="tn-title">Transparente Anbieterprofile</div>
    <p>Informiere dich anhand von Anbieterangaben, hinterlegten Informationen und Bewertungen anderer Nutzer. <b>Werpfährtmich prüft die von Anbietern gemachten Angaben und bereitgestellten Dokumente grundsätzlich nicht auf ihre rechtliche Gültigkeit. Anbieter sind selbst für die Einhaltung der für ihre Transportleistungen geltenden gesetzlichen Voraussetzungen verantwortlich.</b></p>
  </div>`;
}
function addrField(key, label, value, ph) {
  return `<label class="field"><span>${label}</span>
    <div class="addr-wrap">
      <input type="text" id="addr-${key}" value="${esc(value)}" placeholder="${ph}" autocomplete="off">
      <div class="addr-results" id="addrres-${key}" style="display:none"></div>
    </div></label>`;
}
function stepperField(id, value, min, max) {
  return `<div class="stepper" data-stepper="${id}"><button type="button" data-dec>−</button><input type="number" id="${id}" value="${value}" min="${min}" max="${max}" readonly><button type="button" data-inc>+</button></div>`;
}
function docUploadRow(kind, label, entry) {
  return `<div class="doc-item ${entry ? '' : 'missing'}" data-doc-row="${kind}">
    <div class="doc-info"><b>${label}</b><div class="doc-status">${entry ? esc(entry.fileName) : 'Noch nicht hochgeladen'}</div></div>
    <label class="btn btn-secondary btn-sm" style="cursor:pointer">${ICON.upload()} ${entry ? 'Ersetzen' : 'Hochladen'}<input type="file" data-upload="${kind}" accept="image/*,application/pdf" style="display:none"></label>
  </div>`;
}
function ratingWidget(offerId) {
  return `<div class="rating-widget" data-stars="0">
    <div class="star-picker">${[1, 2, 3, 4, 5].map((i) => `<span class="star-pick" data-star="${i}">${ICON.star(true)}</span>`).join('')}</div>
    <textarea placeholder="Kommentar (optional)"></textarea>
    <button class="btn btn-success btn-sm" data-rate="${offerId}" style="margin-top:10px">Bewertung abschicken</button>
  </div>`;
}
function toast(msg, kind = '') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  const ic = kind === 'ok' ? ICON.check() : kind === 'err' ? ICON.x() : '';
  t.innerHTML = ic + '<span>' + esc(msg) + '</span>';
  wrap.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 2600);
}

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());

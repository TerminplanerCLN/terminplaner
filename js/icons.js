/* icons.js — SVG-Icon-Set (Feather-Stil, 1.75px stroke). Keine Emojis. */
const ICON = {
  _s: (p) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`,

  /* Markenmotiv: Pferdetransporter mit Standort-Pin + Pferdekopf.
     color = Vordergrundfarbe, bg = Aussparungsfarbe (Hintergrund).
     Skaliert sauber von der Topbar bis zum Vollbild. */
  logoArt: (color = '#fff', bg = '#4338CA') => `<svg viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg" fill="${color}" style="display:block;width:100%;height:100%">
    <rect x="6" y="66" width="26" height="7" rx="3.5"/>
    <rect x="14" y="84" width="20" height="7" rx="3.5"/>
    <path d="M48 52 h110 a10 10 0 0 1 10 10 v11 h18 l24 24 v19 a7 7 0 0 1-7 7 h-13 a19 19 0 0 0-38 0 h-38 a19 19 0 0 0-38 0 h-6 a7 7 0 0 1-7-7 V62 a10 10 0 0 1 10-10 z"/>
    <path fill="${bg}" d="M172 78 h10 l15 15 h-25 z"/>
    <rect fill="${bg}" x="58" y="62" width="14" height="11" rx="2"/>
    <rect fill="${bg}" x="78" y="62" width="14" height="11" rx="2"/>
    <rect fill="${bg}" x="58" y="80" width="4" height="33" rx="2"/>
    <circle cx="94" cy="126" r="14"/><circle cx="94" cy="126" r="6.5" fill="${bg}"/>
    <circle cx="170" cy="126" r="14"/><circle cx="170" cy="126" r="6.5" fill="${bg}"/>
    <path fill="${bg}" d="M120 50 a41 41 0 0 1 41 41 c0 27-41 54-41 54 s-41-27-41-54 a41 41 0 0 1 41-41 z"/>
    <path fill="${color}" d="M120 58 a33 33 0 0 1 33 33 c0 22-33 45-33 45 s-33-23-33-45 a33 33 0 0 1 33-33 z"/>
    <g transform="translate(96,64) scale(0.72)" fill="${bg}">
      <path d="M40 32 C38 27 42 23 46 26 L51 33 C56 30 62 31 66 35 C71 40 73 47 72 54 C72 56 73 58 76 59 L83 63 C86 65 85 68 82 69 L73 70 C71 75 67 79 62 81 L64 94 C65 98 60 100 57 97 L51 89 C45 87 41 82 39 76 C36 68 37 58 41 51 C39 47 38 42 40 38 Z"/>
      <path d="M44 30 L47 20 C48 17 52 18 52 21 L51 33 Z"/>
    </g>
  </svg>`,

  logo: () => `<img src="logo.png" alt="Werpfährtmich?" style="width:100%;height:100%;object-fit:contain;display:block">`,

  mapPin: () => ICON._s('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'),
  flag: () => ICON._s('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1Z"/><line x1="4" y1="22" x2="4" y2="15"/>'),
  clock: () => ICON._s('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  route: () => ICON._s('<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h6a4 4 0 0 0 0-8H10a4 4 0 0 1 0-8h6"/>'),
  horse: () => ICON._s('<path d="M5 17h14M6 17l1.5-5h9L18 17M8 12l1-4h6l1 4M9 8V6a3 3 0 0 1 6 0v2"/>'),
  users: () => ICON._s('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  hand: () => ICON._s('<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>'),
  truck: () => ICON._s('<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>'),
  phone: () => ICON._s('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/>'),
  doc: () => ICON._s('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>'),
  check: () => ICON._s('<path d="M20 6 9 17l-5-5"/>'),
  x: () => ICON._s('<path d="M18 6 6 18M6 6l12 12"/>'),
  alert: () => ICON._s('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/>'),
  star: (fill) => `<svg viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01Z"/></svg>`,
  inbox: () => ICON._s('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>'),
  send: () => ICON._s('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'),
  edit: () => ICON._s('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>'),
  upload: () => ICON._s('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>'),
  card: () => ICON._s('<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>'),
  cash: () => ICON._s('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>'),
  invoice: () => ICON._s('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/>'),
  wallet: () => ICON._s('<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>'),
};
window.ICON = ICON;

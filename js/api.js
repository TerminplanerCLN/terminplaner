/* =====================================================================
 * api.js — Datenschicht auf Supabase (Auth + Postgres + Storage)
 * =====================================================================
 * WICHTIG: Die Methodennamen und Rückgabeformate sind bewusst identisch
 * zum ursprünglichen Prototyp gehalten. Dadurch funktioniert das gesamte
 * Frontend (app.js) unverändert — nur die Daten kommen jetzt aus einer
 * echten Datenbank statt aus dem Browser-Speicher.
 * =================================================================== */

/* ---- Supabase-Client initialisieren ---- */
const _cfg = window.WPM_CONFIG || {};
if (!_cfg.SUPABASE_URL || _cfg.SUPABASE_URL.startsWith('DEINE')) {
  console.error('Supabase ist noch nicht konfiguriert. Bitte js/config.js ausfüllen.');
}
const sb = window.supabase.createClient(_cfg.SUPABASE_URL, _cfg.SUPABASE_ANON_KEY);

/* ---------------------------------------------------------------
 * Geo-Helfer (unverändert aus dem Prototyp)
 * ------------------------------------------------------------- */
const Geo = {
  haversineKm(a, b) {
    const R = 6371, toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  },
  routeKm(a, b) { return this.haversineKm(a, b) * 1.3; },
};

/* ---------------------------------------------------------------
 * Geocoding & Routing (Nominatim + OSRM), unverändert
 * ------------------------------------------------------------- */
const GeoService = {
  async search(query, near) {
    if (!query || query.trim().length < 3) return [];
    let url = 'https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=de,at,ch&addressdetails=1&q=' + encodeURIComponent(query);
    if (near && near.lat && near.lng) {
      const d = 1.5;
      url += `&viewbox=${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`;
    }
    const res = await fetch(url, { headers: { 'Accept-Language': 'de' } });
    if (!res.ok) throw new Error('Adresssuche nicht erreichbar');
    let data = await res.json();
    if (near && near.lat && near.lng) {
      data = data.sort((a, b) =>
        Geo.haversineKm(near, { lat: +a.lat, lng: +a.lon }) -
        Geo.haversineKm(near, { lat: +b.lat, lng: +b.lon }));
    }
    return data.map((d) => ({
      label: d.display_name,
      shortLabel: d.display_name.split(',').slice(0, 3).join(',').trim(),
      lat: parseFloat(d.lat), lng: parseFloat(d.lon),
    }));
  },
  async route(a, b) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('routing down');
      const data = await res.json();
      const r = data.routes[0];
      return {
        km: Math.round((r.distance / 1000) * 10) / 10,
        minutes: Math.round(r.duration / 60),
        line: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        estimated: false,
      };
    } catch (e) {
      return { km: Math.round(Geo.routeKm(a, b) * 10) / 10, minutes: null, line: [[a.lat, a.lng], [b.lat, b.lng]], estimated: true };
    }
  },
};

/* ---------------------------------------------------------------
 * Mapping-Helfer: DB-Zeile (snake_case) <-> App-Objekt (camelCase)
 * Damit app.js dieselbe Objektform wie im Prototyp bekommt.
 * ------------------------------------------------------------- */
function rowToRider(p) {
  if (!p) return null;
  return {
    id: p.id, name: p.full_name, phone: p.phone,
    rating: p.rider_rating, trips: p.rider_trips || 0,
    isAdmin: !!p.is_admin, isBlocked: !!p.is_blocked,
    blockedUntil: p.blocked_until || null, warnings: p.warnings || 0, offersDisabled: !!p.offers_disabled,
    location: p.location_lat != null
      ? { label: p.location_label, lat: p.location_lat, lng: p.location_lng }
      : { label: '', lat: null, lng: null },
    horse: {
      name: p.horse_name || '', breed: p.horse_breed || '',
      height: p.horse_height || 0, weight: p.horse_weight || 0,
      temperament: p.horse_temperament || 'ruhig',
      loadingOk: p.horse_loading_ok !== false, notes: p.horse_notes || '',
    },
  };
}
function rowToDriver(p) {
  if (!p) return null;
  return {
    id: p.id, name: p.full_name, phone: p.phone,
    rating: p.driver_rating, trips: p.driver_trips || 0,
    isAdmin: !!p.is_admin, isBlocked: !!p.is_blocked,
    blockedUntil: p.blocked_until || null, warnings: p.warnings || 0, offersDisabled: !!p.offers_disabled,
    providerType: p.provider_type || 'private',
    company: { name: p.company_name || '', address: p.company_address || '', register: p.company_register || '' },
    selfDeclaredAt: p.self_declaration_at || null,
    location: p.location_lat != null
      ? { label: p.location_label, lat: p.location_lat, lng: p.location_lng }
      : { label: '', lat: null, lng: null },
    vehicle: {
      make: p.vehicle_make || '', model: p.vehicle_model || '',
      trailer: p.vehicle_trailer || '', capacity: p.vehicle_capacity || 2,
      plate: p.vehicle_plate || '',
    },
    pricePerKm: Number(p.price_per_km) || 0, basePrice: Number(p.base_price) || 0,
    maxRadiusKm: p.max_radius_km || 40,
    availability: {
      mon: p.av_mon, tue: p.av_tue, wed: p.av_wed, thu: p.av_thu,
      fri: p.av_fri, sat: p.av_sat, sun: p.av_sun, from: p.av_from, to: p.av_to,
    },
    payment: { cash: p.pay_cash, card: p.pay_card, invoice: p.pay_invoice },
    documents: {
      license: p.doc_license_path ? { fileName: p.doc_license_name, path: p.doc_license_path } : null,
      transportPermit: p.doc_permit_path ? { fileName: p.doc_permit_name, path: p.doc_permit_path } : null,
    },
  };
}
function rowToRequest(r) {
  if (!r) return null;
  return {
    id: r.id, riderId: r.rider_id,
    pickup: { label: r.pickup_label, lat: r.pickup_lat, lng: r.pickup_lng },
    dropoff: { label: r.dropoff_label, lat: r.dropoff_lat, lng: r.dropoff_lng },
    when: new Date(r.when_ts).getTime(),
    urgent: r.urgent, horseCount: r.horse_count, loadingHelp: r.loading_help,
    routeKm: Number(r.route_km), routeMinutes: r.route_minutes, routeLine: r.route_line,
    status: r.status, acceptedOfferId: r.accepted_offer_id,
    createdAt: new Date(r.created_at).getTime(),
  };
}
function rowToOffer(o) {
  if (!o) return null;
  return {
    id: o.id, requestId: o.request_id, driverId: o.driver_id,
    price: Number(o.price), pricePerKm: Number(o.price_per_km), basePrice: Number(o.base_price),
    routeKm: Number(o.route_km), status: o.status,
    acceptedAt: o.accepted_at ? new Date(o.accepted_at).getTime() : null,
    cancelWindowMs: o.cancel_window_ms,
    cancelledBy: o.cancelled_by, cancelledAt: o.cancelled_at ? new Date(o.cancelled_at).getTime() : null,
    riderCompleted: o.rider_completed, driverCompleted: o.driver_completed,
    completedAt: o.completed_at ? new Date(o.completed_at).getTime() : null,
    ratingByRider: o.rating_by_rider_stars ? { stars: o.rating_by_rider_stars, comment: o.rating_by_rider_comment || '', at: new Date(o.rating_by_rider_at).getTime() } : null,
    ratingByDriver: o.rating_by_driver_stars ? { stars: o.rating_by_driver_stars, comment: o.rating_by_driver_comment || '', at: new Date(o.rating_by_driver_at).getTime() } : null,
  };
}

/* ---------------------------------------------------------------
 * Öffentliche API — gleiche Methoden wie im Prototyp
 * ------------------------------------------------------------- */
const API = {
  Geo, GeoService,

  /* ==== AUTH ==== */
  async signUp(email, password, fullName, phone) {
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, phone } },
    });
    if (error) throw new Error(_authMsg(error.message));
    return data;
  },
  async signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(_authMsg(error.message));
    return data;
  },
  async signOut() { await sb.auth.signOut(); },
  async currentUser() {
    const { data } = await sb.auth.getUser();
    return data.user || null;
  },
  onAuthChange(cb) { sb.auth.onAuthStateChange((_e, session) => cb(session?.user || null)); },

  /* ==== PROFIL ==== */
  async getMyProfile() {
    const u = await this.currentUser();
    if (!u) return null;
    // maybeSingle: liefert null statt Fehler, wenn (noch) keine Zeile da ist
    const { data, error } = await sb.from('profiles').select('*').eq('id', u.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data;
    // Kein Profil vorhanden (z. B. Trigger hat nicht gegriffen) -> selbst anlegen
    const meta = u.user_metadata || {};
    const { data: created, error: insErr } = await sb.from('profiles').insert({
      id: u.id,
      full_name: meta.full_name || '',
      phone: meta.phone || '',
    }).select().single();
    if (insErr) throw new Error(insErr.message);
    return created;
  },
  async getRider(id) {
    const { data, error } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return rowToRider(data);
  },
  async getDriver(id) {
    const { data, error } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return rowToDriver(data);
  },
  async updateRider(id, patch) {
    const row = {};
    if (patch.name != null) row.full_name = patch.name;
    if (patch.phone != null) row.phone = patch.phone;
    if (patch.location) { row.location_label = patch.location.label; row.location_lat = patch.location.lat; row.location_lng = patch.location.lng; }
    if (patch.horse) {
      const h = patch.horse;
      Object.assign(row, {
        horse_name: h.name, horse_breed: h.breed, horse_height: h.height, horse_weight: h.weight,
        horse_temperament: h.temperament, horse_loading_ok: h.loadingOk, horse_notes: h.notes,
      });
    }
    row.is_rider = true;
    const { data, error } = await sb.from('profiles').update(row).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return rowToRider(data);
  },
  async updateDriver(id, patch) {
    const row = {};
    if (patch.name != null) row.full_name = patch.name;
    if (patch.phone != null) row.phone = patch.phone;
    if (patch.location) { row.location_label = patch.location.label; row.location_lat = patch.location.lat; row.location_lng = patch.location.lng; }
    if (patch.vehicle) {
      const v = patch.vehicle;
      Object.assign(row, { vehicle_make: v.make, vehicle_model: v.model, vehicle_trailer: v.trailer, vehicle_capacity: v.capacity, vehicle_plate: v.plate });
    }
    if (patch.pricePerKm != null) row.price_per_km = patch.pricePerKm;
    if (patch.basePrice != null) row.base_price = patch.basePrice;
    if (patch.maxRadiusKm != null) row.max_radius_km = patch.maxRadiusKm;
    if (patch.availability) {
      const a = patch.availability;
      Object.assign(row, { av_mon: a.mon, av_tue: a.tue, av_wed: a.wed, av_thu: a.thu, av_fri: a.fri, av_sat: a.sat, av_sun: a.sun, av_from: a.from, av_to: a.to });
    }
    if (patch.payment) { row.pay_cash = patch.payment.cash; row.pay_card = patch.payment.card; row.pay_invoice = patch.payment.invoice; }
    if (patch.providerType) row.provider_type = patch.providerType;
    if (patch.company) { row.company_name = patch.company.name; row.company_address = patch.company.address; row.company_register = patch.company.register; }
    row.is_driver = true;
    const { data, error } = await sb.from('profiles').update(row).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return rowToDriver(data);
  },

  /* ==== ANFRAGEN ==== */
  async createRequest({ riderId, pickup, dropoff, when, urgent, horseCount, loadingHelp, route }) {
    const routeKm = route && route.km ? route.km : Math.round(Geo.routeKm(pickup, dropoff) * 10) / 10;
    const row = {
      rider_id: riderId,
      pickup_label: pickup.label, pickup_lat: pickup.lat, pickup_lng: pickup.lng,
      dropoff_label: dropoff.label, dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng,
      when_ts: new Date(when).toISOString(),
      urgent: !!urgent, horse_count: Math.max(1, horseCount || 1), loading_help: !!loadingHelp,
      route_km: routeKm, route_minutes: route?.minutes || null,
      route_line: route?.line || [[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]],
      status: 'open',
    };
    const { data, error } = await sb.from('requests').insert(row).select().single();
    if (error) throw new Error(error.message);
    return rowToRequest(data);
  },
  async listRequestsForRider(riderId) {
    const { data, error } = await sb.from('requests').select('*').eq('rider_id', riderId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data.map(rowToRequest);
  },
  async getRequest(id) {
    const { data, error } = await sb.from('requests').select('*').eq('id', id).single();
    if (error) return null;
    return rowToRequest(data);
  },

  /**
   * Prüft, ob ein Fahrer aktuell keine Angebote abgeben darf.
   * Gibt null zurück, wenn aktiv, sonst einen Grund-Text.
   */
  driverBlockReason(driver) {
    if (!driver) return null;
    if (driver.isBlocked) return 'Dein Konto wurde dauerhaft gesperrt. Bitte kontaktiere den Betreiber.';
    if (driver.blockedUntil && new Date(driver.blockedUntil).getTime() > Date.now()) {
      const bis = new Date(driver.blockedUntil).toLocaleDateString('de-DE');
      return `Dein Konto ist vorübergehend gesperrt (bis ${bis}).`;
    }
    if (driver.offersDisabled) return 'Deine Angebote wurden vom Betreiber vorübergehend deaktiviert.';
    return null;
  },

  async listRequestsForDriver(driverId) {
    const driver = await this.getDriver(driverId);
    if (!driver || driver.location.lat == null) return [];
    if (this.driverBlockReason(driver)) return []; // gesperrter/inaktiver Fahrer sieht keine Anfragen
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const { data: reqs, error } = await sb.from('requests').select('*').eq('status', 'open');
    if (error) throw new Error(error.message);
    const { data: myOffers } = await sb.from('offers').select('request_id').eq('driver_id', driverId);
    const offeredIds = new Set((myOffers || []).map((o) => o.request_id));
    return reqs.map((r) => rowToRequest(r)).map((req) => {
      const distToPickup = Geo.haversineKm(driver.location, req.pickup);
      const day = new Date(req.when).getDay();
      const timeStr = new Date(req.when).toTimeString().slice(0, 5);
      return {
        req, distToPickup: Math.round(distToPickup * 10) / 10,
        inRadius: distToPickup <= driver.maxRadiusKm,
        dayOk: driver.availability[dayKeys[day]],
        timeOk: timeStr >= driver.availability.from && timeStr <= driver.availability.to,
        capacityOk: (req.horseCount || 1) <= driver.vehicle.capacity,
        alreadyOffered: offeredIds.has(req.id),
      };
    }).filter((x) => x.inRadius && x.dayOk && x.timeOk && x.capacityOk && !x.alreadyOffered);
  },

  /* ==== ANGEBOTE ==== */
  async createOffer({ requestId, driverId }) {
    const driver = await this.getDriver(driverId);
    const reason = this.driverBlockReason(driver);
    if (reason) throw new Error(reason);
    const req = await this.getRequest(requestId);
    if (!req) throw new Error('Anfrage nicht gefunden');
    const price = Math.round((driver.basePrice + req.routeKm * driver.pricePerKm) * 100) / 100;
    const row = {
      request_id: requestId, driver_id: driverId, price,
      price_per_km: driver.pricePerKm, base_price: driver.basePrice, route_km: req.routeKm,
      status: 'pending', cancel_window_ms: 600000,
    };
    const { data, error } = await sb.from('offers').insert(row).select().single();
    if (error) {
      if (error.code === '23505') throw new Error('Du hast auf diese Anfrage bereits ein Angebot abgegeben.');
      throw new Error(error.message);
    }
    return rowToOffer(data);
  },

  async listOffersForRequest(requestId) {
    const { data, error } = await sb.from('offers').select('*').eq('request_id', requestId).order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    const offers = data.map(rowToOffer);
    // Fahrer-Objekt anhängen (wie im Prototyp erwartet)
    for (const o of offers) o.driver = await this.getDriver(o.driverId);
    return offers;
  },
  async listOffersForDriver(driverId) {
    const { data, error } = await sb.from('offers').select('*').eq('driver_id', driverId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    const offers = data.map(rowToOffer);
    for (const o of offers) o.request = await this.getRequest(o.requestId);
    return offers;
  },

  async acceptOffer(offerId) {
    const { data: offerRow, error: e1 } = await sb.from('offers').select('*').eq('id', offerId).single();
    if (e1) throw new Error(e1.message);
    const offer = rowToOffer(offerRow);
    // angenommenes Angebot markieren
    const { error: e2 } = await sb.from('offers').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', offerId);
    if (e2) throw new Error(e2.message);
    // Mitbewerber zurückstellen (on_hold)
    await sb.from('offers').update({ status: 'on_hold' })
      .eq('request_id', offer.requestId).neq('id', offerId).eq('status', 'pending');
    // Anfrage auf assigned
    await sb.from('requests').update({ status: 'assigned', accepted_offer_id: offerId }).eq('id', offer.requestId);
    return { offer };
  },
  async rejectOffer(offerId) {
    const { error } = await sb.from('offers').update({ status: 'rejected' }).eq('id', offerId);
    if (error) throw new Error(error.message);
  },

  cancelInfo(offer) {
    if (!offer.acceptedAt) return { open: false, remainingMs: 0 };
    const remainingMs = Math.max(0, offer.cancelWindowMs - (Date.now() - offer.acceptedAt));
    return { open: remainingMs > 0, remainingMs };
  },
  async cancelTrip(offerId, by) {
    const { data: offerRow, error } = await sb.from('offers').select('*').eq('id', offerId).single();
    if (error) throw new Error(error.message);
    const offer = rowToOffer(offerRow);
    if (offer.status !== 'accepted') throw new Error('Keine aktive Fahrt');
    if (!this.cancelInfo(offer).open) throw new Error('Stornofenster abgelaufen — bitte die andere Seite telefonisch kontaktieren.');
    await sb.from('offers').update({ status: 'rejected', cancelled_by: by, cancelled_at: new Date().toISOString() }).eq('id', offerId);
    await sb.from('requests').update({ status: 'open', accepted_offer_id: null }).eq('id', offer.requestId);
    // zurückgestellte Angebote reaktivieren
    await sb.from('offers').update({ status: 'pending' }).eq('request_id', offer.requestId).eq('status', 'on_hold');
  },

  async confirmCompletion(offerId, by) {
    const { data: offerRow, error } = await sb.from('offers').select('*').eq('id', offerId).single();
    if (error) throw new Error(error.message);
    const offer = rowToOffer(offerRow);
    if (offer.status !== 'accepted') throw new Error('Keine aktive Fahrt');
    if (this.cancelInfo(offer).open) throw new Error('Abschluss erst nach Ablauf des Stornofensters möglich.');
    // zurückgestellte Mitbewerber endgültig ablehnen
    await sb.from('offers').update({ status: 'rejected' }).eq('request_id', offer.requestId).eq('status', 'on_hold');
    const patch = {};
    if (by === 'rider') patch.rider_completed = true;
    if (by === 'driver') patch.driver_completed = true;
    const bothDone = (by === 'rider' ? true : offer.riderCompleted) && (by === 'driver' ? true : offer.driverCompleted);
    if (bothDone) patch.completed_at = new Date().toISOString();
    await sb.from('offers').update(patch).eq('id', offerId);
    if (bothDone) await sb.from('requests').update({ status: 'done' }).eq('id', offer.requestId);
  },

  async rateTrip(offerId, by, stars, comment) {
    const { data: offerRow, error } = await sb.from('offers').select('*').eq('id', offerId).single();
    if (error) throw new Error(error.message);
    const offer = rowToOffer(offerRow);
    if (!offer.completedAt) throw new Error('Bewertung erst nach Abschluss möglich');
    const s = Math.max(1, Math.min(5, stars));
    if (by === 'rider') {
      if (offer.ratingByRider) throw new Error('Bereits bewertet');
      await sb.from('offers').update({ rating_by_rider_stars: s, rating_by_rider_comment: comment || '', rating_by_rider_at: new Date().toISOString() }).eq('id', offerId);
      await this._recalcRating(offer.driverId, 'driver', s);
    } else {
      if (offer.ratingByDriver) throw new Error('Bereits bewertet');
      await sb.from('offers').update({ rating_by_driver_stars: s, rating_by_driver_comment: comment || '', rating_by_driver_at: new Date().toISOString() }).eq('id', offerId);
      const req = await this.getRequest(offer.requestId);
      if (req) await this._recalcRating(req.riderId, 'rider', s);
    }
  },
  async _recalcRating(profileId, role, newStars) {
    const { data: p } = await sb.from('profiles').select('*').eq('id', profileId).single();
    if (!p) return;
    const rCol = role === 'driver' ? 'driver_rating' : 'rider_rating';
    const tCol = role === 'driver' ? 'driver_trips' : 'rider_trips';
    const prevRating = Number(p[rCol]) || 0;
    const prevTrips = p[tCol] || 0;
    const newTrips = prevTrips + 1;
    const newRating = Math.round(((prevRating * prevTrips + newStars) / newTrips) * 10) / 10;
    await sb.from('profiles').update({ [rCol]: newRating, [tCol]: newTrips }).eq('id', profileId);
  },

  async listRatingsForDriver(driverId) {
    const { data, error } = await sb.from('offers').select('*').eq('driver_id', driverId).not('rating_by_rider_stars', 'is', null);
    if (error) throw new Error(error.message);
    const out = [];
    for (const o of data) {
      const req = await this.getRequest(o.request_id);
      const rider = req ? await this.getRider(req.riderId) : null;
      out.push({ stars: o.rating_by_rider_stars, comment: o.rating_by_rider_comment || '', at: new Date(o.rating_by_rider_at).getTime(), from: rider ? rider.name : 'Reiter' });
    }
    return out.sort((a, b) => b.at - a.at);
  },
  async listRatingsForRider(riderId) {
    const { data, error } = await sb.from('offers').select('*').not('rating_by_driver_stars', 'is', null);
    if (error) throw new Error(error.message);
    const out = [];
    for (const o of data) {
      const req = await this.getRequest(o.request_id);
      if (!req || req.riderId !== riderId) continue;
      const driver = await this.getDriver(o.driver_id);
      out.push({ stars: o.rating_by_driver_stars, comment: o.rating_by_driver_comment || '', at: new Date(o.rating_by_driver_at).getTime(), from: driver ? driver.name : 'Fahrer' });
    }
    return out.sort((a, b) => b.at - a.at);
  },

  /* ==== DOKUMENTE (Storage) ==== */
  async uploadDocument(driverId, kind, file) {
    // file ist ein echtes File-Objekt aus dem <input type=file>
    const ext = file.name.split('.').pop();
    const path = `${driverId}/${kind}_${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from('documents').upload(path, file, { upsert: true });
    if (upErr) throw new Error('Upload fehlgeschlagen: ' + upErr.message);
    const col = kind === 'license'
      ? { doc_license_path: path, doc_license_name: file.name }
      : { doc_permit_path: path, doc_permit_name: file.name };
    const { error } = await sb.from('profiles').update(col).eq('id', driverId);
    if (error) throw new Error(error.message);
    return { fileName: file.name, path };
  },
  /** Zeitlich begrenzten (signierten) Link zum Ansehen eines Dokuments. */
  async getDocumentUrl(path) {
    const { data, error } = await sb.storage.from('documents').createSignedUrl(path, 300); // 5 Min gültig
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },

  /* ==== SELBSTBESTÄTIGUNG ==== */
  async saveSelfDeclaration(id) {
    const { error } = await sb.from('profiles').update({ self_declaration_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(error.message);
  },

  /* ==== MELDUNGEN ==== */
  async createReport({ reportedId, category, message }) {
    const u = await this.currentUser();
    if (!u) throw new Error('Nicht angemeldet');
    const { error } = await sb.from('reports').insert({
      reporter_id: u.id, reported_id: reportedId,
      category: category || null, message,
    });
    if (error) throw new Error(error.message);
  },

  /* ==== ADMIN ==== */
  async amIAdmin() {
    const p = await this.getMyProfile();
    return !!(p && p.is_admin);
  },
  async listReports() {
    // Nur Admins bekommen dank RLS Daten zurueck.
    const { data, error } = await sb.from('reports').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    // Anzahl Meldungen je gemeldetem Nutzer vorberechnen
    const countByReported = {};
    for (const r of data) countByReported[r.reported_id] = (countByReported[r.reported_id] || 0) + 1;
    const out = [];
    for (const r of data) {
      const reported = await this.getDriver(r.reported_id);
      out.push({
        id: r.id, ticketNo: r.ticket_no || null,
        category: r.category, message: r.message, status: r.status || 'open',
        at: new Date(r.created_at).getTime(),
        reportedId: r.reported_id,
        reportedName: reported ? reported.name : '—',
        reportedStatus: reported ? {
          blocked: reported.isBlocked,
          blockedUntil: reported.blockedUntil,
          offersDisabled: reported.offersDisabled,
          warnings: reported.warnings,
        } : null,
        // Melder wird anonymisiert dargestellt (Datensparsamkeit)
        reporterRef: 'Nutzer #' + String(r.reporter_id).slice(0, 6),
        priorReports: countByReported[r.reported_id] || 1,
      });
    }
    return out;
  },
  async setReportStatus(reportId, status) {
    const { error } = await sb.from('reports').update({ status }).eq('id', reportId);
    if (error) throw new Error(error.message);
  },
  // Admin-Maßnahmen gegen einen Nutzer
  async warnUser(userId) {
    const { data: p } = await sb.from('profiles').select('warnings').eq('id', userId).maybeSingle();
    const next = ((p && p.warnings) || 0) + 1;
    const { error } = await sb.from('profiles').update({ warnings: next }).eq('id', userId);
    if (error) throw new Error(error.message);
    return next;
  },
  async setUserBlocked(userId, blocked) {
    // dauerhafte Sperre (hebt temporaere Sperre mit auf)
    const { error } = await sb.from('profiles').update({ is_blocked: blocked, blocked_until: null }).eq('id', userId);
    if (error) throw new Error(error.message);
  },
  async setUserBlockedUntil(userId, until) {
    // voruebergehende Sperre bis Datum (ISO-String) oder null zum Aufheben
    const { error } = await sb.from('profiles').update({ blocked_until: until }).eq('id', userId);
    if (error) throw new Error(error.message);
  },
  async setOffersDisabled(userId, disabled) {
    const { error } = await sb.from('profiles').update({ offers_disabled: disabled }).eq('id', userId);
    if (error) throw new Error(error.message);
  },
};

/* Fehlermeldungen von Supabase-Auth ins Deutsche übersetzen */
function _authMsg(msg) {
  if (/already registered/i.test(msg)) return 'Diese E-Mail ist bereits registriert.';
  if (/Invalid login/i.test(msg)) return 'E-Mail oder Passwort ist falsch.';
  if (/Password should be at least/i.test(msg)) return 'Das Passwort muss mindestens 6 Zeichen haben.';
  if (/Email not confirmed/i.test(msg)) return 'Bitte bestätige zuerst deine E-Mail-Adresse (Link in deinem Postfach).';
  return msg;
}

window.API = API;
window.supabaseClient = sb;

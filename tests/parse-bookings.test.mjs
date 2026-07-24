import { test } from "node:test";
import assert from "node:assert/strict";

// Copie pure di parseAmountValue e mapRowToBooking da google-apps-script/Code.gs.
// Se cambi la logica in Code.gs aggiorna anche queste (Apps Script non e' importabile).
function parseAmountValue(raw) {
  const cleaned = String(raw == null ? "" : raw).replace(/[^0-9.,]/g, "");
  if (!cleaned) return 0;
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  let normalized;
  if (lastDot >= 0 && lastComma >= 0) {
    normalized = lastComma > lastDot
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const decimals = cleaned.length - lastComma - 1;
    normalized = decimals === 2 ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
  } else {
    normalized = cleaned.replace(/\./g, "");
  }
  const value = parseFloat(normalized);
  return isNaN(value) ? 0 : value;
}

function mapRowToBooking(row) {
  const orderId = String(row[2] == null ? "" : row[2]).trim();
  if (!/^TIR-ORD-[A-F0-9]{12}$/.test(orderId)) return null;
  const amount = String(row[9] == null ? "" : row[9]).trim();
  const cell = (i) => String(row[i] == null ? "" : row[i]).trim();
  return {
    createdAt: cell(0),
    updatedAt: cell(27),
    orderId,
    registrationId: cell(1),
    registrationStatus: cell(3),
    paymentStatus: cell(4),
    paymentMethod: cell(5),
    planId: cell(6),
    planName: cell(7),
    amount,
    amountValue: parseAmountValue(amount),
    currency: cell(10) || "EUR",
    firstName: cell(13),
    lastName: cell(14),
    email: cell(15),
    phone: cell(16),
    referral: cell(17),
    companyName: cell(19),
    reference: cell(25),
    ticketUrl: cell(26),
  };
}

// Copia pura di parseBookingEmail da Code.gs (parsing notifiche interne Gmail).
function parseBookingEmail(subject, body, createdAtIso) {
  var normalizedSubject = String(subject == null ? "" : subject).trim();
  var normalizedBody = String(body == null ? "" : body);
  var upperSubject = normalizedSubject.toUpperCase();
  var lowerSubject = normalizedSubject.toLowerCase();
  if (
    upperSubject.indexOf("[TIRANA][LEAD]") !== -1 ||
    lowerSubject.indexOf("tirana offline mode |") === 0
  ) {
    return null;
  }
  var field = function (label) {
    var escapedLabel = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var match = normalizedBody.match(new RegExp("^" + escapedLabel + ":\\s*(.+)$", "im"));
    return match ? String(match[1] || "").trim() : "";
  };
  var bodyOrderMatch = normalizedBody.match(/TIR-ORD-[A-F0-9]{12}/);
  var subjectOrderMatch = normalizedSubject.match(/TIR-ORD-[A-F0-9]{12}/);
  var orderId = bodyOrderMatch ? bodyOrderMatch[0] : subjectOrderMatch ? subjectOrderMatch[0] : "";
  var paymentMethod = "";
  var paymentStatus = "DA VERIFICARE";
  if (upperSubject.indexOf("STRIPE") !== -1) {
    paymentMethod = "STRIPE";
    paymentStatus = "PAGATO";
  } else if (upperSubject.indexOf("FREE PASS") !== -1) {
    paymentMethod = "GRATUITO";
    paymentStatus = "PAGAMENTO NON RICHIESTO";
  } else if (upperSubject.indexOf("BONIFICO") !== -1) {
    paymentMethod = "BONIFICO";
    paymentStatus = "IN ATTESA DI ACCREDITO";
  }
  var amountRaw = field("Importo finale") || field("Importo");
  var fullName = field("Nome");
  var firstSpace = fullName.indexOf(" ");
  var firstName = firstSpace === -1 ? fullName : fullName.slice(0, firstSpace);
  var lastName = firstSpace === -1 ? "" : fullName.slice(firstSpace + 1).trim();
  var email = field("Email").toLowerCase();
  var booking = {
    createdAt: createdAtIso,
    updatedAt: "",
    orderId,
    registrationId: field("Registrazione"),
    registrationStatus: field("Stato"),
    paymentStatus: orderId ? paymentStatus : "DA VERIFICARE",
    paymentMethod,
    planId: "",
    planName: field("Piano"),
    amount: amountRaw,
    amountValue: parseAmountValue(amountRaw),
    currency: "EUR",
    firstName,
    lastName,
    email,
    phone: field("Telefono"),
    referral: field("Referral"),
    companyName: field("Ragione sociale"),
    reference: field("Causale"),
    ticketUrl: field("Ticket URL"),
    source: "email",
  };
  if (!orderId) booking._emailKey = "email-" + createdAtIso + "-" + (email || normalizedSubject);
  return booking;
}

// Copia pura di mergeSheetOverEmail da Code.gs (il foglio vince sui non vuoti).
function mergeSheetOverEmail(emailBooking, sheetBooking) {
  const merged = {};
  Object.keys(emailBooking || {}).forEach((key) => { merged[key] = emailBooking[key]; });
  Object.keys(sheetBooking || {}).forEach((key) => {
    const value = sheetBooking[key];
    let hasValue = value !== "" && value != null;
    if (key === "amountValue" && !sheetBooking.amount) hasValue = false;
    if (hasValue) merged[key] = value;
  });
  return merged;
}

// Riga 28 colonne, stesso ordine di recordToRow in Code.gs.
function row(overrides) {
  const base = new Array(28).fill("");
  return Object.assign(base, overrides);
}

const bonifico = row({
  0: "2026-07-20T10:00:00.000Z",
  1: "TIR-REG-0123456789AB",
  2: "TIR-ORD-ABCDEF012345",
  3: "BIGLIETTO REGISTRATO",
  4: "IN ATTESA DI ACCREDITO",
  5: "BONIFICO",
  6: "workshop-builder",
  7: "Workshop + Builder Pass",
  9: "€ 2.500,00",
  10: "EUR",
  13: "Mario",
  14: "Rossi",
  15: "mario@example.com",
  16: "+39 333 1112223",
  25: "TIRANA OFFLINE TIR-ORD-ABCDEF012345",
  27: "2026-07-20T10:00:00.000Z",
});

const stripe = row({
  0: "2026-07-21T09:30:00.000Z",
  1: "TIR-REG-1111222233AB",
  2: "TIR-ORD-111122223333",
  3: "BIGLIETTO CONFERMATO",
  4: "PAGATO",
  5: "STRIPE",
  7: "Workshop Pass",
  9: "€ 89",
  10: "EUR",
  13: "Luisa",
  14: "Bianchi",
  15: "luisa@example.com",
  27: "2026-07-21T09:30:00.000Z",
});

const free = row({
  0: "2026-07-22T08:00:00.000Z",
  2: "TIR-ORD-AAAA1111BBBB",
  3: "BIGLIETTO CONFERMATO",
  4: "PAGAMENTO NON RICHIESTO",
  5: "GRATUITO",
  7: "Free Pass",
  9: "GRATUITO",
  13: "Anna",
  14: "Verdi",
  15: "anna@example.com",
});

const lead = row({
  0: "2026-07-19T08:00:00.000Z",
  1: "TIR-REG-9999888877AB",
  2: "",
  3: "FORM COMPILATO",
  13: "Lead",
  15: "lead@example.com",
});

test("mapRowToBooking scarta i lead senza ticketId", () => {
  assert.equal(mapRowToBooking(lead), null);
});

test("bonifico: campi e importo con decimali it-IT", () => {
  const b = mapRowToBooking(bonifico);
  assert.equal(b.orderId, "TIR-ORD-ABCDEF012345");
  assert.equal(b.paymentStatus, "IN ATTESA DI ACCREDITO");
  assert.equal(b.paymentMethod, "BONIFICO");
  assert.equal(b.amountValue, 2500);
  assert.equal(b.currency, "EUR");
  assert.equal(b.firstName, "Mario");
  assert.equal(b.email, "mario@example.com");
});

test("stripe: importo intero senza decimali", () => {
  const b = mapRowToBooking(stripe);
  assert.equal(b.paymentStatus, "PAGATO");
  assert.equal(b.paymentMethod, "STRIPE");
  assert.equal(b.amountValue, 89);
});

test("free: importo non numerico -> 0", () => {
  const b = mapRowToBooking(free);
  assert.equal(b.paymentStatus, "PAGAMENTO NON RICHIESTO");
  assert.equal(b.paymentMethod, "GRATUITO");
  assert.equal(b.amountValue, 0);
});

test("parseAmountValue casi limite", () => {
  assert.equal(parseAmountValue("€ 1.234,56"), 1234.56);
  assert.equal(parseAmountValue("€ 2.500"), 2500);
  assert.equal(parseAmountValue("89,00"), 89);
  assert.equal(parseAmountValue(""), 0);
  assert.equal(parseAmountValue("GRATUITO"), 0);
});

// --- Parsing email interne Gmail (fixture reali dai template in api/) ---
const emailBonifico = {
  subject: "[TIRANA][BONIFICO] TIR-ORD-ABCDEF012345 · Workshop + Builder Pass",
  body: [
    "Nuovo biglietto tramite bonifico.",
    "",
    "Record: TIR-ORD-ABCDEF012345",
    "Stato: IN ATTESA DI ACCREDITO",
    "Registrazione: TIR-REG-0123456789AB",
    "Piano: Workshop + Builder Pass",
    "Importo: € 2.500",
    "Causale: TIRANA OFFLINE TIR-ORD-ABCDEF012345",
    "Nome: Mario Rossi",
    "Email: Mario@Example.com",
    "Telefono: +39 333 1112223",
    "Referral: Instagram",
  ].join("\n"),
};

const emailStripe = {
  subject: "[TIRANA][STRIPE][PAGATO] TIR-ORD-111122223333 · Workshop Pass",
  body: [
    "Nuovo pagamento Stripe confermato.",
    "",
    "Record: TIR-ORD-111122223333",
    "Sessione Stripe: cs_test_123",
    "Piano: Workshop Pass",
    "Importo: € 89",
    "Coupon: Nessuno",
    "Nome: Luisa Bianchi",
    "Email: luisa@example.com",
    "Telefono: +39 340 0001112",
    "Ragione sociale: Acme SRL",
  ].join("\n"),
};

test("email bonifico: parsing campi + stato + importo", () => {
  const b = parseBookingEmail(emailBonifico.subject, emailBonifico.body, "2026-07-20T10:00:00.000Z");
  assert.equal(b.orderId, "TIR-ORD-ABCDEF012345");
  assert.equal(b.paymentMethod, "BONIFICO");
  assert.equal(b.paymentStatus, "IN ATTESA DI ACCREDITO");
  assert.equal(b.amountValue, 2500);
  assert.equal(b.firstName, "Mario");
  assert.equal(b.lastName, "Rossi");
  assert.equal(b.email, "mario@example.com");
  assert.equal(b.reference, "TIRANA OFFLINE TIR-ORD-ABCDEF012345");
  assert.equal(b.source, "email");
});

test("email stripe: metodo/stato confermato + ragione sociale", () => {
  const b = parseBookingEmail(emailStripe.subject, emailStripe.body, "2026-07-21T09:30:00.000Z");
  assert.equal(b.orderId, "TIR-ORD-111122223333");
  assert.equal(b.paymentMethod, "STRIPE");
  assert.equal(b.paymentStatus, "PAGATO");
  assert.equal(b.amountValue, 89);
  assert.equal(b.companyName, "Acme SRL");
});

test("email lead e email cliente: escluse", () => {
  assert.equal(parseBookingEmail("[TIRANA][LEAD] TIR-REG-0123456789AB · Tizio", "Nome: Tizio", "2026-07-19T08:00:00.000Z"), null);
  assert.equal(parseBookingEmail("Tirana Offline Mode | Il tuo biglietto è registrato", "Ciao", "2026-07-19T08:00:00.000Z"), null);
});

test("email senza orderId: inclusa come DA VERIFICARE con _emailKey", () => {
  const b = parseBookingEmail("[TIRANA][BONIFICO] biglietto", "Nome: Anonimo\nEmail: x@y.it", "2026-07-18T08:00:00.000Z");
  assert.equal(b.orderId, "");
  assert.equal(b.paymentStatus, "DA VERIFICARE");
  assert.ok(b._emailKey && b._emailKey.startsWith("email-"));
});

test("merge foglio su email: paymentStatus del foglio vince", () => {
  const email = parseBookingEmail(emailBonifico.subject, emailBonifico.body, "2026-07-20T10:00:00.000Z");
  const sheet = mapRowToBooking(bonifico); // stessa fixture foglio, ma con paymentStatus PAGATO simulato sotto
  sheet.paymentStatus = "PAGATO";
  const merged = mergeSheetOverEmail(email, sheet);
  assert.equal(merged.paymentStatus, "PAGATO");
  assert.equal(merged.source, "email"); // campo solo-email preservato
});

test("merge: amountValue del foglio ignorato se amount foglio vuoto", () => {
  const email = parseBookingEmail(emailStripe.subject, emailStripe.body, "2026-07-21T09:30:00.000Z");
  const sheet = { orderId: email.orderId, amount: "", amountValue: 0, paymentStatus: "PAGATO" };
  const merged = mergeSheetOverEmail(email, sheet);
  assert.equal(merged.amountValue, 89); // valore email mantenuto
  assert.equal(merged.paymentStatus, "PAGATO");
});

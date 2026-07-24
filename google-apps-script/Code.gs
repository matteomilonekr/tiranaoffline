const SPREADSHEET_ID = "1NS959SkVwmUZ_1iF-b75d8SybHjfA6bHjv5y5R9fb0M";
const DATA_SHEET_NAME = "Iscritti";
const CONFIG_SHEET_NAME = "_Config";
const HEADER_COUNT = 28;

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeText(value) {
  const normalized = String(value == null ? "" : value)
    .normalize("NFKC")
    .trim()
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 500);
  return /^[=+\-@]/.test(normalized) ? "'" + normalized : normalized;
}

function getWebhookSecret(spreadsheet) {
  const configSheet = spreadsheet.getSheetByName(CONFIG_SHEET_NAME);
  if (!configSheet) throw new Error("Configurazione mancante.");
  return String(configSheet.getRange("B1").getDisplayValue() || "").trim();
}

function recordToRow(data) {
  return [
    data.createdAt,
    data.registrationId,
    data.ticketId,
    data.registrationStatus,
    data.paymentStatus,
    data.paymentMethod,
    data.planId,
    data.planName,
    data.pricingStage,
    data.amount,
    data.currency,
    data.participantCount,
    data.builderSlots,
    data.firstName,
    data.lastName,
    data.email,
    data.phone,
    data.referral,
    data.source,
    data.companyName,
    data.taxId,
    data.address,
    data.city,
    data.countryCode,
    data.postalCode,
    data.reference,
    data.ticketUrl,
    data.updatedAt,
  ].map(safeText);
}

function findRecordRow(sheet, ticketId, registrationId, email) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const records = sheet.getRange(2, 2, lastRow - 1, 15).getDisplayValues();

  if (ticketId) {
    for (let index = 0; index < records.length; index += 1) {
      if (String(records[index][1] || "").trim() === ticketId) return index + 2;
    }
  }
  if (registrationId) {
    for (let index = 0; index < records.length; index += 1) {
      if (String(records[index][0] || "").trim() === registrationId) return index + 2;
    }
  }
  if (email) {
    for (let index = 0; index < records.length; index += 1) {
      const rowTicketId = String(records[index][1] || "").trim();
      const rowEmail = String(records[index][14] || "").trim().toLowerCase();
      if (!rowTicketId && rowEmail === email) return index + 2;
    }
  }
  return 0;
}

function doPost(event) {
  try {
    const body = JSON.parse(event && event.postData ? event.postData.contents : "{}");
    const data = body && body.data && typeof body.data === "object" ? body.data : {};
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const expectedSecret = getWebhookSecret(spreadsheet);

    if (!expectedSecret || String(body.secret || "") !== expectedSecret) {
      return jsonResponse({ ok: false, error: "UNAUTHORIZED" });
    }

    if (body.action === "bookings") {
      return jsonResponse(listBookings(spreadsheet));
    }

    if (
      body.schemaVersion !== 1 ||
      (body.event !== "lead_registered" && body.event !== "ticket_registered")
    ) {
      return jsonResponse({ ok: false, error: "INVALID_EVENT" });
    }

    const registrationId = safeText(data.registrationId);
    const ticketId = safeText(data.ticketId);
    const email = safeText(data.email).toLowerCase();
    const ticketRequired = body.event === "ticket_registered";
    if (
      !/^TIR-REG-[A-F0-9]{12}$/.test(registrationId) ||
      (ticketRequired && !/^TIR-ORD-[A-F0-9]{12}$/.test(ticketId)) ||
      (!ticketRequired && ticketId) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return jsonResponse({ ok: false, error: "INVALID_RECORD" });
    }

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      return jsonResponse({ ok: false, error: "LOCK_TIMEOUT" });
    }

    try {
      const sheet = spreadsheet.getSheetByName(DATA_SHEET_NAME);
      if (!sheet) throw new Error("Foglio dati mancante.");
      const existingRow = findRecordRow(sheet, ticketId, registrationId, email);
      const rowNumber = existingRow || sheet.getLastRow() + 1;
      const incoming = recordToRow(data);
      const current = existingRow
        ? sheet.getRange(existingRow, 1, 1, HEADER_COUNT).getDisplayValues()[0]
        : new Array(HEADER_COUNT).fill("");
      const merged = incoming.map(function (value, index) {
        if (index === 0 && current[index]) return current[index];
        return value || current[index] || "";
      });

      const target = sheet.getRange(rowNumber, 1, 1, HEADER_COUNT);
      target.setNumberFormat("@");
      target.setValues([merged]);

      return jsonResponse({
        ok: true,
        result: existingRow ? "updated" : "appended",
        registrationId: registrationId,
        ticketId: ticketId,
        row: rowNumber,
      });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error("[tirana-sheets]", error);
    return jsonResponse({ ok: false, error: "INTERNAL_ERROR" });
  }
}

// Estrae una prenotazione dal testo di una notifica interna ricevuta via email.
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
  var orderId = bodyOrderMatch
    ? bodyOrderMatch[0]
    : subjectOrderMatch
      ? subjectOrderMatch[0]
      : "";
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
    orderId: orderId,
    registrationId: field("Registrazione"),
    registrationStatus: field("Stato"),
    paymentStatus: orderId ? paymentStatus : "DA VERIFICARE",
    paymentMethod: paymentMethod,
    planId: "",
    planName: field("Piano"),
    amount: amountRaw,
    amountValue: parseAmountValue(amountRaw),
    currency: "EUR",
    firstName: firstName,
    lastName: lastName,
    email: email,
    phone: field("Telefono"),
    referral: field("Referral"),
    companyName: field("Ragione sociale"),
    reference: field("Causale"),
    ticketUrl: field("Ticket URL"),
    source: "email",
  };

  if (!orderId) {
    booking._emailKey = "email-" + createdAtIso + "-" + (email || normalizedSubject);
  }
  return booking;
}

// Legge le notifiche interne da Gmail. In caso di errore lascia disponibile
// il livello dati del foglio Iscritti.
function getGmailBookings() {
  try {
    var query = 'subject:TIRANA (subject:BONIFICO OR subject:STRIPE OR subject:"FREE PASS") newer_than:1y';
    var threads = GmailApp.search(query, 0, 300);
    var bookings = [];
    for (var threadIndex = 0; threadIndex < threads.length; threadIndex += 1) {
      var messages = threads[threadIndex].getMessages();
      for (var messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
        var message = messages[messageIndex];
        var booking = parseBookingEmail(
          message.getSubject(),
          message.getPlainBody(),
          message.getDate().toISOString()
        );
        if (booking) bookings.push(booking);
      }
    }
    return bookings;
  } catch (error) {
    console.error("[tirana-bookings] Impossibile leggere le prenotazioni da Gmail.", error);
    return [];
  }
}

// Legge le righe del foglio Iscritti e scarta i lead senza biglietto.
function getSheetBookings(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(DATA_SHEET_NAME);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var rows = sheet.getRange(2, 1, lastRow - 1, HEADER_COUNT).getDisplayValues();
  var bookings = [];
  for (var index = 0; index < rows.length; index += 1) {
    var booking = mapRowToBooking(rows[index]);
    if (booking) bookings.push(booking);
  }
  return bookings;
}

// Crea un nuovo oggetto in cui i valori non vuoti del foglio hanno precedenza.
function mergeSheetOverEmail(emailBooking, sheetBooking) {
  var merged = {};
  Object.keys(emailBooking || {}).forEach(function (key) {
    merged[key] = emailBooking[key];
  });
  Object.keys(sheetBooking || {}).forEach(function (key) {
    var value = sheetBooking[key];
    var hasValue = value !== "" && value != null;
    if (key === "amountValue" && !sheetBooking.amount) hasValue = false;
    if (hasValue) merged[key] = value;
  });
  return merged;
}

// Unisce Gmail come base con il foglio Iscritti come livello prioritario.
function listBookings(spreadsheet) {
  var byOrder = {};
  var gmailBookings = getGmailBookings();
  for (var gmailIndex = 0; gmailIndex < gmailBookings.length; gmailIndex += 1) {
    var emailBooking = gmailBookings[gmailIndex];
    var key = emailBooking.orderId || emailBooking._emailKey;
    if (!byOrder[key] || emailBooking.createdAt > byOrder[key].createdAt) {
      byOrder[key] = emailBooking;
    }
  }

  var sheetBookings = getSheetBookings(spreadsheet);
  for (var sheetIndex = 0; sheetIndex < sheetBookings.length; sheetIndex += 1) {
    var sheetBooking = sheetBookings[sheetIndex];
    if (byOrder[sheetBooking.orderId]) {
      byOrder[sheetBooking.orderId] = mergeSheetOverEmail(
        byOrder[sheetBooking.orderId],
        sheetBooking
      );
    } else {
      byOrder[sheetBooking.orderId] = sheetBooking;
    }
  }

  var bookings = Object.keys(byOrder).map(function (key) {
    return byOrder[key];
  });
  bookings.sort(function (a, b) {
    if (a.createdAt < b.createdAt) return 1;
    if (a.createdAt > b.createdAt) return -1;
    return 0;
  });
  return { ok: true, result: "bookings", bookings: bookings };
}

// Mappa pura riga (28 colonne, stesso ordine di recordToRow) -> booking.
// Ritorna null se la riga non ha un ticketId TIR-ORD valido (lead/vuota).
function mapRowToBooking(row) {
  const orderId = String(row[2] == null ? "" : row[2]).trim();
  if (!/^TIR-ORD-[A-F0-9]{12}$/.test(orderId)) return null;
  const amount = String(row[9] == null ? "" : row[9]).trim();
  const cell = function (i) {
    return String(row[i] == null ? "" : row[i]).trim();
  };
  return {
    createdAt: cell(0),
    updatedAt: cell(27),
    orderId: orderId,
    registrationId: cell(1),
    registrationStatus: cell(3),
    paymentStatus: cell(4),
    paymentMethod: cell(5),
    planId: cell(6),
    planName: cell(7),
    amount: amount,
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

// Converte un importo formattato it-IT ("€ 2.500", "€ 2.500,00", "GRATUITO")
// in numero. L'ultimo separatore presente è quello dei decimali.
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

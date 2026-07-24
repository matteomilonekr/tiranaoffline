import {
  methodNotAllowed,
  readRegistrationSession,
  safeErrorResponse,
  sendJson,
} from "./_funnel.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    const session = readRegistrationSession(req);
    return sendJson(res, 200, { ok: true, authenticated: true, ...session });
  } catch (error) {
    return safeErrorResponse(
      res,
      error,
      "Non è stato possibile verificare la registrazione.",
    );
  }
}

import { ServerRelay } from "../serverRelay.js";

export const DEFAULT_SERVER_URL = "https://dev.securesocket.net:8443";
export const DEFAULT_SCRATCH_GAME_ID = "CrashMines";

let sessionId = null;
let sessionGameDetails = null;
let sessionGameUrl = null;
let sessionUserToken = null;
let lastBetResult = null;
let lastBetRoundId = null;
let lastBetBalance = null;
let lastBetRegisteredBets = [];

function normalizeGridCoordinate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.max(0, Math.floor(numeric));
}

function normalizeBaseUrl(url) {
  if (typeof url !== "string") {
    return DEFAULT_SERVER_URL;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return DEFAULT_SERVER_URL;
  }

  return trimmed.replace(/\/+$/, "");
}

function normalizeScratchGameId(id) {
  if (typeof id !== "string") {
    return DEFAULT_SCRATCH_GAME_ID;
  }

  const trimmed = id.trim();
  if (!trimmed) {
    return DEFAULT_SCRATCH_GAME_ID;
  }

  return trimmed;
}

export function getSessionId() {
  return sessionId;
}

export function getGameSessionDetails() {
  return sessionGameDetails;
}

export function getGameUrl() {
  return sessionGameUrl;
}

export function getUserToken() {
  return sessionUserToken;
}

export function getLastBetResult() {
  return lastBetResult;
}

export function getLastBetRoundId() {
  return lastBetRoundId;
}

export function getLastBetBalance() {
  return lastBetBalance;
}

export function getLastBetRegisteredBets() {
  return lastBetRegisteredBets;
}

function normalizeInteger(value, { min = 0, defaultValue = 0 } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return defaultValue;
  }
  return Math.max(min, Math.floor(numeric));
}


function isServerRelay(candidate) {
  return candidate instanceof ServerRelay;
}

export async function initializeSessionId({
  url = DEFAULT_SERVER_URL,
  relay,
} = {}) {
  const baseUrl = normalizeBaseUrl(url);
  const endpoint = `${baseUrl}/get_session_id`;

  const requestPayload = {
    method: "GET",
    url: endpoint,
  };

  if (isServerRelay(relay)) {
    relay.send("api:get_session_id:request", requestPayload);
  }

  let response;

  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
      },
    });
  } catch (networkError) {
    if (isServerRelay(relay)) {
      relay.deliver("api:get_session_id:response", {
        ok: false,
        error: networkError?.message ?? "Network error",
        request: requestPayload,
      });
    }
    throw networkError;
  }

  const rawBody = await response.text();
  let nextSessionId = rawBody;

  const responsePayload = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: rawBody,
    request: requestPayload,
  };

  try {
    const parsed = JSON.parse(rawBody);
    if (typeof parsed === "string") {
      nextSessionId = parsed;
    } else if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.sessionId === "string"
    ) {
      nextSessionId = parsed.sessionId;
    }
  } catch (error) {
    // Response is not JSON; treat raw body as the session id string.
  }

  if (typeof nextSessionId !== "string" || nextSessionId.length === 0) {
    if (isServerRelay(relay)) {
      relay.deliver("api:get_session_id:response", {
        ...responsePayload,
        ok: false,
        error: "Session id response did not include a session id value",
      });
    }
    throw new Error("Session id response did not include a session id value");
  }

  if (!response.ok) {
    if (isServerRelay(relay)) {
      relay.deliver("api:get_session_id:response", {
        ...responsePayload,
        ok: false,
        error: `Failed to initialize session id: ${response.status} ${response.statusText}`,
      });
    }
    throw new Error(
      `Failed to initialize session id: ${response.status} ${response.statusText}`
    );
  }

  sessionId = nextSessionId;

  if (isServerRelay(relay)) {
    relay.deliver("api:get_session_id:response", {
      ...responsePayload,
      ok: true,
      sessionId,
    });
  }

  return sessionId;
}

export async function initializeGameSession({
  url = DEFAULT_SERVER_URL,
  scratchGameId = DEFAULT_SCRATCH_GAME_ID,
  relay,
} = {}) {
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    const error = new Error(
      "Cannot join game session before the session id is initialized"
    );
    if (isServerRelay(relay)) {
      relay.deliver("api:join:response", {
        ok: false,
        error: error.message,
      });
    }
    throw error;
  }

  const baseUrl = normalizeBaseUrl(url);
  const gameId = normalizeScratchGameId(scratchGameId);
  const endpoint = `${baseUrl}/join/${encodeURIComponent(gameId)}/`;

  sessionGameDetails = null;
  sessionGameUrl = null;
  sessionUserToken = null;

  const requestPayload = {
    method: "GET",
    url: endpoint,
    gameId,
  };

  if (isServerRelay(relay)) {
    relay.send("api:join:request", requestPayload);
  }

  let response;

  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "X-CASINOTV-TOKEN": sessionId,
        "X-CASINOTV-PROTOCOL-VERSION": "1.1",
      },
    });
  } catch (networkError) {
    if (isServerRelay(relay)) {
      relay.deliver("api:join:response", {
        ok: false,
        error: networkError?.message ?? "Network error",
        request: requestPayload,
      });
    }
    throw networkError;
  }

  const rawBody = await response.text();
  let parsedBody = null;

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (error) {
      // Response body was not JSON; leave parsedBody as null.
    }
  }

  const responsePayload = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: parsedBody ?? rawBody,
    request: requestPayload,
  };

  if (!response.ok) {
    if (isServerRelay(relay)) {
      relay.deliver("api:join:response", {
        ...responsePayload,
        ok: false,
        error: `Failed to join game session: ${response.status} ${response.statusText}`,
      });
    }
    throw new Error(
      `Failed to join game session: ${response.status} ${response.statusText}`
    );
  }

  if (!parsedBody || typeof parsedBody !== "object") {
    if (isServerRelay(relay)) {
      relay.deliver("api:join:response", {
        ...responsePayload,
        ok: false,
        error: "Join game session response was not valid JSON",
      });
    }
    throw new Error("Join game session response was not valid JSON");
  }

  const isSuccess = Boolean(parsedBody?.IsSuccess);
  const responseData = parsedBody?.ResponseData ?? null;

  if (!isSuccess || !responseData) {
    if (isServerRelay(relay)) {
      relay.deliver("api:join:response", {
        ...responsePayload,
        ok: false,
        error: "Join game session response did not indicate success",
      });
    }
    throw new Error("Join game session response did not indicate success");
  }

  const gameData = responseData?.GameData ?? null;
  const userData = responseData?.UserData ?? null;
  const userDataList = responseData?.UserDataList ?? null;
  const gameIds = Array.isArray(responseData?.GameIds)
    ? [...responseData.GameIds]
    : [];

  sessionGameDetails = {
    isSuccess,
    gameIds,
    gameData,
    userData,
    userDataList,
    raw: parsedBody,
  };

  sessionGameUrl =
    typeof gameData?.gameUrl === "string" && gameData.gameUrl
      ? gameData.gameUrl
      : null;
  sessionUserToken =
    typeof gameData?.userToken === "string" && gameData.userToken
      ? gameData.userToken
      : null;

  if (isServerRelay(relay)) {
    relay.deliver("api:join:response", {
      ...responsePayload,
      ok: true,
      gameSession: sessionGameDetails,
      gameUrl: sessionGameUrl,
      userToken: sessionUserToken,
    });
  }

  return sessionGameDetails;
}

function normalizeBetAmount(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, numeric);
}

function formatBetAmountLiteral(amount) {
  const normalized = normalizeBetAmount(amount);
  const safeDecimals = 8;
  try {
    return normalized.toFixed(safeDecimals);
  } catch (error) {
    // Fall back to a stringified version if toFixed fails for any reason.
    const fallback = String(normalized);
    if (/e/i.test(fallback)) {
      // Ensure we always return a decimal literal, even if the fallback
      // contains an exponent, by defaulting to zero with the expected
      // precision.
      return Number.isFinite(normalized)
        ? normalized.toLocaleString("en-US", {
            useGrouping: false,
            minimumFractionDigits: safeDecimals,
            maximumFractionDigits: safeDecimals,
          })
        : "0.00000000";
    }
    return fallback;
  }
}

function serializeBetRequestBody({ type = "bet", amountLiteral, betInfo }) {
  const safeType = typeof type === "string" && type.length ? type : "bet";
  const literal =
    typeof amountLiteral === "string" && amountLiteral.length > 0
      ? amountLiteral
      : "0.00000000";
  const betInfoJson = JSON.stringify(betInfo ?? {});
  return `{"type":${JSON.stringify(safeType)},"amount":${literal},"betInfo":${betInfoJson}}`;
}

function normalizeBetRate(rate) {
  const numeric = Number(rate);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.max(1, Math.floor(numeric));
}

function cloneRegisteredBets(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((bet) => ({
    ...(bet ?? {}),
  }));
}

export async function submitBet({
  url = DEFAULT_SERVER_URL,
  gameId = DEFAULT_SCRATCH_GAME_ID,
  amount = 0,
  rate = 0,
  relay,
} = {}) {
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    const error = new Error(
      "Cannot submit bet before the session id is initialized"
    );
    if (isServerRelay(relay)) {
      relay.deliver("api:bet:response", {
        ok: false,
        error: error.message,
      });
    }
    throw error;
  }

  const baseUrl = normalizeBaseUrl(url);
  const normalizedGameId = normalizeScratchGameId(gameId);
  const endpoint = `${baseUrl}/post/${encodeURIComponent(
    normalizedGameId
  )}?betInfo`;

  lastBetResult = null;
  lastBetRoundId = null;
  lastBetBalance = null;
  lastBetRegisteredBets = [];

  const normalizedAmount = normalizeBetAmount(amount);
  const normalizedRate = normalizeBetRate(rate);
  const amountLiteral = formatBetAmountLiteral(normalizedAmount);

  const betInfo = {
    id: normalizedRate,
    title: {
      key: "straight",
      value: {},
    },
    type: "straight",
    items: [],
    rate: normalizedRate,
    state: "Active",
  };

  const requestBody = {
    type: "bet",
    amount: normalizedAmount,
    betInfo,
  };

  const serializedRequestBody = serializeBetRequestBody({
    type: requestBody.type,
    amountLiteral,
    betInfo,
  });

  const requestPayload = {
    method: "POST",
    url: endpoint,
    gameId: normalizedGameId,
    body: requestBody,
    bodyLiteral: serializedRequestBody,
  };

  if (isServerRelay(relay)) {
    relay.send("api:bet:request", requestPayload);
  }

  let response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "X-CASINOTV-TOKEN": sessionId,
        "X-CASINOTV-PROTOCOL-VERSION": "1.1",
      },
      body: serializedRequestBody,
    });
  } catch (networkError) {
    if (isServerRelay(relay)) {
      relay.deliver("api:bet:response", {
        ok: false,
        error: networkError?.message ?? "Network error",
        request: requestPayload,
      });
    }
    throw networkError;
  }

  const rawBody = await response.text();
  let parsedBody = null;

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (error) {
      // Response body was not JSON; leave parsedBody as null.
    }
  }

  const responsePayload = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: parsedBody ?? rawBody,
    request: requestPayload,
  };

  if (!response.ok) {
    if (isServerRelay(relay)) {
      relay.deliver("api:bet:response", {
        ...responsePayload,
        ok: false,
        error: `Failed to submit bet: ${response.status} ${response.statusText}`,
      });
    }
    throw new Error(
      `Failed to submit bet: ${response.status} ${response.statusText}`
    );
  }

  if (!parsedBody || typeof parsedBody !== "object") {
    if (isServerRelay(relay)) {
      relay.deliver("api:bet:response", {
        ...responsePayload,
        ok: false,
        error: "Bet response was not valid JSON",
      });
    }
    throw new Error("Bet response was not valid JSON");
  }

  const isSuccess = Boolean(parsedBody?.IsSuccess);
  const responseData = parsedBody?.ResponseData ?? null;

  if (!responseData) {
    if (isServerRelay(relay)) {
      relay.deliver("api:bet:response", {
        ...responsePayload,
        ok: false,
        error: "Bet response did not include response data",
      });
    }
    throw new Error("Bet response did not include response data");
  }

  const balanceValue = responseData?.balance;
  const roundIdValue = responseData?.roundId;
  const registeredBetsValue = responseData?.registeredBets;

  lastBetResult = {
    isSuccess,
    responseData,
    raw: parsedBody,
  };
  lastBetBalance =
    typeof balanceValue === "string"
      ? balanceValue
      : balanceValue != null
      ? String(balanceValue)
      : null;
  lastBetRoundId = Number.isFinite(roundIdValue)
    ? roundIdValue
    : Number.isFinite(Number(roundIdValue))
    ? Number(roundIdValue)
    : roundIdValue ?? null;
  lastBetRegisteredBets = cloneRegisteredBets(registeredBetsValue);

  const betSummary = {
    success: isSuccess,
    balance: lastBetBalance,
    roundId: lastBetRoundId,
    registeredBets: lastBetRegisteredBets,
  };

  const relayPayload = {
    ...responsePayload,
    ok: isSuccess,
    bet: betSummary,
  };

  if (!isSuccess) {
    relayPayload.error = "Bet response indicated failure";
  }

  if (isServerRelay(relay)) {
    relay.deliver("api:bet:response", relayPayload);
  }

  if (!isSuccess) {
    throw new Error("Bet response indicated failure");
  }

  return lastBetResult;
}

export async function submitStep({
  url = DEFAULT_SERVER_URL,
  gameId = DEFAULT_SCRATCH_GAME_ID,
  row,
  col,
  relay,
} = {}) {
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    const error = new Error(
      "Cannot submit step before the session id is initialized"
    );
    if (isServerRelay(relay)) {
      relay.deliver("api:step:response", {
        ok: false,
        error: error.message,
      });
    }
    throw error;
  }

  const normalizedRow = normalizeGridCoordinate(row);
  const normalizedCol = normalizeGridCoordinate(col);

  if (normalizedRow == null || normalizedCol == null) {
    const error = new Error("Row and column values are required for steps");
    if (isServerRelay(relay)) {
      relay.deliver("api:step:response", {
        ok: false,
        error: error.message,
      });
    }
    throw error;
  }

  const baseUrl = normalizeBaseUrl(url);
  const normalizedGameId = normalizeScratchGameId(gameId);
  const endpoint = `${baseUrl}/post/${encodeURIComponent(normalizedGameId)}`;

  const requestBody = {
    type: "step",
    row: normalizedRow,
    col: normalizedCol,
  };

  const requestPayload = {
    method: "POST",
    url: endpoint,
    gameId: normalizedGameId,
    body: requestBody,
  };

  if (isServerRelay(relay)) {
    relay.send("api:step:request", requestPayload);
  }

  let response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "X-CASINOTV-TOKEN": sessionId,
        "X-CASINOTV-PROTOCOL-VERSION": "1.1",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (networkError) {
    if (isServerRelay(relay)) {
      relay.deliver("api:step:response", {
        ok: false,
        error: networkError?.message ?? "Network error",
        request: requestPayload,
      });
    }
    throw networkError;
  }

  const rawBody = await response.text();
  let parsedBody = null;

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (error) {
      // Response body was not JSON; leave parsedBody as null.
    }
  }

  const responsePayload = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: parsedBody ?? rawBody,
    request: requestPayload,
  };

  if (!response.ok) {
    if (isServerRelay(relay)) {
      relay.deliver("api:step:response", {
        ...responsePayload,
        ok: false,
        error: `Failed to submit step: ${response.status} ${response.statusText}`,
      });
    }
    throw new Error(
      `Failed to submit step: ${response.status} ${response.statusText}`
    );
  }

  if (!parsedBody || typeof parsedBody !== "object") {
    if (isServerRelay(relay)) {
      relay.deliver("api:step:response", {
        ...responsePayload,
        ok: false,
        error: "Step response was not valid JSON",
      });
    }
    throw new Error("Step response was not valid JSON");
  }

  const isSuccess = Boolean(parsedBody?.IsSuccess);
  const responseData = parsedBody?.ResponseData ?? null;
  const state = responseData?.state ?? null;

  if (!responseData) {
    if (isServerRelay(relay)) {
      relay.deliver("api:step:response", {
        ...responsePayload,
        ok: false,
        error: "Step response did not include response data",
      });
    }
    throw new Error("Step response did not include response data");
  }

  if (isServerRelay(relay)) {
    relay.deliver("api:step:response", {
      ...responsePayload,
      ok: true,
      step: {
        success: isSuccess,
        state,
      },
    });
  }

  return {
    isSuccess,
    responseData,
    state,
    raw: parsedBody,
  };
}

export async function submitAutoplay({
  url = DEFAULT_SERVER_URL,
  gameId = DEFAULT_SCRATCH_GAME_ID,
  relay,
  amount = 0,
  steps = 0,
  difficulty = 1,
  count = 1,
} = {}) {
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    const error = new Error(
      "Cannot submit autoplay before the session id is initialized"
    );
    if (isServerRelay(relay)) {
      relay.deliver("api:autoplay:response", {
        ok: false,
        error: error.message,
      });
    }
    throw error;
  }

  const baseUrl = normalizeBaseUrl(url);
  const normalizedGameId = normalizeScratchGameId(gameId);
  const endpoint = `${baseUrl}/post/${encodeURIComponent(normalizedGameId)}`;

  const normalizedAmount = normalizeBetAmount(amount);
  const normalizedSteps = normalizeInteger(steps, { defaultValue: 0, min: 0 });
  const normalizedCount = normalizeInteger(count, { defaultValue: 1, min: 1 });

  const requestBody = {
    type: "autoplay",
    difficulty: 1,
    steps: normalizedSteps,
    amount: normalizedAmount,
    count: normalizedCount,
  };

  const requestPayload = {
    method: "POST",
    url: endpoint,
    gameId: normalizedGameId,
    body: requestBody,
  };

  if (isServerRelay(relay)) {
    relay.send("api:autoplay:request", requestPayload);
  }

  let response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "X-CASINOTV-TOKEN": sessionId,
        "X-CASINOTV-PROTOCOL-VERSION": "1.1",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (networkError) {
    if (isServerRelay(relay)) {
      relay.deliver("api:autoplay:response", {
        ok: false,
        error: networkError?.message ?? "Network error",
        request: requestPayload,
      });
    }
    throw networkError;
  }

  const rawBody = await response.text();
  let parsedBody = null;

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (error) {
      // Response body was not JSON; leave parsedBody as null.
    }
  }

  const responsePayload = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: parsedBody ?? rawBody,
    request: requestPayload,
  };

  if (!response.ok) {
    if (isServerRelay(relay)) {
      relay.deliver("api:autoplay:response", {
        ...responsePayload,
        ok: false,
        error: `Failed to submit autoplay: ${response.status} ${response.statusText}`,
      });
    }
    throw new Error(
      `Failed to submit autoplay: ${response.status} ${response.statusText}`
    );
  }

  if (!parsedBody || typeof parsedBody !== "object") {
    if (isServerRelay(relay)) {
      relay.deliver("api:autoplay:response", {
        ...responsePayload,
        ok: false,
        error: "Autoplay response was not valid JSON",
      });
    }
    throw new Error("Autoplay response was not valid JSON");
  }

  const isSuccess = Boolean(parsedBody?.IsSuccess);
  const responseData = parsedBody?.ResponseData ?? null;
  const state = responseData?.state ?? null;
  const status = state?.status ?? null;

  if (!responseData) {
    if (isServerRelay(relay)) {
      relay.deliver("api:autoplay:response", {
        ...responsePayload,
        ok: false,
        error: "Autoplay response did not include response data",
      });
    }
    throw new Error("Autoplay response did not include response data");
  }

  if (isServerRelay(relay)) {
    relay.deliver("api:autoplay:response", {
      ...responsePayload,
      ok: true,
      autoplay: {
        success: isSuccess,
        state,
        status,
      },
    });
  }

  return {
    isSuccess,
    responseData,
    state,
    raw: parsedBody,
  };
}

export async function submitStopAutoplay({
  url = DEFAULT_SERVER_URL,
  gameId = DEFAULT_SCRATCH_GAME_ID,
  relay,
} = {}) {
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    const error = new Error(
      "Cannot submit stop autoplay before the session id is initialized"
    );
    if (isServerRelay(relay)) {
      relay.deliver("api:stop-autoplay:response", {
        ok: false,
        error: error.message,
      });
    }
    throw error;
  }

  const baseUrl = normalizeBaseUrl(url);
  const normalizedGameId = normalizeScratchGameId(gameId);
  const endpoint = `${baseUrl}/post/${encodeURIComponent(normalizedGameId)}`;

  const requestBody = {
    type: "stop_autoplay",
  };

  const requestPayload = {
    method: "POST",
    url: endpoint,
    gameId: normalizedGameId,
    body: requestBody,
  };

  if (isServerRelay(relay)) {
    relay.send("api:stop-autoplay:request", requestPayload);
  }

  let response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "X-CASINOTV-TOKEN": sessionId,
        "X-CASINOTV-PROTOCOL-VERSION": "1.1",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (networkError) {
    if (isServerRelay(relay)) {
      relay.deliver("api:stop-autoplay:response", {
        ok: false,
        error: networkError?.message ?? "Network error",
        request: requestPayload,
      });
    }
    throw networkError;
  }

  const rawBody = await response.text();
  let parsedBody = null;

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (error) {
      // Response body was not JSON; leave parsedBody as null.
    }
  }

  const responsePayload = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: parsedBody ?? rawBody,
    request: requestPayload,
  };

  if (!response.ok) {
    if (isServerRelay(relay)) {
      relay.deliver("api:stop-autoplay:response", {
        ...responsePayload,
        ok: false,
        error: `Failed to submit stop autoplay: ${response.status} ${response.statusText}`,
      });
    }
    throw new Error(
      `Failed to submit stop autoplay: ${response.status} ${response.statusText}`
    );
  }

  if (!parsedBody || typeof parsedBody !== "object") {
    if (isServerRelay(relay)) {
      relay.deliver("api:stop-autoplay:response", {
        ...responsePayload,
        ok: false,
        error: "Stop autoplay response was not valid JSON",
      });
    }
    throw new Error("Stop autoplay response was not valid JSON");
  }

  const isSuccess = Boolean(parsedBody?.IsSuccess);
  const responseData = parsedBody?.ResponseData ?? null;

  if (!responseData) {
    if (isServerRelay(relay)) {
      relay.deliver("api:stop-autoplay:response", {
        ...responsePayload,
        ok: false,
        error: "Stop autoplay response did not include response data",
      });
    }
    throw new Error("Stop autoplay response did not include response data");
  }

  if (isServerRelay(relay)) {
    relay.deliver("api:stop-autoplay:response", {
      ...responsePayload,
      ok: true,
      stopAutoplay: {
        success: isSuccess,
        responseData,
      },
    });
  }

  return {
    isSuccess,
    responseData,
    raw: parsedBody,
  };
}

export async function submitCashout({
  url = DEFAULT_SERVER_URL,
  gameId = DEFAULT_SCRATCH_GAME_ID,
  relay,
} = {}) {
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    const error = new Error("Cannot submit cashout before the session id is initialized");
    if (isServerRelay(relay)) {
      relay.deliver("api:cashout:response", {
        ok: false,
        error: error.message,
      });
    }
    throw error;
  }

  const baseUrl = normalizeBaseUrl(url);
  const normalizedGameId = normalizeScratchGameId(gameId);
  const endpoint = `${baseUrl}/post/${encodeURIComponent(normalizedGameId)}`;

  const requestBody = {
    type: "cashout",
  };

  const requestPayload = {
    method: "POST",
    url: endpoint,
    gameId: normalizedGameId,
    body: requestBody,
  };

  if (isServerRelay(relay)) {
    relay.send("api:cashout:request", requestPayload);
  }

  let response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "X-CASINOTV-TOKEN": sessionId,
        "X-CASINOTV-PROTOCOL-VERSION": "1.1",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (networkError) {
    if (isServerRelay(relay)) {
      relay.deliver("api:cashout:response", {
        ok: false,
        error: networkError?.message ?? "Network error",
        request: requestPayload,
      });
    }
    throw networkError;
  }

  const rawBody = await response.text();
  let parsedBody = null;

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (error) {
      // Response body was not JSON; leave parsedBody as null.
    }
  }

  const responsePayload = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: parsedBody ?? rawBody,
    request: requestPayload,
  };

  if (!response.ok) {
    if (isServerRelay(relay)) {
      relay.deliver("api:cashout:response", {
        ...responsePayload,
        ok: false,
        error: `Failed to submit cashout: ${response.status} ${response.statusText}`,
      });
    }
    throw new Error(
      `Failed to submit cashout: ${response.status} ${response.statusText}`
    );
  }

  if (!parsedBody || typeof parsedBody !== "object") {
    if (isServerRelay(relay)) {
      relay.deliver("api:cashout:response", {
        ...responsePayload,
        ok: false,
        error: "Cashout response was not valid JSON",
      });
    }
    throw new Error("Cashout response was not valid JSON");
  }

  const isSuccess = Boolean(parsedBody?.IsSuccess);
  const responseData = parsedBody?.ResponseData ?? null;
  const state = responseData?.state ?? null;

  if (!responseData) {
    if (isServerRelay(relay)) {
      relay.deliver("api:cashout:response", {
        ...responsePayload,
        ok: false,
        error: "Cashout response did not include response data",
      });
    }
    throw new Error("Cashout response did not include response data");
  }

  if (isServerRelay(relay)) {
    relay.deliver("api:cashout:response", {
      ...responsePayload,
      ok: isSuccess,
      cashout: {
        success: isSuccess,
        state,
      },
    });
  }

  if (!isSuccess) {
    throw new Error("Cashout response indicated failure");
  }

  return {
    isSuccess,
    responseData,
    state,
    raw: parsedBody,
  };
}

export async function leaveGameSession({
  url = DEFAULT_SERVER_URL,
  gameId = DEFAULT_SCRATCH_GAME_ID,
  relay,
  keepalive = false,
} = {}) {
  const baseUrl = normalizeBaseUrl(url);
  const normalizedGameId = normalizeScratchGameId(gameId);
  const endpoint = `${baseUrl}/leave/${encodeURIComponent(normalizedGameId)}/`;

  const requestPayload = {
    method: "POST",
    url: endpoint,
    gameId: normalizedGameId,
  };

  if (isServerRelay(relay)) {
    relay.send("api:leave:request", requestPayload);
  }

  let response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
      },
      keepalive: Boolean(keepalive),
    });
  } catch (networkError) {
    if (isServerRelay(relay)) {
      relay.deliver("api:leave:response", {
        ok: false,
        error: networkError?.message ?? "Network error",
        request: requestPayload,
      });
    }
    throw networkError;
  }

  const rawBody = await response.text();
  let parsedBody = null;

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (error) {
      // Response body was not JSON; leave parsedBody as null.
    }
  }

  const responsePayload = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: parsedBody ?? rawBody,
    request: requestPayload,
  };

  if (!response.ok) {
    if (isServerRelay(relay)) {
      relay.deliver("api:leave:response", {
        ...responsePayload,
        ok: false,
        error: `Failed to leave game session: ${response.status} ${response.statusText}`,
      });
    }
    throw new Error(
      `Failed to leave game session: ${response.status} ${response.statusText}`
    );
  }

  let isSuccess = false;
  let message = null;
  let responseCode = null;
  let responseData = null;

  if (parsedBody && typeof parsedBody === "object") {
    isSuccess = Boolean(parsedBody?.IsSuccess ?? parsedBody?.success ?? false);
    message = parsedBody?.Message ?? null;
    responseCode = parsedBody?.ResponseCode ?? null;
    responseData = parsedBody?.ResponseData ?? null;
  } else if (!rawBody) {
    isSuccess = true;
  }

  if (!isSuccess) {
    if (isServerRelay(relay)) {
      relay.deliver("api:leave:response", {
        ...responsePayload,
        ok: false,
        error: "Leave game session response did not indicate success",
      });
    }
    throw new Error("Leave game session response did not indicate success");
  }

  sessionGameDetails = null;
  sessionGameUrl = null;
  sessionUserToken = null;

  if (isServerRelay(relay)) {
    relay.deliver("api:leave:response", {
      ...responsePayload,
      ok: true,
      result: {
        isSuccess,
        message,
        responseCode,
        responseData,
      },
    });
  }

  return {
    isSuccess,
    message,
    responseCode,
    responseData,
    raw: parsedBody ?? rawBody,
  };
}


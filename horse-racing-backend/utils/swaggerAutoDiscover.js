'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Tag mapping: base-path prefix → Swagger tag name ─────────────────────────
const TAG_MAP = {
  '/api/auth':               'Auth',
  '/api/admin':              'Admin',
  '/api/users':              'Users',
  '/users':                  'Users (Legacy)',
  '/api/tournaments':        'Tournaments',
  '/api/rounds':             'Rounds',
  '/api/races':              'Races',
  '/api/registrations':      'Registrations',
  '/api/jockey-assignments': 'Jockey Assignments',
  '/api/race-results':       'Race Results',
  '/api/prizes':             'Prizes',
  '/api/bets':               'Bets',
  '/api/violations':         'Violations',
  '/api/referees':           'Referees',
  '/api/jockeys':            'Jockeys',
  '/api/horse-owner':        'Horse Owner',
  '/api/horse-checks':       'Horse Checks',
  '/api/referee-reports':    'Referee Reports',
  '/api/internal':           'Internal (Race Engine)',
  '/api/wallet':             'Wallet',
  '/api/rewards':            'Rewards',
  '/api/deposit':            'Deposit — Spectator',
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Static Validator Source Parser
// Reads a validator function's source code and extracts field definitions.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Infer the OpenAPI type of a field from surrounding source code context.
 * Heuristics (order matters — first match wins):
 *   - boolean  : body.field === true/false, typeof x === 'boolean'
 *   - integer  : Number(body.field) + isInteger, token_amount, bonus, stake_amount
 *   - number   : Number(body.field) + isFinite, vnd_price, price, amount
 *   - ObjectId : isObjectId(x), _id suffix, race_id / horse_id / user_id pattern
 *   - array    : Array.isArray(body.field), documents, items, list
 *   - string   : default
 */
function inferFieldType(fieldName, surroundingSource) {
  const n = fieldName.toLowerCase();

  // Explicit string fields — must come before ObjectId check
  // These contain '_id' or look numeric but are actually string identifiers
  const explicitStrings = [
    'package_id', 'payment_method', 'method', 'type', 'status',
    'phase', 'role', 'gender', 'breed', 'color', 'document_type',
    'reason', 'note', 'description', 'title', 'label', 'name',
    'email', 'password', 'token', 'otp', 'url', 'address', 'code',
  ];
  if (explicitStrings.includes(n)) return 'string';

  // Boolean checks
  if (
    surroundingSource.includes(`typeof body.${fieldName} !== 'boolean'`) ||
    surroundingSource.includes(`typeof body['${fieldName}'] !== 'boolean'`) ||
    /^is_|_active$|_public$|_verified$|^enabled$|^disabled$/.test(n)
  ) return 'boolean';

  // ObjectId checks (only for pure _id suffix, not compound like package_id)
  if (
    surroundingSource.includes(`isObjectId(body.${fieldName})`) ||
    surroundingSource.includes(`isObjectId(body['${fieldName}']`) ||
    /^[a-z]+_id$/.test(n) // e.g. race_id, horse_id, user_id — NOT package_id
  ) return 'objectId';

  // Array checks
  if (
    surroundingSource.includes(`Array.isArray(body.${fieldName})`) ||
    surroundingSource.includes(`Array.isArray(body['${fieldName}']`) ||
    /documents$|items$|list$|ids$|urls$|roles$|participants$/.test(n)
  ) return 'array';

  // Integer checks
  if (
    surroundingSource.includes(`Number.isInteger`) ||
    /token_amount$|bonus_token$|bonus$|stake_amount$|stake$|count$|quantity$|page$|limit$|year$|age$/.test(n)
  ) return 'integer';

  // Number checks
  if (
    (surroundingSource.includes(`Number(body.${fieldName})`) ||
     surroundingSource.includes(`Number(body['${fieldName}']`)) &&
    surroundingSource.includes('isFinite')
  ) return 'number';

  return 'string';
}

/**
 * Map inferred type to an OpenAPI schema + example.
 */
function typeToSchema(type, fieldName) {
  const n = fieldName.toLowerCase();
  switch (type) {
    case 'boolean':  return { type: 'boolean', example: true };
    case 'integer':  return { type: 'integer', example: 1 };
    case 'number':   return { type: 'number',  example: 1000 };
    case 'objectId': return { type: 'string',  pattern: '^[a-fA-F0-9]{24}$', example: '6673f1a2b9e4a12c3d8f0001' };
    case 'array':    return { type: 'array',   items: { type: 'object' }, example: [] };
    default: {
      // Give more useful string examples based on field name
      if (/email/.test(n))    return { type: 'string', format: 'email',    example: 'user@example.com' };
      if (/password/.test(n)) return { type: 'string', format: 'password', example: 'Password@123' };
      if (/name/.test(n))     return { type: 'string', example: 'Nguyễn Văn A' };
      if (/url/.test(n))      return { type: 'string', format: 'uri',      example: 'https://example.com/file.jpg' };
      if (/method/.test(n))   return { type: 'string', example: 'MOCK' };
      if (/token$/.test(n))   return { type: 'string', example: 'abc123token' };
      if (/otp$/.test(n))     return { type: 'string', example: '123456' };
      if (/status/.test(n))   return { type: 'string', example: 'active' };
      if (/type$/.test(n))    return { type: 'string', example: 'default' };
      if (/id$/.test(n))      return { type: 'string', example: 'PKG_50K' };
      return { type: 'string', example: '' };
    }
  }
}

/**
 * Parse a validator function's source text and extract body fields.
 *
 * Strategies (applied in order, results merged):
 *
 * 1. `req.validatedBody = { field: ... }` — most reliable, shows exact output fields.
 * 2. `errors.push({ field: 'field_name', message: '...' })` — required field names.
 * 3. `body.field_name` / `body['field_name']` accesses — all touched fields.
 *
 * Returns: Array<{ name: string, required: boolean, schema: object }>
 */
function parseValidatorSource(fnSource) {
  const fields = new Map(); // name → { required, schema }

  // ── Strategy 1: req.validatedBody = { k: v, ... } ────────────────────────
  const validatedBodyMatch = fnSource.match(/req\.validatedBody\s*=\s*\{([^}]+)\}/s);
  if (validatedBodyMatch) {
    const inner = validatedBodyMatch[1];
    // Match keys like:  full_name: fullName,  or  email: email,
    const keyRe = /([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g;
    let km;
    while ((km = keyRe.exec(inner)) !== null) {
      const name = km[1];
      if (name === 'roles' || name === 'profiles') continue; // server-set
      if (!fields.has(name)) {
        const type = inferFieldType(name, fnSource);
        fields.set(name, { required: true, schema: typeToSchema(type, name) });
      }
    }
  }

  // ── Strategy 2: errors.push({ field: 'name', message: 'name is required' }) ─
  const errorRe = /errors\.push\s*\(\s*\{[^}]*field\s*:\s*['"`]([a-zA-Z_][a-zA-Z0-9_/ ]*)['"`][^}]*message\s*:\s*['"`]([^'"` ]+)[^'"` ]*(?:is\s+required|must\s+be)/gi;
  let em;
  while ((em = errorRe.exec(fnSource)) !== null) {
    const rawName = em[1].split('/')[0].trim(); // handle 'pkg_id / custom' style
    if (!rawName || rawName.includes(' ')) continue;
    if (!fields.has(rawName)) {
      const type = inferFieldType(rawName, fnSource);
      fields.set(rawName, { required: true, schema: typeToSchema(type, rawName) });
    } else {
      fields.get(rawName).required = true;
    }
  }

  // ── Strategy 3: body.field_name accesses ─────────────────────────────────
  const bodyAccessRe = /body\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let ba;
  while ((ba = bodyAccessRe.exec(fnSource)) !== null) {
    const name = ba[1];
    // Skip noise
    if (['length', 'trim', 'toLowerCase', 'toUpperCase', 'split', 'includes', 'map'].includes(name)) continue;
    if (!fields.has(name)) {
      const type = inferFieldType(name, fnSource);
      // Strategy 3 fields are optional by default (strategy 1/2 set required)
      fields.set(name, { required: false, schema: typeToSchema(type, name) });
    }
  }

  return Array.from(fields.entries()).map(([name, meta]) => ({ name, ...meta }));
}

/**
 * Given a validator middleware function (from route stack), locate its source
 * file and parse the specific function block that corresponds to it.
 *
 * Returns null if the source cannot be resolved.
 */
function extractValidatorSchema(validatorFn) {
  try {
    // Get the source file path from the module that defines this function.
    // We find it by searching require.cache for a module that exports this fn.
    let sourceFile = null;
    for (const [filePath, mod] of Object.entries(require.cache)) {
      if (!filePath.includes('validators')) continue;
      if (!mod || !mod.exports) continue;
      const exports = mod.exports;
      for (const key of Object.keys(exports)) {
        if (exports[key] === validatorFn) {
          sourceFile = filePath;
          break;
        }
      }
      if (sourceFile) break;
    }

    if (!sourceFile) return null;

    const src   = fs.readFileSync(sourceFile, 'utf8');
    const fnName = validatorFn.name;
    if (!fnName) return null;

    // Extract the specific function block by name
    // Handles: function validateX(req, res, next) { ... }
    const fnStartRe = new RegExp(`function\\s+${fnName}\\s*\\([^)]*\\)\\s*\\{`, 'g');
    const startMatch = fnStartRe.exec(src);
    if (!startMatch) return null;

    // Walk forward from the opening { to find the matching closing }
    let depth  = 0;
    let i      = startMatch.index + startMatch[0].length - 1; // position of opening {
    const end  = src.length;
    while (i < end) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
      i++;
    }

    const fnSource = src.slice(startMatch.index, i + 1);
    const fields   = parseValidatorSource(fnSource);

    if (fields.length === 0) return null;

    // Build the OpenAPI requestBody schema
    const properties = {};
    const required   = [];
    for (const f of fields) {
      properties[f.name] = f.schema;
      if (f.required) required.push(f.name);
    }

    // Build a plausible example object
    const example = {};
    for (const f of fields) {
      example[f.name] = f.schema.example !== undefined ? f.schema.example : '';
    }

    return {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            ...(required.length ? { required } : {}),
            properties,
          },
          example,
        },
      },
    };
  } catch (_) {
    return null;
  }
}

/**
 * Generic fallback requestBody for POST/PUT/PATCH when no validator is found.
 */
function genericRequestBody(method) {
  return {
    required: method !== 'patch',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          description: 'Request body — fill in required fields as JSON.',
          additionalProperties: true,
        },
        example: {},
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: Route Introspection Helpers (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────

function deriveSummary(method, oaPath) {
  const m        = method.toUpperCase();
  const segments = oaPath.replace(/\{[^}]+\}/g, ':id').split('/').filter(Boolean);
  const last     = segments[segments.length - 1] || '';
  const hasParam = oaPath.includes('{');

  const verb = {
    GET:    hasParam ? 'Get'    : 'List',
    POST:   'Create / Submit',
    PUT:    'Update (full)',
    PATCH:  'Update (partial)',
    DELETE: 'Delete',
  }[m] || m;

  const resource = last
    .replace(/[{:]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  return `${verb} ${resource}`.trim();
}

function resolveTag(fullPath) {
  const sorted = Object.keys(TAG_MAP).sort((a, b) => b.length - a.length);
  for (const prefix of sorted) {
    if (fullPath.startsWith(prefix)) return TAG_MAP[prefix];
  }
  return 'General';
}

function toOpenApiPath(expressPath) {
  return expressPath.replace(/:([^/]+)/g, '{$1}');
}

function extractPathParams(oaPath) {
  const matches = oaPath.match(/\{([^}]+)\}/g) || [];
  return matches.map(m => ({
    name: m.slice(1, -1),
    in: 'path',
    required: true,
    schema: { type: 'string' },
    description: m.slice(1, -1) === 'id'
      ? 'MongoDB ObjectId (24-char hex)'
      : `Path parameter: ${m.slice(1, -1)}`,
  }));
}

function detectSecurity(middlewares) {
  let needsAuth = false;
  let roles     = [];

  for (const fn of middlewares) {
    const name = fn.name || fn.displayName || '';
    if (name === 'authenticate' || name === 'authenticateMiddleware') {
      needsAuth = true;
    }
    const src = fn.toString ? fn.toString() : '';
    if (src.includes('allowedRoles') || name.startsWith('authorize')) {
      needsAuth = true;
      const roleMatch = src.match(/allowedRoles\s*=\s*\[([^\]]+)\]/);
      if (roleMatch) {
        roles = roles.concat(
          roleMatch[1].split(',').map(r => r.replace(/['"` \n\r]/g, '')).filter(Boolean)
        );
      }
    }
  }

  return { needsAuth, roles: [...new Set(roles)] };
}

/**
 * Find the first validator middleware in a list (function that is
 * exported from a file inside the validators/ directory).
 */
function findValidatorFn(middlewares) {
  for (const fn of middlewares) {
    if (typeof fn !== 'function') continue;
    // Check if this function is exported from a validators/ module
    for (const [filePath, mod] of Object.entries(require.cache)) {
      if (!filePath.includes('validators')) continue;
      if (!mod || !mod.exports) continue;
      for (const key of Object.keys(mod.exports)) {
        if (mod.exports[key] === fn) return fn;
      }
    }
  }
  return null;
}

function extractRegexpPath(layer) {
  if (layer.regexp && layer.regexp.source) {
    const src   = layer.regexp.source;
    const match = src.match(/^\^\\\/([^\\?$]*)/);
    if (match) return '/' + match[1].replace(/\\\//g, '/').replace(/\/$/, '');
  }
  return '';
}

function walkLayer(layer, basePath, inheritedMiddlewares, records) {
  if (!layer) return;

  const layerPath = layer.route === undefined
    ? extractRegexpPath(layer)
    : '';

  if (layer.route) {
    const routePath  = basePath + toOpenApiPath(layer.route.path || '');
    const methodStack = layer.route.stack || [];

    const byMethod = {};
    for (const methodLayer of methodStack) {
      const method = methodLayer.method ? methodLayer.method.toLowerCase() : null;
      if (!method) continue;
      if (!byMethod[method]) byMethod[method] = [];
      byMethod[method].push(methodLayer.handle);
    }

    for (const [method, handlers] of Object.entries(byMethod)) {
      const allMw              = [...inheritedMiddlewares, ...handlers];
      const { needsAuth, roles } = detectSecurity(allMw);
      records.push({ method, path: routePath, needsAuth, roles, middlewares: allMw });
    }
    return;
  }

  if (layer.handle && layer.handle.stack) {
    const subPath = basePath + layerPath;
    const subMw   = [...inheritedMiddlewares];
    if (typeof layer.handle === 'function' && !layer.handle.stack) {
      subMw.push(layer.handle);
    }
    for (const subLayer of layer.handle.stack) {
      walkLayer(subLayer, subPath, subMw, records);
    }
    return;
  }

  if (typeof layer.handle === 'function') {
    inheritedMiddlewares.push(layer.handle);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: Main autoDiscover function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {import('express').Application} app
 * @param {object} baseSpec  - OpenAPI base spec from config/swagger.js
 * @param {Array<{prefix:string, router:object}>} routeRegistry
 * @returns {object} Merged OpenAPI spec
 */
function autoDiscover(app, baseSpec, routeRegistry) {
  const records = [];

  for (const { prefix, router } of routeRegistry) {
    const inheritedMw = [];
    for (const layer of (router.stack || [])) {
      if (layer.route === undefined && layer.handle && !layer.handle.stack) {
        inheritedMw.push(layer.handle);
        continue;
      }
      walkLayer(layer, prefix, [...inheritedMw], records);
    }
  }

  // ── Build OpenAPI paths from records ────────────────────────────────────────
  const autoPaths = {};

  for (const { method, path: rawPath, needsAuth, roles, middlewares } of records) {
    const oaPath = rawPath.replace(/\/+/g, '/');
    if (!autoPaths[oaPath]) autoPaths[oaPath] = {};

    const tag      = resolveTag(oaPath);
    const summary  = deriveSummary(method, oaPath);
    const params   = extractPathParams(oaPath);
    const security = needsAuth ? [{ BearerAuth: [] }] : [];

    const roleNote = roles.length
      ? `\n\n> 🔐 **Requires role:** \`${roles.join(' | ')}\``
      : needsAuth
        ? '\n\n> 🔐 **Requires:** valid JWT'
        : '\n\n> 🌐 **Public** — no authentication required';

    // ── requestBody for mutating methods ─────────────────────────────────────
    let requestBody;
    if (['post', 'put', 'patch'].includes(method)) {
      const validatorFn = findValidatorFn(middlewares);
      if (validatorFn) {
        requestBody = extractValidatorSchema(validatorFn) || genericRequestBody(method);
      } else {
        requestBody = genericRequestBody(method);
      }
    }

    autoPaths[oaPath][method] = {
      tags:        [tag],
      summary,
      description: `\`${method.toUpperCase()} ${oaPath}\`${roleNote}`,
      security,
      ...(params.length ? { parameters: params } : {}),
      ...(requestBody   ? { requestBody }         : {}),
      responses: {
        '200': { description: 'Success' },
        '201': { description: 'Created' },
        '400': { description: 'Bad request / validation error' },
        '401': { description: 'Unauthorized — missing or invalid JWT' },
        '403': { description: 'Forbidden — insufficient role' },
        '404': { description: 'Not found' },
        '422': { description: 'Unprocessable entity' },
        '500': { description: 'Internal server error' },
      },
    };
  }

  // ── Merge: JSDoc spec takes priority over auto-discovered entries ────────────
  const jsdocPaths = baseSpec.paths || {};
  const mergedPaths = { ...autoPaths };
  for (const [p, methods] of Object.entries(jsdocPaths)) {
    if (!mergedPaths[p]) mergedPaths[p] = {};
    for (const [m, op] of Object.entries(methods)) {
      mergedPaths[p][m] = op;
    }
  }

  // ── Collect all unique tags ──────────────────────────────────────────────────
  const tagSet = new Set((baseSpec.tags || []).map(t => t.name));
  for (const methods of Object.values(mergedPaths)) {
    for (const op of Object.values(methods)) {
      (op.tags || []).forEach(t => tagSet.add(t));
    }
  }
  const allTags = [...tagSet].sort().map(name => {
    const existing = (baseSpec.tags || []).find(t => t.name === name);
    return existing || { name };
  });

  return { ...baseSpec, tags: allTags, paths: mergedPaths };
}

module.exports = autoDiscover;

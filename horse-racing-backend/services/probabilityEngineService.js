const { execFile } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { promisify } = require('util');

const ApiError = require('../utils/ApiError');
const { PROBABILITY_MODEL } = require('../constants/probabilityModel');

const execFileAsync = promisify(execFile);
const writeFile = fs.promises.writeFile;
const readFile = fs.promises.readFile;
const mkdtemp = fs.promises.mkdtemp;
const rm = fs.promises.rm;

function getRuntimeDirectory() {
  return path.join(__dirname, '..', PROBABILITY_MODEL.RUNTIME_DIR);
}

function getPythonCommand() {
  return process.env.PROBABILITY_ENGINE_PYTHON || 'python';
}

function getEngineMode() {
  return String(process.env.PROBABILITY_ENGINE_MODE || 'local').trim().toLowerCase();
}

function getTimeoutMs() {
  const value = Number(process.env.PROBABILITY_ENGINE_TIMEOUT_MS || 30000);

  return Number.isFinite(value) && value > 0 ? value : 30000;
}

function wait(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

async function ensureRuntimeExists(runtimeDirectory) {
  if (!fs.existsSync(path.join(runtimeDirectory, 'engine', 'probability_engine.py'))) {
    throw new ApiError(500, 'Probability engine runtime is not available');
  }
}

function postJson(url, payload) {
  return new Promise(function(resolve, reject) {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const body = JSON.stringify(payload);
    const request = client.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: getTimeoutMs()
      },
      function(response) {
        const chunks = [];

        response.on('data', function(chunk) {
          chunks.push(chunk);
        });

        response.on('end', function() {
          const responseBody = Buffer.concat(chunks).toString('utf8');

          if (response.statusCode < 200 || response.statusCode >= 300) {
            return reject(new ApiError(502, 'Probability engine HTTP request failed', {
              status_code: response.statusCode,
              body: responseBody.slice(0, 2000)
            }));
          }

          try {
            return resolve(JSON.parse(responseBody));
          } catch (error) {
            return reject(new ApiError(502, 'Probability engine returned invalid JSON', {
              message: error.message,
              body: responseBody.slice(0, 2000)
            }));
          }
        });
      }
    );

    request.on('timeout', function() {
      request.destroy(new Error('Probability engine HTTP request timed out'));
    });

    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

function unwrapPredictionResponse(response) {
  const prediction = response && response.success === true && response.data ? response.data : response;

  if (!prediction || !Array.isArray(prediction.horses)) {
    throw new ApiError(502, 'Probability engine returned an invalid prediction payload');
  }

  return prediction;
}

async function predictRaceHttp(payload) {
  const engineUrl = String(process.env.PROBABILITY_ENGINE_URL || '').trim();

  if (!engineUrl) {
    throw new ApiError(500, 'PROBABILITY_ENGINE_URL is required when PROBABILITY_ENGINE_MODE=http');
  }

  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return unwrapPredictionResponse(await postJson(engineUrl, payload));
    } catch (error) {
      lastError = error;
      const upstreamStatus = error && error.details && Number(error.details.status_code);
      if (!(error instanceof ApiError) || ![502, 503].includes(upstreamStatus) || attempt === 2) {
        break;
      }
      await wait(1500 * (attempt + 1));
    }
  }

  if (lastError instanceof ApiError) {
    const upstreamStatus = lastError.details && Number(lastError.details.status_code);
    if (upstreamStatus === 503) {
      throw new ApiError(503, 'Probability engine is temporarily unavailable. Please retry in a moment.', lastError.details);
    }
    throw lastError;
  }

  throw new ApiError(502, 'Probability engine HTTP prediction failed', {
    message: String(lastError && (lastError.message || lastError) || 'Unknown engine error').slice(0, 2000)
  });
}

async function predictRaceLocal(payload) {
  const runtimeDirectory = getRuntimeDirectory();
  await ensureRuntimeExists(runtimeDirectory);

  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'race-odds-'));
  const inputPath = path.join(tempDirectory, 'input.json');
  const outputPath = path.join(tempDirectory, 'output.json');
  const pythonCode = [
    'import sys',
    'from engine.probability_engine import predict_from_file',
    'predict_from_file(sys.argv[1], sys.argv[2])'
  ].join('; ');

  try {
    await writeFile(inputPath, JSON.stringify(payload), 'utf8');
    await execFileAsync(
      getPythonCommand(),
      ['-c', pythonCode, inputPath, outputPath],
      {
        cwd: runtimeDirectory,
        timeout: getTimeoutMs(),
        windowsHide: true,
        maxBuffer: 1024 * 1024
      }
    );

    return JSON.parse(await readFile(outputPath, 'utf8'));
  } catch (error) {
    const message = error.stderr || error.message || 'Probability engine failed';
    throw new ApiError(502, 'Probability engine prediction failed', {
      message: String(message).slice(0, 2000)
    });
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

async function predictRace(payload) {
  if (getEngineMode() === 'http') {
    return predictRaceHttp(payload);
  }

  return predictRaceLocal(payload);
}

function getModelEvaluation() {
  return {
    model_name: PROBABILITY_MODEL.NAME,
    model_version: PROBABILITY_MODEL.VERSION,
    payout_factor: PROBABILITY_MODEL.PAYOUT_FACTOR,
    dataset: PROBABILITY_MODEL.DATASET,
    validation_metrics: PROBABILITY_MODEL.VALIDATION_METRICS,
    baseline_comparison: PROBABILITY_MODEL.BASELINE_COMPARISON
  };
}

module.exports = {
  getModelEvaluation,
  predictRace,
  _private: {
    getEngineMode,
    unwrapPredictionResponse
  }
};

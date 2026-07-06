import * as dotenv from 'dotenv';
import fetch, { Response } from 'node-fetch';
dotenv.config();

// A small hand-rolled client for the XenForo REST API. It replaces the old
// @votton/api-wrapper, which pulled in the deprecated `request` library (the
// source of a large batch of dependabot advisories). The public surface is kept
// identical so the call sites in bot.ts don't change: every method takes
// (args, _unused, callback) and the callback is invoked as
// (error, response, parsedJsonBody), matching the wrapper's parseJson mode.
//
// Unlike the old wrapper — which appended POST params to the query string
// WITHOUT url-encoding them — POST params are now sent as a proper
// application/x-www-form-urlencoded body (URLSearchParams handles the encoding).
// XenForo reads parameters from that body, so callers must pass raw values and
// must NOT pre-encode them.

// The forum sits behind Cloudflare and is reached via a local-origin bypass
// (see docker-compose extra_hosts); keep using the canonical XF_URL so the
// Host/SNI stays correct and TLS still validates.
const root = (process.env.XF_URL || '') + '/api/';
const baseHeaders = { 'XF-Api-Key': process.env.XF_API_KEY || '' };

type Callback = (error: any, response: Response | null, body: any) => void;

// Existing call sites pass (args, '', callback); tolerate (args, callback) too.
function pickCallback(a: unknown, b: unknown): Callback | undefined {
  if (typeof a === 'function') return a as Callback;
  if (typeof b === 'function') return b as Callback;
  return undefined;
}

// Fill ${name} placeholders in a path template from the args object, encoding
// each substituted value so it stays a single, safe path segment.
function fillPath(template: string, args: Record<string, any>): string {
  return template.replace(/\$\{(\w+)\}/g, (_match, key) => encodeURIComponent(String(args[key])));
}

// Build an x-www-form-urlencoded body, skipping undefined/null so callers can
// send just the fields they care about (e.g. updateThread with only prefix_id
// and title).
function form(fields: Record<string, any>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) {
      body.append(key, String(value));
    }
  }
  return body;
}

// Core request. node-fetch adds the urlencoded Content-Type automatically when
// the body is a URLSearchParams, so we only need to set the API key header.
async function request(method: 'GET' | 'POST', path: string, body: URLSearchParams | null, callback?: Callback): Promise<void> {
  try {
    const response = await fetch(root + path, {
      method,
      headers: baseHeaders,
      body: body ?? undefined,
    });

    const text = await response.text();
    let parsed: any = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // A non-JSON body almost always means the request was intercepted
        // upstream (e.g. a Cloudflare HTML challenge). Surface it as an error
        // rather than handing back unparsable text.
        if (callback) callback(new Error('XenForo returned a non-JSON response (HTTP ' + response.status + ')'), response, null);
        return;
      }
    }

    if (callback) callback(null, response, parsed);
  } catch (error) {
    if (callback) callback(error, null, null);
  }
}

const xenforo = {
  // --- GET endpoints ---
  getThreads(_args: any, extra?: any, callback?: Callback) {
    return request('GET', 'threads/', null, pickCallback(extra, callback));
  },
  getThread(args: any, extra?: any, callback?: Callback) {
    return request('GET', fillPath('threads/${id}/', args), null, pickCallback(extra, callback));
  },
  getUser(args: any, extra?: any, callback?: Callback) {
    return request('GET', fillPath('users/${id}/', args), null, pickCallback(extra, callback));
  },
  getForum(args: any, extra?: any, callback?: Callback) {
    return request('GET', fillPath('forums/${id}/threads/', args), null, pickCallback(extra, callback));
  },
  getMessage(args: any, extra?: any, callback?: Callback) {
    return request('GET', fillPath('posts/${id}/', args), null, pickCallback(extra, callback));
  },

  // --- POST endpoints (params sent as an x-www-form-urlencoded body) ---
  postMessage(args: any, extra?: any, callback?: Callback) {
    const body = form({ thread_id: args.thread_id, message: args.message });
    return request('POST', 'posts/', body, pickCallback(extra, callback));
  },
  updateThread(args: any, extra?: any, callback?: Callback) {
    const body = form({
      prefix_id: args.prefix_id,
      title: args.title,
      discussion_open: args.discussion_open,
      sticky: args.sticky,
      custom_fields: args.custom_fields,
      add_tags: args.add_tags,
      remove_tags: args.remove_tags,
    });
    return request('POST', fillPath('threads/${id}/', args), body, pickCallback(extra, callback));
  },
  setThreadTag(args: any, extra?: any, callback?: Callback) {
    const body = form({ ['custom_fields[' + args.tag_name + ']']: args.tag_value });
    return request('POST', fillPath('threads/${id}/', args), body, pickCallback(extra, callback));
  },
};

export default xenforo;

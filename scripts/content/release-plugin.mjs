// Vite plugin: deploys exactly one pinned content release into each immutable build.
//
// The channel comes from trusted, committed host configuration: `contentChannel` in launcher.config.json.
// Stable (no setting) is `production`, which publishes only digest-approved records. The preview branch
// sets `development`, which runs Codex's explicit development publisher (the equivalent of
// `npm run content:develop -- --enable-development-content`). Approval flags are never changed.
//
// Output, inside the build directory:  library/<channel>/current.json   { version, channel }
//                                       library/<channel>/releases/<version>/{catalog,records,locales,digests}
// Only the selected release is copied. Nothing is bundled into JavaScript; the client fetches the catalog,
// then the chosen record lazily. The publisher's version ledger lives in the ignored `.library/` directory,
// so an edited record without a content-version increase fails the build and the previous build stays live.
//
// Running inside `vite build` (not the long-lived service) means a fresh checkout and an already-running
// launcher service both pick it up without a service restart.
import path from 'node:path';
import { readFile, cp, mkdir, writeFile, access, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { publishLibrary } from './pipeline.mjs';

const CHANNELS = ['production', 'development'];

export async function readHostSettings(root) {
  let config = {};
  try { config = JSON.parse(await readFile(path.join(root, 'launcher.config.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const channel = config.contentChannel ?? 'production';
  if (!CHANNELS.includes(channel)) throw new Error('INVALID_CONTENT_CHANNEL');
  return { channel, firstPort: Number.isInteger(config.firstPort) ? config.firstPort : null };
}

async function exists(file) { try { await access(file); return true; } catch { return false; } }

/** Publish the configured channel and return { version, release } (release = local directory). */
export async function prepareRelease(root, channel) {
  const research = path.join(root, 'content/library/research');
  if (!await exists(path.join(research, 'manifest.json'))) return null; // trimmed fixtures without content
  const output = path.join(root, '.library');
  const result = await publishLibrary(research, output, channel === 'development' ? { channel, enableDevelopment: true } : { channel });
  const base = channel === 'development' ? path.join(output, 'development') : output;
  return { version: result.version, release: path.join(base, 'releases', result.version), published: result.published };
}

export function libraryRelease({ root }) {
  let settings;
  let devRelease = null;
  return {
    name: 'globe-library-release',
    async config() {
      settings = await readHostSettings(root);
      return { define: { __CONTENT_CHANNEL__: JSON.stringify(settings.channel), __FIRST_PORT__: JSON.stringify(settings.firstPort) } };
    },
    // The preview edition (development content) is named in the browser title and marked on screen.
    transformIndexHtml(html) {
      if (settings.channel !== 'development') return html;
      return html.replace('<title>Histography</title>', '<title>Histography Preview</title>')
        .replace('<body ', '<body data-edition="preview" ');
    },
    async writeBundle(options) {
      const prepared = await prepareRelease(root, settings.channel);
      if (!prepared) return;
      const target = path.join(options.dir, 'library', settings.channel);
      await mkdir(path.join(target, 'releases'), { recursive: true });
      await cp(prepared.release, path.join(target, 'releases', prepared.version), { recursive: true });
      await writeFile(path.join(target, 'current.json'), JSON.stringify({ version: prepared.version, channel: settings.channel }));
      // Counts only: no identities, clues or coordinates in build output.
      this.info?.(`content release ${settings.channel}: ${prepared.published} records`);
    },
    // Development server: the same layout, served strictly from the published release (404 otherwise).
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const prefix = `/library/${settings.channel}/`;
        if (!url.pathname.startsWith('/library/')) return next();
        const fail = (status) => { res.statusCode = status; res.end(); };
        try {
          if (!url.pathname.startsWith(prefix)) return fail(404);
          devRelease ??= await prepareRelease(root, settings.channel);
          if (!devRelease) return fail(404);
          const relative = url.pathname.slice(prefix.length);
          if (relative === 'current.json') {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ version: devRelease.version, channel: settings.channel }));
          }
          const releasePrefix = `releases/${devRelease.version}/`;
          if (!relative.startsWith(releasePrefix)) return fail(404);
          const file = path.resolve(devRelease.release, `.${path.sep}${relative.slice(releasePrefix.length)}`);
          if (!file.startsWith(devRelease.release + path.sep) || !file.endsWith('.json') || !(await stat(file)).isFile()) return fail(404);
          res.setHeader('Content-Type', 'application/json');
          createReadStream(file).on('error', () => res.destroy()).pipe(res);
        } catch { fail(404); }
      });
    },
  };
}

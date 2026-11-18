// Lets node:test load the app's TypeScript modules, whose relative imports omit the ".ts" extension
// (Next.js resolves them, plain Node does not). Loaded with --import in the npm test script.
import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (/^\\.{1,2}\\//.test(specifier) && !/\\.[cm]?[jt]s$/.test(specifier)) return next(specifier + '.ts', context);
    throw error;
  }
}`),
  import.meta.url,
);

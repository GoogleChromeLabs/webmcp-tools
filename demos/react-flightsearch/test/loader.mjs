/**
 * Custom ESM loader to resolve extensionless TypeScript imports in tests.
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (
      err.code === "ERR_MODULE_NOT_FOUND" &&
      (specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/"))
    ) {
      for (const ext of [".ts", ".tsx", ".js", ".json"]) {
        try {
          return await nextResolve(specifier + ext, context);
        } catch {
          // continue checking next extension
        }
      }
    }
    throw err;
  }
}

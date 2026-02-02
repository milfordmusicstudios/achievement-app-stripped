let utilsModulePromise = null;

async function loadUtilsModule() {
  if (utilsModulePromise) return utilsModulePromise;
  utilsModulePromise = import("./utils.js").catch(err => {
    console.warn("[nav] optional dependency failed; continuing in fallback mode", err);
    return null;
  });
  return utilsModulePromise;
}

export async function getViewerContextSafely() {
  const utils = await loadUtilsModule();
  if (!utils?.getViewerContext) return null;
  try {
    return await utils.getViewerContext();
  } catch (err) {
    console.warn("[nav] optional dependency failed; continuing in fallback mode", err);
    return null;
  }
}

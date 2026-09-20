import { cpSync, existsSync, realpathSync } from "node:fs";
import path from "node:path";

const appRoot = path.resolve(import.meta.dirname, "..");
const standaloneRoot = path.join(appRoot, ".next", "standalone");
const standaloneAppRoot = path.join(standaloneRoot, "apps", "web");

const sourceHelpers = realpathSync(path.join(appRoot, "node_modules", "@swc", "helpers"));
const tracedHelpersLink = path.join(
  standaloneRoot,
  "node_modules",
  ".pnpm",
  "node_modules",
  "@swc",
  "helpers",
);
if (!existsSync(tracedHelpersLink)) {
  throw new Error("Next standalone mangler den traced @swc/helpers-lenken");
}
const tracedHelpers = realpathSync(tracedHelpersLink);

// Node 24 velger package-exporten `module-sync`, mens Nexts tracer kan kopiere
// bare CJS-filen. Kopier den låste direkteavhengigheten komplett til artifactet.
// På Windows kan pnpm-junctions gjøre at begge stiene peker på samme fysiske
// mappe; da er kopien allerede oppfylt og cpSync ville kastet ERR_FS_CP_EINVAL.
if (sourceHelpers !== tracedHelpers) {
  cpSync(sourceHelpers, tracedHelpers, { force: true, recursive: true });
}
cpSync(path.join(appRoot, ".next", "static"), path.join(standaloneAppRoot, ".next", "static"), {
  force: true,
  recursive: true,
});

const publicDirectory = path.join(appRoot, "public");
if (existsSync(publicDirectory)) {
  cpSync(publicDirectory, path.join(standaloneAppRoot, "public"), {
    force: true,
    recursive: true,
  });
}

console.log("Standalone-pakken er komplett for Node 24.");

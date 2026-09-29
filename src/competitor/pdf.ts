/** PPTX → PDF through LibreOffice, with a throwaway profile so it runs headless anywhere soffice is installed. */
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export function toPdf(pptxPath: string, timeoutMs = 180_000): Promise<string> {
  const profile = mkdtempSync(join(tmpdir(), "lo_profile_"));
  const started = Date.now() - 1000;
  return new Promise((resolve, reject) => {
    execFile(
      process.env.SOFFICE_BIN ?? "soffice",
      [`-env:UserInstallation=${pathToFileURL(profile).href}`, "--headless", "--convert-to", "pdf", "--outdir", dirname(pptxPath), pptxPath],
      { timeout: timeoutMs, env: { ...process.env, SAL_USE_VCLPLUGIN: "svp" } },
      (err, _stdout, stderr) => {
        rmSync(profile, { recursive: true, force: true });
        const pdf = pptxPath.replace(/\.pptx$/i, ".pdf");
        // soffice exits 0 even when it cannot open the file (e.g. Impress not installed), so check the output
        if (err || !existsSync(pdf) || statSync(pdf).mtimeMs < started) reject(new Error(`soffice could not convert ${basename(pptxPath)}: ${err?.message ?? String(stderr).trim()}`));
        else resolve(pdf);
      },
    );
  });
}

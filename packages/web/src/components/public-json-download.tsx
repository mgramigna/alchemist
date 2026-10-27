import type { PublicScript, ScriptExportProblem } from "@alchemist/domain";
import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { CaretDownIcon, CopyIcon, DownloadSimpleIcon, GlobeIcon } from "@phosphor-icons/react";
import { Predicate } from "effect";
import { toast } from "sonner";
import { AsyncResult } from "effect/reactivity";
import { publicScriptExport } from "../api.ts";
import { scriptJsonUrl } from "../lib/json-url.ts";
import { downloadBlob } from "../lib/download.ts";
import { fieldLabel } from "../lib/fields.ts";
import { Button } from "./ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";

/** JSON eligibility is independent of sheet layout, fonts and capture. */
export function PublicJsonDownload({ script }: { readonly script: PublicScript }) {
  const query = publicScriptExport(script.id);
  const result = useAtomValue(query);
  const refresh = useAtomRefresh(query);

  const retry = (
    <div role="alert" className="flex flex-col items-start gap-2">
      <p>Couldn’t check the JSON export. Check your connection and try again.</p>
      <Button variant="outline" size="sm" onClick={refresh}>
        Retry JSON
      </Button>
    </div>
  );

  return (
    <section aria-labelledby="json-title" className="flex flex-col items-start gap-3">
      <h2 id="json-title" className="text-xl font-semibold">
        BOTC JSON
      </h2>
      {result.waiting ? (
        <p role="status">Checking JSON eligibility…</p>
      ) : (
        AsyncResult.matchWithError(result, {
          onInitial: () => <p role="status">Checking JSON eligibility…</p>,
          onError: (error) =>
            Predicate.isTagged(error, "ScriptExportInvalid") ? (
              <>
                <Button variant="outline" size="sm" disabled aria-describedby="json-blocked">
                  <DownloadSimpleIcon /> Export JSON <CaretDownIcon />
                </Button>
                <p id="json-blocked">JSON export is blocked. Ask the Script Owner to fix:</p>
                <ul
                  aria-label="JSON validation problems"
                  className="list-disc space-y-1 pl-5 text-sm"
                >
                  {error.problems.map((problem, index) => (
                    <li key={index} className="wrap-anywhere">
                      {problemLabel(problem, script)}: {problem.message}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-muted-foreground">
                  JSON validation does not block PNG downloads.
                </p>
              </>
            ) : Predicate.isTagged(error, "ScriptNotFound") ? (
              <p role="alert">This Script is no longer available. Reload to check the link.</p>
            ) : (
              retry
            ),
          onDefect: () => retry,
          onSuccess: ({ value }) => (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                  <DownloadSimpleIcon /> Export JSON <CaretDownIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => void copyJson(scriptJsonUrl(script.id), true)}>
                      <GlobeIcon /> Copy JSON URL
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void copyJson(value.json)}>
                      <CopyIcon /> Copy JSON
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        downloadBlob(
                          new Blob([value.json], { type: "application/json" }),
                          value.filename,
                        )
                      }
                    >
                      <DownloadSimpleIcon /> Download JSON
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <p className="text-sm text-muted-foreground">
                Copy or download the current saved Script in BOTC JSON format.
              </p>
            </>
          ),
        })
      )}
    </section>
  );
}

function problemLabel(problem: ScriptExportProblem, script: PublicScript) {
  const character = script.characters.find(({ id }) => id === problem.characterId);

  const prefix =
    problem.characterId === undefined ? "" : `${character?.name || "Unnamed Character"} · `;

  const token = problem.tokenIndex === undefined ? "" : ` ${problem.tokenIndex + 1}`;

  return `${prefix}${problem.field === "name" && !prefix ? "Script name" : fieldLabel(problem.field)}${token}`;
}

async function copyJson(json: string, url = false) {
  try {
    await navigator.clipboard.writeText(json);
    toast.success(url ? "JSON URL copied" : "JSON copied");
  } catch {
    toast.error(
      url
        ? "Couldn’t copy the JSON URL. Try again."
        : "Couldn’t copy JSON. Try again or download it instead.",
    );
  }
}

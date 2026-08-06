import { redirect } from "next/navigation";

// The diagrams library moved to /library in the shell redesign
// (docs/design/2026-08-06-shell-redesign/). This route survives for old bookmarks. The static
// assets still live under public/diagrams/ — exact file paths like /diagrams/index.html are
// served from public/ and never reach this route.
export default function DiagramsRedirect() {
  redirect("/library");
}

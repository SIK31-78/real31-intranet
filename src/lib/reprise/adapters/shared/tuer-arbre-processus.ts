// Tue un sous-processus ET tout son arbre de descendants (audit API 2026-07-16, P2-1).
//
// Contexte : les adapters CLI Claude lancent `claude -p` via spawn(..., { shell: true })
// sous Windows. Au timeout, child.kill() ne tuait que le SHELL intermediaire (cmd.exe) :
// l'enfant `claude` survivait en processus zombie (session/API toujours consommees, process
// orphelin a nettoyer a la main). `taskkill /T /F` tue le PID ET tous ses descendants.
// Hors Windows : SIGKILL sur le process (pas de shell intermediaire persistant dans nos
// usages ; les eventuels orphelins sont recuperes par init).

import { spawn, type ChildProcess } from "node:child_process";

export function tuerArbreProcessus(child: ChildProcess): void {
  if (child.pid == null) {
    child.kill();
    return;
  }
  if (process.platform === "win32") {
    try {
      // Detache et silencieux : on ne veut ni bloquer, ni polluer la sortie. Si taskkill
      // echoue (introuvable, PID deja mort), on retombe sur le kill simple - au pire on
      // retrouve le comportement d'avant, jamais pire.
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }).on(
        "error",
        () => child.kill(),
      );
    } catch {
      child.kill();
    }
  } else {
    child.kill("SIGKILL");
  }
}

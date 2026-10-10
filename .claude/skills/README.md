# Skill di progetto

Claude Code carica le skill di questa cartella quando apri il repository, nel cloud o sul tuo computer.

## motionmaxxing

- **Fonte:** [Tejashmakwana/motionmaxxing](https://github.com/Tejashmakwana/motionmaxxing), commit `8c8ec0f`, licenza Apache-2.0 (`motionmaxxing/LICENSE` e `motionmaxxing/NOTICE`). GSAP, three.js e i font inclusi restano sotto le loro licenze, elencate nel NOTICE.
- **Cosa c'è:** la skill come la installa il suo `install.sh --copy`, senza i video dimostrativi di `docs/media` (20 MB).
- **Come si usa:** in Claude Code chiedi una motion graphic, oppure scrivi `/motionmaxxing`.
- **Requisiti:** Node 22+, Python 3.9+, ffmpeg, Chrome. Facoltativa `ELEVENLABS_API_KEY` per voce e musica.
- **Nelle sessioni cloud** (dove si lavora come root) Chrome parte solo senza sandbox. Prima di usarla:

  ```sh
  export CHROME_PATH="$PWD/.claude/chrome-cloud.sh"
  ```

  Sul Mac non serve.
- **Per aggiornarla:**

  ```sh
  git clone --depth 1 https://github.com/Tejashmakwana/motionmaxxing /tmp/motionmaxxing
  bash /tmp/motionmaxxing/install.sh --dir "$PWD/.claude/skills/motionmaxxing" --copy --force
  ```

  Poi correggi qui sopra il numero del commit.

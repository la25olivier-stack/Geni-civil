#!/usr/bin/env python3
"""Point d'entrée pratique : `python run.py [options]`.

Ajoute `src/` au chemin d'import puis délègue à la CLI du paquet.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from appels_offres.cli import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())

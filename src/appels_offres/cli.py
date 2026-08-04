"""Interface en ligne de commande de l'agent de veille."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from .agent import Agent
from .config import Config


def _configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="appels-offres",
        description="Agent de veille des appels d'offres (SEAO, MERX, etc.).",
    )
    parser.add_argument(
        "-c", "--config", default="config/config.yaml",
        help="Chemin du fichier de configuration YAML.",
    )
    parser.add_argument(
        "--no-email", action="store_true",
        help="Ne pas envoyer de courriel (produit seulement le digest).",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Aucun envoi, aucune écriture d'état ni de digest ; affiche à l'écran.",
    )
    parser.add_argument(
        "--timeout", type=int, default=30,
        help="Délai réseau par source (secondes).",
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true", help="Journalisation détaillée.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    _configure_logging(args.verbose)

    config_path = Path(args.config)
    if not config_path.exists():
        print(f"Configuration introuvable : {config_path}", file=sys.stderr)
        return 2

    config = Config.load(config_path)
    agent = Agent(config)

    result = agent.run(
        timeout=args.timeout,
        deliver=not (args.no_email or args.dry_run),
        write_digest=not args.dry_run,
        update_state=not args.dry_run,
    )

    print(result.text)
    print("-" * 60, file=sys.stderr)
    print(
        f"Collectés: {result.collected} | Pertinents nouveaux: {len(result.relevant)}",
        file=sys.stderr,
    )
    if result.digest_path:
        print(f"Digest: {result.digest_path}", file=sys.stderr)
    if result.email_sent:
        print(f"Courriel envoyé à {config.email.recipient}", file=sys.stderr)
    elif result.email_error:
        print(f"Courriel non envoyé: {result.email_error}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

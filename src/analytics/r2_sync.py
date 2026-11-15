"""Sincronización entre data/processed/ y Cloudflare R2 (API compatible con S3).

- `download`: solo stdlib, vía URL pública del bucket (sin credenciales). Pensado para
  correr en infra/azure/startup.sh al arrancar el contenedor (lectura, nunca por petición HTTP).
- `upload`: requiere credenciales R2 (Access Key/Secret) y boto3; uso exclusivo manual/CI
  desde una máquina de desarrollo, nunca en el backend desplegado.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import os
from typing import Iterable
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

DEFAULT_ARTIFACTS: tuple[str, ...] = (
    "metadata.json",
    "territories.geojson",
    "activity_daily.json",
    "activity_summary.json",
    "sensor_comparison.json",
    "conditions_assessment.json",
)
OPTIONAL_ARTIFACTS: tuple[str, ...] = ("hotspots.geojson",)


def _content_type_for(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".geojson":
        return "application/geo+json"
    if suffix == ".json":
        return "application/json"
    if suffix == ".csv":
        return "text/csv; charset=utf-8"
    return "application/octet-stream"


def resolve_r2_public_base_url(base_url: str | None = None) -> str | None:
    """Resuelve la URL pública base del bucket R2 (solo lectura, sin firma)."""
    url = (base_url or os.getenv("R2_PUBLIC_BASE_URL") or "").strip().rstrip("/")
    return url or None


def build_object_url(base_url: str, name: str, *, prefix: str = "") -> str:
    parts = urllib_parse.urlsplit(base_url.strip())
    if parts.scheme != "https":
        raise ValueError(f"Esquema de URL no permitido para R2 público: {parts.scheme!r}")
    clean_prefix = prefix.strip("/")
    clean_name = name.lstrip("/")
    rel = f"{clean_prefix}/{clean_name}" if clean_prefix else clean_name
    base_path = parts.path.rstrip("/")
    new_path = f"{base_path}/{rel}" if base_path else f"/{rel}"
    return urllib_parse.urlunsplit((parts.scheme, parts.netloc, new_path, "", ""))


def download_processed_snapshot(
    target_dir: Path,
    *,
    base_url: str | None = None,
    prefix: str | None = None,
    only_if_missing: bool = False,
    artifacts: Iterable[str] = DEFAULT_ARTIFACTS,
    optional_artifacts: Iterable[str] = OPTIONAL_ARTIFACTS,
    timeout_sec: int = 30,
) -> list[Path]:
    """Descarga los artefactos procesados hacia target_dir desde la URL pública de R2."""
    required_list = list(artifacts)
    optional_list = list(optional_artifacts)

    if only_if_missing and all(
        (target_dir / name).is_file() and (target_dir / name).stat().st_size > 0 for name in required_list
    ):
        return []

    resolved = resolve_r2_public_base_url(base_url)
    if not resolved:
        raise ValueError("Falta R2_PUBLIC_BASE_URL (ej. https://pub-xxxxxxxx.r2.dev).")

    eff_prefix = os.getenv("R2_PREFIX", "") if prefix is None else prefix
    target_dir.mkdir(parents=True, exist_ok=True)
    downloaded: list[Path] = []

    for name in required_list + optional_list:
        dest = target_dir / name
        if only_if_missing and dest.is_file() and dest.stat().st_size > 0:
            continue
        obj_url = build_object_url(resolved, name, prefix=eff_prefix)
        req = urllib_request.Request(obj_url, method="GET")
        try:
            with urllib_request.urlopen(req, timeout=timeout_sec) as resp:
                data = resp.read()
        except urllib_error.HTTPError as exc:
            if exc.code == 404 and name in optional_list:
                continue
            raise
        tmp_path = dest.with_suffix(dest.suffix + ".tmp")
        tmp_path.write_bytes(data)
        tmp_path.replace(dest)
        downloaded.append(dest)

    return downloaded


def upload_directory_objects(
    source_dir: Path,
    *,
    account_id: str | None = None,
    access_key_id: str | None = None,
    secret_access_key: str | None = None,
    bucket: str | None = None,
    prefix: str | None = None,
    pattern: str = "*.json*",
) -> list[str]:
    """Sube archivos locales a R2 usando la API S3 (requiere boto3; solo uso manual/CI)."""
    try:
        import boto3  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "Falta boto3 para subir a R2. Instálalo solo en tu máquina/CI: pip install boto3"
        ) from exc

    acct = (account_id or os.getenv("R2_ACCOUNT_ID") or "").strip()
    key = (access_key_id or os.getenv("R2_ACCESS_KEY_ID") or "").strip()
    secret = (secret_access_key or os.getenv("R2_SECRET_ACCESS_KEY") or "").strip()
    bkt = (bucket or os.getenv("R2_BUCKET") or "").strip()
    if not (acct and key and secret and bkt):
        raise ValueError(
            "Faltan credenciales R2: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET."
        )

    eff_prefix = os.getenv("R2_PREFIX", "") if prefix is None else prefix
    client = boto3.client(
        "s3",
        endpoint_url=f"https://{acct}.r2.cloudflarestorage.com",
        aws_access_key_id=key,
        aws_secret_access_key=secret,
        region_name="auto",
    )

    uploaded: list[str] = []
    for path in sorted(source_dir.glob(pattern)):
        if not path.is_file():
            continue
        key_name = f"{eff_prefix.strip('/')}/{path.name}" if eff_prefix else path.name
        client.upload_file(
            str(path),
            bkt,
            key_name,
            ExtraArgs={"ContentType": _content_type_for(path)},
        )
        uploaded.append(path.name)
    return uploaded


def main() -> None:
    parser = argparse.ArgumentParser(description="McHanaq Cloudflare R2 Sync")
    sub = parser.add_subparsers(dest="command", required=True)

    p_down = sub.add_parser("download", help="Descargar snapshot de data/processed/ desde R2 (público)")
    p_down.add_argument("--target", type=Path, default=Path("data/processed"))
    p_down.add_argument("--prefix", type=str, default=None)
    p_down.add_argument("--if-missing", action="store_true")

    p_up = sub.add_parser("upload", help="Subir artefactos locales hacia R2 (requiere boto3 + credenciales)")
    p_up.add_argument("--source", type=Path, default=Path("data/processed"))
    p_up.add_argument("--prefix", type=str, default=None)
    p_up.add_argument("--pattern", type=str, default="*.json*")

    args = parser.parse_args()
    if args.command == "download":
        if args.if_missing and not resolve_r2_public_base_url():
            print("R2 no configurado; usando artefactos locales en", args.target)
            return
        files = download_processed_snapshot(args.target, prefix=args.prefix, only_if_missing=args.if_missing)
        print(f"OK r2_sync download: {len(files)} archivos -> {args.target}")
    elif args.command == "upload":
        names = upload_directory_objects(args.source, prefix=args.prefix, pattern=args.pattern)
        print(f"OK r2_sync upload: {len(names)} archivos desde {args.source}")


if __name__ == "__main__":
    main()
